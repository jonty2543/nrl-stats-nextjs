import { auth } from "@clerk/nextjs/server"
import { RankingsDashboard } from "@/components/views/rankings-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { isAccessibleSeason } from "@/lib/access/season-access"
import { fetchAvailableYears, fetchPlayerImages, fetchPlayerStats, fetchTeamLogos, fetchTeamStats } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

const DEFAULT_RANKINGS_YEAR = "2026"

export default async function RankingsPage() {
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)
  const canBypassPlotGate = await getServerProPlotAccess(userId)
  const [availableYears, playerImages, teamLogos] = await Promise.all([
    fetchAvailableYears(),
    fetchPlayerImages(),
    fetchTeamLogos(),
  ])

  const unlockedYears = availableYears.filter((year) =>
    isAccessibleSeason(year, canAccessLoginSeason, "stats", canBypassPlotGate)
  )
  const yearPool = unlockedYears.length > 0 ? unlockedYears : availableYears.slice(0, 1)
  const sortedYears = [...yearPool].sort((a, b) => Number(b) - Number(a))
  const selectedYear = yearPool.includes(DEFAULT_RANKINGS_YEAR)
    ? DEFAULT_RANKINGS_YEAR
    : (sortedYears[0] ?? "")
  const [playerRows, teamRows] = selectedYear
    ? await Promise.all([
        fetchPlayerStats([selectedYear]),
        fetchTeamStats([selectedYear]),
      ])
    : [[], []]

  return (
    <RankingsDashboard
      selectedYear={selectedYear}
      playerRows={playerRows}
      teamRows={teamRows}
      playerImages={playerImages}
      teamLogos={teamLogos}
    />
  )
}
