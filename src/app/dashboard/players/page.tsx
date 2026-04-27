import { auth } from "@clerk/nextjs/server";
import { fetchAvailableYears, fetchPlayerImages, fetchPlayerStats, fetchTeamLogos } from "@/lib/supabase/queries";
import { PlayerComparison } from "@/components/views/player-comparison";
import { getServerProPlotAccess } from "@/lib/access/pro-access-server";
import { isAccessibleSeason } from "@/lib/access/season-access";

export const dynamic = "force-dynamic";

const DEFAULT_STATS_TABLE_YEAR = "2026";

function defaultRecentYears(years: string[], maxYears = 4): string[] {
  return years.slice(0, Math.min(maxYears, years.length));
}

export default async function PlayersPage() {
  const { userId } = await auth();
  const canAccessLoginSeason = Boolean(userId);
  const canBypassPlotGate = await getServerProPlotAccess(userId);
  const [availableYears, playerImages, teamLogos] = await Promise.all([
    fetchAvailableYears(),
    fetchPlayerImages(),
    fetchTeamLogos(),
  ]);
  const unlockedYears = availableYears.filter((year) =>
    isAccessibleSeason(year, canAccessLoginSeason, "stats", canBypassPlotGate)
  );
  const yearPool = unlockedYears.length > 0 ? unlockedYears : availableYears.slice(0, 1);
  const initialYears = yearPool.includes(DEFAULT_STATS_TABLE_YEAR)
    ? [DEFAULT_STATS_TABLE_YEAR]
    : defaultRecentYears(yearPool);
  const initialData = initialYears.length > 0 ? await fetchPlayerStats(initialYears) : [];

  return (
    <PlayerComparison
      initialData={initialData}
      playerImages={playerImages}
      teamLogos={teamLogos}
      availableYears={availableYears}
      defaultYears={initialYears}
      initialCanAccessLoginSeason={canAccessLoginSeason}
      canBypassPlotGate={canBypassPlotGate}
    />
  );
}
