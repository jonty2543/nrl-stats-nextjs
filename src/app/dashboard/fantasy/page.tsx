import { auth } from "@clerk/nextjs/server"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { hasProPlotAccess } from "@/lib/access/pro-access"
import { isAccessibleSeason } from "@/lib/access/season-access"
import {
  fetchFantasyPlayersSnapshot,
  fetchLatestFantasyOwnershipBaselineSnapshot,
} from "@/lib/fantasy/nrl"
import { fetchAvailableYears } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

function defaultRecentYears(years: string[], maxYears = 4): string[] {
  return years.slice(0, Math.min(maxYears, years.length))
}

export default async function FantasyPage() {
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)
  const canBypassPlotGate = hasProPlotAccess(userId)

  const [fantasyPlayers, availableYears, ownershipBaselineSnapshot] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchAvailableYears(),
    fetchLatestFantasyOwnershipBaselineSnapshot(),
  ])

  const unlockedYears = canAccessLoginSeason
    ? availableYears
    : availableYears.filter((year) => isAccessibleSeason(year, canAccessLoginSeason))
  const initialYears = defaultRecentYears(
    unlockedYears.length > 0 ? unlockedYears : availableYears.slice(0, 1)
  )

  return (
    <FantasyDashboard
      fantasyPlayers={fantasyPlayers}
      availableYears={unlockedYears}
      defaultYears={initialYears}
      initialPlayerStats={[]}
      canAccessLoginSeason={canAccessLoginSeason}
      canBypassPlotGate={canBypassPlotGate}
      showPlayerDetails={false}
      playerRouteBasePath="/dashboard/fantasy"
      ownershipBaselineSnapshot={ownershipBaselineSnapshot}
    />
  )
}
