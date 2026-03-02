import { auth } from "@clerk/nextjs/server"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { isAccessibleSeason } from "@/lib/access/season-access"
import { fetchFantasyPlayersSnapshot } from "@/lib/fantasy/nrl"
import { fetchAvailableYears } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"
const PREFERRED_DEFAULT_YEARS = ["2026", "2025"] as const

export default async function FantasyPage() {
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)

  const [fantasyPlayers, availableYears] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchAvailableYears(),
  ])

  const unlockedYears = canAccessLoginSeason
    ? availableYears
    : availableYears.filter((year) => isAccessibleSeason(year, canAccessLoginSeason))
  const defaultYears = PREFERRED_DEFAULT_YEARS.filter((year) => unlockedYears.includes(year))
  const initialYears = defaultYears.length > 0 ? defaultYears : unlockedYears.slice(0, 1)

  return (
    <FantasyDashboard
      fantasyPlayers={fantasyPlayers}
      availableYears={unlockedYears}
      defaultYears={initialYears}
      initialPlayerStats={[]}
      canAccessLoginSeason={canAccessLoginSeason}
      showPlayerDetails={false}
      playerRouteBasePath="/dashboard/fantasy"
    />
  )
}
