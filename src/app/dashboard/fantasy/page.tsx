import { auth } from "@clerk/nextjs/server"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { isAccessibleSeason } from "@/lib/access/season-access"
import { fetchFantasyPlayersSnapshot } from "@/lib/fantasy/nrl"
import { fetchAvailableYears } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

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
  const defaultYear = unlockedYears.includes("2025") ? "2025" : unlockedYears[0] ?? ""

  return (
    <FantasyDashboard
      fantasyPlayers={fantasyPlayers}
      availableYears={unlockedYears}
      defaultYear={defaultYear}
      initialPlayerStats={[]}
      canAccessLoginSeason={canAccessLoginSeason}
      showPlayerDetails={false}
      playerRouteBasePath="/dashboard/fantasy"
    />
  )
}
