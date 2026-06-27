import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getServerProPlotAccess } from "@/lib/access/pro-access-server";
import { isAccessibleSeason } from "@/lib/access/season-access";
import {
  fetchPlayerStats,
  fetchTeamStats,
} from "@/lib/supabase/queries";
import {
  buildStatsTableCache,
  readStatsTableCache,
  selectPlayerStatsTableRows,
  selectTeamStatsTableRows,
} from "@/lib/data/stats-table-cache";
import type {
  PlayerStatsTableAggregateRow,
  PlayerStatsTableGroupBy,
  StatsTableApiResponse,
  TeamStatsTableAggregateRow,
  TeamStatsTableGroupBy,
} from "@/lib/data/stats-table-cache-types";

export const dynamic = "force-dynamic";

const PLAYER_GROUPS: PlayerStatsTableGroupBy[] = ["Player", "Year + Player", "Team + Player", "Position + Player"];
const TEAM_GROUPS: TeamStatsTableGroupBy[] = ["Team", "Year + Team"];

function parseYears(value: string | null): string[] {
  return value
    ? value
        .split(",")
        .map((year) => year.trim())
        .filter(Boolean)
    : [];
}

function parseMinGames(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

async function allowedYearsForRequest(request: NextRequest): Promise<string[]> {
  const { userId } = await auth();
  const canAccessLoginSeason = Boolean(userId);
  const canAccessProSeason = await getServerProPlotAccess(userId);
  const requestedYears = parseYears(request.nextUrl.searchParams.get("years"));
  return requestedYears.filter((year) =>
    isAccessibleSeason(year, canAccessLoginSeason, "stats", canAccessProSeason)
  );
}

export async function GET(request: NextRequest) {
  try {
    const startedAt = performance.now();
    const searchParams = request.nextUrl.searchParams;
    const dataset = searchParams.get("dataset");
    const allowedYears = await allowedYearsForRequest(request);

    if (allowedYears.length === 0) {
      return NextResponse.json({
        rows: [],
        updatedAt: null,
        source: "cache",
        filterOptions: { teams: ["All Teams"], positions: ["All Positions"] },
      });
    }

    const cached = await readStatsTableCache();
    const cacheCoversRequest = cached
      ? allowedYears.every((year) => cached.years.includes(year))
      : false;
    const cache = cacheCoversRequest && cached
      ? cached
      : buildStatsTableCache(
          dataset === "player" ? await fetchPlayerStats(allowedYears) : [],
          dataset === "team" ? await fetchTeamStats(allowedYears) : []
        );
    const source = cacheCoversRequest ? "cache" : "fallback";

    if (dataset === "player") {
      const groupByParam = searchParams.get("groupBy") as PlayerStatsTableGroupBy | null;
      const groupBy = groupByParam && PLAYER_GROUPS.includes(groupByParam) ? groupByParam : "Player";
      const result = selectPlayerStatsTableRows(cache, {
        years: allowedYears,
        groupBy,
        team: searchParams.get("team") ?? undefined,
        position: searchParams.get("position") ?? undefined,
        minGames: parseMinGames(searchParams.get("minGames")),
      });
      const response = NextResponse.json({
        ...result,
        source,
      } satisfies StatsTableApiResponse<PlayerStatsTableAggregateRow>);
      response.headers.set("x-stats-table-ms", String(Math.round(performance.now() - startedAt)));
      return response;
    }

    if (dataset === "team") {
      const groupByParam = searchParams.get("groupBy") as TeamStatsTableGroupBy | null;
      const groupBy = groupByParam && TEAM_GROUPS.includes(groupByParam) ? groupByParam : "Team";
      const result = selectTeamStatsTableRows(cache, {
        years: allowedYears,
        groupBy,
        team: searchParams.get("team") ?? undefined,
      });
      const response = NextResponse.json({
        ...result,
        source,
      } satisfies StatsTableApiResponse<TeamStatsTableAggregateRow>);
      response.headers.set("x-stats-table-ms", String(Math.round(performance.now() - startedAt)));
      return response;
    }

    return NextResponse.json({ error: "Invalid dataset" }, { status: 400 });
  } catch (error) {
    console.error("Error fetching stats table:", error);
    return NextResponse.json({ error: "Failed to fetch stats table" }, { status: 500 });
  }
}
