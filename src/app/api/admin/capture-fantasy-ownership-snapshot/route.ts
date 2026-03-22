import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { fetchFantasyPlayersSnapshot } from "@/lib/fantasy/nrl";

export const dynamic = "force-dynamic";

const SNAPSHOT_TYPE = "weekly_sunday_11pm_brisbane";

interface OwnershipSnapshotPoint {
  playerId: number;
  name: string;
  ownedBy: number | null;
}

function isAuthorized(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

function getBrisbaneDateKey(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

async function captureSnapshot() {
  const players = await fetchFantasyPlayersSnapshot();
  const snapshotData: OwnershipSnapshotPoint[] = players.map((player) => ({
    playerId: player.id,
    name: player.name,
    ownedBy: player.ownedBy,
  }));

  const now = new Date();
  const capturedAt = now.toISOString();
  const snapshotWeekBrisbane = getBrisbaneDateKey(now);

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .schema("shortside")
    .from("fantasy_ownership_snapshots")
    .upsert(
      {
        snapshot_type: SNAPSHOT_TYPE,
        snapshot_week_brisbane: snapshotWeekBrisbane,
        captured_at: capturedAt,
        snapshot_data: snapshotData,
      },
      { onConflict: "snapshot_type,snapshot_week_brisbane" }
    );

  if (error) {
    throw new Error(`Failed to save fantasy ownership snapshot: ${error.message}`);
  }

  return {
    ok: true,
    snapshotType: SNAPSHOT_TYPE,
    snapshotWeekBrisbane,
    capturedAt,
    playerCount: snapshotData.length,
  };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await captureSnapshot());
  } catch (error) {
    console.error("Capture fantasy ownership snapshot failed:", error);
    const details =
      process.env.NODE_ENV !== "production"
        ? error instanceof Error
          ? error.message
          : String(error)
        : undefined;
    return NextResponse.json(
      { ok: false, error: "Failed to capture fantasy ownership snapshot", details },
      { status: 500 }
    );
  }
}

// Allow manual browser trigger in local dev for now.
export async function GET(request: Request) {
  return POST(request);
}
