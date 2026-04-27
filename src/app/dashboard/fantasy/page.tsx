import { auth } from "@clerk/nextjs/server"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { isAccessibleSeason } from "@/lib/access/season-access"
import {
  fetchFantasyCoachPlayersSnapshot,
  fetchFantasyPlayersSnapshot,
  fetchLatestFantasyOwnershipBaselineSnapshot,
} from "@/lib/fantasy/nrl"
import { fetchAvailableYears, fetchPlayerImages, fetchPlayerStats } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

function defaultRecentYears(years: string[], maxYears = 4): string[] {
  return years.slice(0, Math.min(maxYears, years.length))
}

export default async function FantasyPage() {
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)
  const canBypassPlotGate = await getServerProPlotAccess(userId)

  const [fantasyPlayers, fantasyCoachPlayers, availableYears, ownershipBaselineSnapshot, playerImages] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchFantasyCoachPlayersSnapshot(),
    fetchAvailableYears(),
    fetchLatestFantasyOwnershipBaselineSnapshot(),
    fetchPlayerImages(),
  ])

  const unlockedYears = canAccessLoginSeason
    ? availableYears
    : availableYears.filter((year) => isAccessibleSeason(year, canAccessLoginSeason))
  const initialYears = defaultRecentYears(
    unlockedYears.length > 0 ? unlockedYears : availableYears.slice(0, 1)
  )
  const allPlayersStatsYear = "2026"
  const initialPlayerStats = unlockedYears.includes(allPlayersStatsYear)
    ? await fetchPlayerStats([allPlayersStatsYear])
    : []

  return (
    <FantasyDashboard
      fantasyPlayers={fantasyPlayers}
      fantasyCoachPlayers={fantasyCoachPlayers}
      availableYears={unlockedYears}
      defaultYears={initialYears}
      initialPlayerStats={initialPlayerStats}
      canAccessLoginSeason={canAccessLoginSeason}
      canBypassPlotGate={canBypassPlotGate}
      showPlayerDetails={false}
      playerRouteBasePath="/dashboard/fantasy"
      ownershipBaselineSnapshot={ownershipBaselineSnapshot}
      playerImages={playerImages}
    />
  )
}
