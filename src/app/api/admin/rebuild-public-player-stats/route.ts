import { NextResponse } from "next/server";
import {
  fetchAvailableYearsFromSupabase,
  fetchPlayerStatsFromSupabase,
} from "@/lib/supabase/queries";
import { writePlayerStatsServerCache } from "@/lib/data/player-stats-server-cache";

export const dynamic = "force-dynamic";

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
  };
}

export async function POST() {
  try {
    return NextResponse.json(await rebuild());
  } catch (error) {
    console.error("Rebuild player stats server cache failed:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to rebuild player stats server cache" },
      { status: 500 }
    );
  }
}

// Allow manual browser trigger in local dev for now.
export async function GET() {
  return POST();
}
