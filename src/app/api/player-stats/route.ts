import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getServerProPlotAccess } from "@/lib/access/pro-access-server";
import { fetchAvailableYears, fetchFantasyPlayerStatsForYears, fetchPlayerStats } from "@/lib/supabase/queries";
import { isAccessibleSeason } from "@/lib/access/season-access";

export async function GET(request: NextRequest) {
  try {
    const startedAt = performance.now();
    const { userId } = await auth();
    const canAccessLoginSeason = Boolean(userId);
    const canAccessProSeason = await getServerProPlotAccess(userId);
    const accessResolvedAt = performance.now();
    const { searchParams } = request.nextUrl;
    const yearsParam = searchParams.get("years");
    const playerParam = searchParams.get("player")?.trim();
    const isFantasyContext = searchParams.get("context") === "fantasy";
    const requestedYears = yearsParam
      ? yearsParam
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : null;

    const allowedYears = requestedYears
      ? isFantasyContext
        ? requestedYears
        : requestedYears.filter((year) =>
            isAccessibleSeason(year, canAccessLoginSeason, "stats", canAccessProSeason)
          )
      : isFantasyContext
        ? await fetchAvailableYears()
        : (await fetchAvailableYears()).filter((year) =>
            isAccessibleSeason(year, canAccessLoginSeason, "stats", canAccessProSeason)
          );

    if (allowedYears.length === 0) {
      return NextResponse.json([]);
    }

    const data = playerParam
      ? await fetchFantasyPlayerStatsForYears(playerParam, allowedYears)
      : await fetchPlayerStats(allowedYears);
    const dataResolvedAt = performance.now();
    const response = NextResponse.json(data);
    response.headers.set("x-player-stats-mode", playerParam ? "player" : "bulk");
    response.headers.set("x-player-stats-count", String(Array.isArray(data) ? data.length : 0));
    response.headers.set("x-player-stats-access-ms", String(Math.round(accessResolvedAt - startedAt)));
    response.headers.set("x-player-stats-data-ms", String(Math.round(dataResolvedAt - accessResolvedAt)));
    response.headers.set("x-player-stats-ms", String(Math.round(dataResolvedAt - startedAt)));
    return response;
  } catch (error) {
    console.error("Error fetching player stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch player stats" },
      { status: 500 }
    );
  }
}
