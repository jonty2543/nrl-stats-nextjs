import { NextResponse } from "next/server";
import {
  fetchAvailableYearsFromSupabase,
  fetchPlayerStatsFromSupabase,
  fetchTeamStatsFromSupabase,
} from "@/lib/supabase/queries";
import { buildStatsTableCache, writeStatsTableCache } from "@/lib/data/stats-table-cache";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function fetchAllPlayerRows(years: string[]) {
  try {
    return await fetchPlayerStatsFromSupabase(years);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!message.includes("statement timeout")) throw error;

    const rows = [];
    for (const year of [...years].sort((a, b) => a.localeCompare(b))) {
      rows.push(...(await fetchPlayerStatsFromSupabase([year])));
    }
    return rows;
  }
}

async function rebuild() {
  const years = await fetchAvailableYearsFromSupabase();
  const [playerRows, teamRows] = await Promise.all([
    fetchAllPlayerRows(years),
    fetchTeamStatsFromSupabase(years),
  ]);
  const payload = buildStatsTableCache(playerRows, teamRows);
  const result = await writeStatsTableCache(payload);

  return {
    ok: true,
    updatedAt: payload.updatedAt,
    years: result.years,
    playerBaseRowCount: result.playerRowCount,
    teamBaseRowCount: result.teamRowCount,
    path: result.path,
    storageBucket: result.storageBucket,
    storagePrefix: result.storagePrefix,
  };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await rebuild());
  } catch (error) {
    console.error("Rebuild stats table cache failed:", error);
    const details =
      process.env.NODE_ENV !== "production"
        ? error instanceof Error
          ? error.message
          : String(error)
        : undefined;
    return NextResponse.json(
      { ok: false, error: "Failed to rebuild stats table cache", details },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
