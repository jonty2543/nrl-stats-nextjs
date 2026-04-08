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
const SIGNED_IN_DEFAULT_YEAR_COUNT = 6
const GUEST_PREFERRED_DEFAULT_YEARS = ["2026", "2025", "2024"] as const

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
  const defaultYears = canAccessLoginSeason
    ? unlockedYears.slice(0, SIGNED_IN_DEFAULT_YEAR_COUNT)
    : GUEST_PREFERRED_DEFAULT_YEARS.filter((year) => unlockedYears.includes(year))
  const initialYears = defaultYears.length > 0 ? defaultYears : unlockedYears.slice(0, 1)

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
