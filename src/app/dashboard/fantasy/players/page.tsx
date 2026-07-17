import { auth } from "@clerk/nextjs/server"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import {
  fetchFantasyCoachPlayersSnapshot,
  fetchFantasyPlayersSnapshot,
  fetchLatestFantasyOwnershipBaselineSnapshot,
  fetchLineupsProjectionsByPlayerId,
  type LineupsProjectionSnapshot,
} from "@/lib/fantasy/nrl"
import {
  fetchAvailableYears,
  fetchFantasyPlayerCardSummaries,
  fetchOriginChances,
  fetchPlayerStats,
  fetchPlayerImages,
  fetchRelevantCasualtyWardOutCandidates,
} from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

const OPTIONAL_CONTEXT_TIMEOUT_MS = 1500

function defaultRecentYears(years: string[], maxYears = 4): string[] {
  return years.slice(0, Math.min(maxYears, years.length))
}

function emptyLineupsProjectionSnapshot(): LineupsProjectionSnapshot {
  return {
    round: null,
    source: "none",
    lineupsAvailable: false,
    projectionByPlayerId: new Map(),
    projectionByPlayerName: new Map(),
    roleByPlayerId: new Map(),
    roleByPlayerName: new Map(),
  }
}

async function withOptionalContextTimeout<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
  timeoutMs = OPTIONAL_CONTEXT_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const guardedPromise = promise.catch((error: unknown) => {
    console.warn(`Fantasy players ${label} failed`, error)
    return fallback
  })
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`Fantasy players ${label} timed out after ${timeoutMs}ms`)
      resolve(fallback)
    }, timeoutMs)
  })

  try {
    return await Promise.race([guardedPromise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export default async function FantasyPlayersPage() {
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)
  const canBypassPlotGate = await getServerProPlotAccess(userId)
  const playerSummariesPromise = fetchFantasyPlayerCardSummaries()

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
    withOptionalContextTimeout("coach players", fetchFantasyCoachPlayersSnapshot(), []),
    withOptionalContextTimeout("lineups projections", fetchLineupsProjectionsByPlayerId(), emptyLineupsProjectionSnapshot()),
    withOptionalContextTimeout("available years", fetchAvailableYears(), ["2026"]),
    withOptionalContextTimeout("ownership baseline", fetchLatestFantasyOwnershipBaselineSnapshot(), null),
    withOptionalContextTimeout("player images", fetchPlayerImages(), []),
    withOptionalContextTimeout("casualty context", fetchRelevantCasualtyWardOutCandidates(), []),
    withOptionalContextTimeout("draw context", loadDraw2026Data(), null),
    withOptionalContextTimeout("origin chances", fetchOriginChances(), []),
    withOptionalContextTimeout("player summaries", playerSummariesPromise, []),
  ])
  const effectivePrecomputedAllPlayersRows =
    fantasyPlayers.length === 0 && precomputedAllPlayersRows.length === 0
      ? await withOptionalContextTimeout("fallback player summaries", playerSummariesPromise, [], 4500)
      : precomputedAllPlayersRows
  const initialAllPlayerStats =
    fantasyPlayers.length === 0 && effectivePrecomputedAllPlayersRows.length === 0
      ? await withOptionalContextTimeout("fallback player stats", fetchPlayerStats(["2026"]), [], 4500)
      : []

  const initialYears = defaultRecentYears(availableYears)

  return (
    <FantasyDashboard
      fantasyPlayers={fantasyPlayers}
      fantasyCoachPlayers={fantasyCoachPlayers}
      lineupsProjections={lineupsProjections}
      availableYears={availableYears}
      defaultYears={initialYears}
      initialPlayerStats={[]}
      initialAllPlayerStats={initialAllPlayerStats}
      precomputedAllPlayersRows={effectivePrecomputedAllPlayersRows}
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
