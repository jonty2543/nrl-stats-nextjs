import { auth } from "@clerk/nextjs/server";
import { StatsHub } from "@/components/views/stats-hub";
import { getServerProPlotAccess } from "@/lib/access/pro-access-server";
import { isAccessibleSeason } from "@/lib/access/season-access";
import { buildStatsHubModel } from "@/lib/data/stats-hub";
import { fetchAvailableYears, fetchPlayerImages, fetchPlayerStats, fetchTeamLogos, fetchTeamStats } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

const DEFAULT_STATS_HUB_YEAR = "2026";

function statsHubYears(years: string[], maxYears = 6): string[] {
  if (years.includes(DEFAULT_STATS_HUB_YEAR)) {
    return [DEFAULT_STATS_HUB_YEAR, ...years.filter((year) => year !== DEFAULT_STATS_HUB_YEAR)].slice(0, maxYears);
  }

  return years.slice(0, maxYears);
}

export default async function StatsHubPage() {
  const { userId } = await auth();
  const canAccessLoginSeason = Boolean(userId);
  const canBypassPlotGate = await getServerProPlotAccess(userId);
  const availableYears = await fetchAvailableYears();
  const unlockedYears = availableYears.filter((year) =>
    isAccessibleSeason(year, canAccessLoginSeason, "stats", canBypassPlotGate)
  );
  const years = statsHubYears(unlockedYears.length > 0 ? unlockedYears : availableYears.slice(0, 1));
  const [playerRows, teamRows, playerImages, teamLogos] = await Promise.all([
    years.length > 0 ? fetchPlayerStats(years) : [],
    years.length > 0 ? fetchTeamStats(years) : [],
    fetchPlayerImages(),
    fetchTeamLogos(),
  ]);

  return <StatsHub model={buildStatsHubModel(playerRows, teamRows)} playerImages={playerImages} teamLogos={teamLogos} />;
}
