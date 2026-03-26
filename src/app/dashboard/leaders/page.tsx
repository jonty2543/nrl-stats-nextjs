import { auth } from "@clerk/nextjs/server"
import { LeadersDashboard } from "@/components/views/leaders-dashboard"
import { isAccessibleSeason } from "@/lib/access/season-access"
import {
  fetchAvailableYears,
  fetchPlayerImages,
  fetchPlayerStats,
  fetchTeamLogos,
} from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

interface LeadersPageProps {
  searchParams: Promise<{
    year?: string
    view?: string
  }>
}

export default async function LeadersPage({ searchParams }: LeadersPageProps) {
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)
  const { year, view } = await searchParams

  const [availableYears, playerImages, teamLogos] = await Promise.all([
    fetchAvailableYears(),
    fetchPlayerImages(),
    fetchTeamLogos(),
  ])

  const unlockedYears = availableYears.filter((season) =>
    isAccessibleSeason(season, canAccessLoginSeason, "stats")
  )

  const sortedYears = [...unlockedYears].sort((a, b) => Number(b) - Number(a))
  const selectedYear = year && sortedYears.includes(year) ? year : (sortedYears[0] ?? "")
  const selectedView = view === "teams" ? "teams" : "players"
  const rows = selectedYear ? await fetchPlayerStats([selectedYear]) : []

  return (
    <LeadersDashboard
      selectedYear={selectedYear}
      selectedView={selectedView}
      availableYears={sortedYears}
      rows={rows}
      playerImages={playerImages}
      teamLogos={teamLogos}
    />
  )
}
