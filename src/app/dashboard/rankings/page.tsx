import { auth } from "@clerk/nextjs/server"
import { RankingsDashboard } from "@/components/views/rankings-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { isAccessibleSeason } from "@/lib/access/season-access"
import { fetchAvailableYears, fetchPlayerImages, fetchPlayerStats, fetchTeamLogos } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

const DEFAULT_RANKINGS_YEAR = "2026"
export default async function RankingsPage() {
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)
  const canBypassPlotGate = await getServerProPlotAccess(userId)
  const cupAvailableYearsPromise = canBypassPlotGate
    ? fetchAvailableYears("cup").catch((error) => {
        console.warn("Unable to load Cup ranking seasons.", error)
        return []
      })
    : Promise.resolve([])
  const internationalAvailableYearsPromise = canBypassPlotGate
    ? fetchAvailableYears("international").catch((error) => {
        console.warn("Unable to load International ranking seasons.", error)
        return ["2025"]
      })
    : Promise.resolve([])
  const originAvailableYearsPromise = canBypassPlotGate
    ? fetchAvailableYears("origin").catch((error) => {
        console.warn("Unable to load Origin ranking seasons.", error)
        return ["2026"]
      })
    : Promise.resolve([])
  const [availableYears, cupAvailableYears, internationalAvailableYears, originAvailableYears] = await Promise.all([
    fetchAvailableYears(),
    cupAvailableYearsPromise,
    internationalAvailableYearsPromise,
    originAvailableYearsPromise,
  ])

  const unlockedYears = availableYears.filter((year) =>
    isAccessibleSeason(year, canAccessLoginSeason, "stats", canBypassPlotGate)
  )
  const yearPool = unlockedYears.length > 0 ? unlockedYears : availableYears.slice(0, 1)
  const sortedYears = [...yearPool].sort((a, b) => Number(b) - Number(a))
  const selectedYear = yearPool.includes(DEFAULT_RANKINGS_YEAR)
    ? DEFAULT_RANKINGS_YEAR
    : (sortedYears[0] ?? "")
  const [playerRows, playerImages, teamLogos] = await Promise.all([
    selectedYear ? fetchPlayerStats([selectedYear]) : Promise.resolve([]),
    fetchPlayerImages(),
    fetchTeamLogos(),
  ])

  return (
    <RankingsDashboard
      selectedYear={selectedYear}
      playerRows={playerRows}
      teamRows={[]}
      playerImages={playerImages}
      teamLogos={teamLogos}
      availableYears={yearPool}
      cupAvailableYears={cupAvailableYears}
      internationalAvailableYears={internationalAvailableYears.length > 0 ? internationalAvailableYears : ["2025"]}
      originAvailableYears={originAvailableYears.length > 0 ? originAvailableYears : ["2026"]}
      canAccessCup={canBypassPlotGate}
    />
  )
}
