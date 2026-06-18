import { auth } from "@clerk/nextjs/server"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import {
  fetchFantasyCoachPlayersSnapshot,
  fetchFantasyPlayersSnapshot,
  fetchLatestFantasyOwnershipBaselineSnapshot,
  fetchLineupsProjectionsByPlayerId,
} from "@/lib/fantasy/nrl"
import {
  fetchAvailableYears,
  fetchFantasyPlayerCardSummaries,
  fetchOriginChances,
  fetchPlayerImages,
  fetchRelevantCasualtyWardOutCandidates,
} from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

function defaultRecentYears(years: string[], maxYears = 4): string[] {
  return years.slice(0, Math.min(maxYears, years.length))
}

export default async function FantasyPlayersPage() {
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)
  const canBypassPlotGate = await getServerProPlotAccess(userId)

  const [
    fantasyPlayers,
    fantasyCoachPlayers,
    lineupsProjections,
    availableYears,
    ownershipBaselineSnapshot,
    playerImages,
    relevantOutCandidates,
    draw2026Data,
    originChances,
    precomputedAllPlayersRows,
  ] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchFantasyCoachPlayersSnapshot(),
    fetchLineupsProjectionsByPlayerId(),
    fetchAvailableYears(),
    fetchLatestFantasyOwnershipBaselineSnapshot(),
    fetchPlayerImages(),
    fetchRelevantCasualtyWardOutCandidates(),
    loadDraw2026Data(),
    fetchOriginChances(),
    fetchFantasyPlayerCardSummaries(),
  ])

  const initialYears = defaultRecentYears(availableYears)

  return (
    <FantasyDashboard
      fantasyPlayers={fantasyPlayers}
      fantasyCoachPlayers={fantasyCoachPlayers}
      lineupsProjections={lineupsProjections}
      availableYears={availableYears}
      defaultYears={initialYears}
      initialPlayerStats={[]}
      initialAllPlayerStats={[]}
      precomputedAllPlayersRows={precomputedAllPlayersRows}
      canAccessLoginSeason={canAccessLoginSeason}
      canBypassPlotGate={canBypassPlotGate}
      showFantasyActions={false}
      showAllPlayersOnly
      showPlayerDetails={false}
      playerRouteBasePath="/dashboard/fantasy"
      ownershipBaselineSnapshot={ownershipBaselineSnapshot}
      playerImages={playerImages}
      relevantOutCandidates={relevantOutCandidates}
      draw2026Data={draw2026Data}
      originChances={originChances}
    />
  )
}
