import { NextResponse } from "next/server";
import {
  fetchAvailableYearsFromSupabase,
  fetchPlayerStatsFromSupabase,
} from "@/lib/supabase/queries";
import { writePlayerStatsServerCache } from "@/lib/data/player-stats-server-cache";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

async function rebuild() {
  const years = await fetchAvailableYearsFromSupabase();
  const rows = await fetchPlayerStatsFromSupabase(years);
  const result = await writePlayerStatsServerCache(rows);

  return {
    ok: true,
    rowCount: result.rowCount,
    years: result.years,
    updatedAt: new Date().toISOString(),
    path: result.path,
    storageBucket: result.storageBucket ?? null,
    storagePrefix: result.storagePrefix ?? null,
    storageChunkCount: result.storageChunkCount ?? 0,
  };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await rebuild());
  } catch (error) {
    console.error("Rebuild player stats server cache failed:", error);
    const details =
      process.env.NODE_ENV !== "production"
        ? error instanceof Error
          ? error.message
          : String(error)
        : undefined;
    return NextResponse.json(
      { ok: false, error: "Failed to rebuild player stats server cache", details },
      { status: 500 }
    );
  }
}

// Allow manual browser trigger in local dev for now.
export async function GET(request: Request) {
  return POST(request);
}
