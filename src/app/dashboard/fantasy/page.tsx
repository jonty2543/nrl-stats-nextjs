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
import { fetchAvailableYears, fetchOriginChances, fetchPlayerImages, fetchRelevantCasualtyWardOutCandidates, fetchTopWeeklyFantasyPlayerCardSummaries } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"
const FANTASY_PAGE_CONTEXT_TIMEOUT_MS = 8000
const FANTASY_PAGE_OPTIONAL_CONTEXT_TIMEOUT_MS = 1500

interface FantasyPageProps {
  searchParams: Promise<{
    analytics?: string
  }>
}

function defaultRecentYears(years: string[], maxYears = 4): string[] {
  return years.slice(0, Math.min(maxYears, years.length))
}

async function withFantasyPageContextTimeout<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
  timeoutMs = FANTASY_PAGE_CONTEXT_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise.catch((error) => {
        console.warn(`Unable to load ${label} for fantasy dashboard.`, error)
        return fallback
      }),
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export default async function FantasyPage({ searchParams }: FantasyPageProps) {
  const params = await searchParams
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)
  const canBypassPlotGate = await getServerProPlotAccess(userId)

  const [fantasyPlayers, fantasyCoachPlayers, lineupsProjections, availableYears, ownershipBaselineSnapshot, playerImages, relevantOutCandidates, draw2026Data, originChances, precomputedAllPlayersRows] = await Promise.all([
    withFantasyPageContextTimeout("fantasy players", fetchFantasyPlayersSnapshot(), []),
    withFantasyPageContextTimeout("fantasy coach players", fetchFantasyCoachPlayersSnapshot(), []),
    withFantasyPageContextTimeout("lineup projections", fetchLineupsProjectionsByPlayerId(), {
      round: null,
      source: "none",
      lineupsAvailable: false,
      projectionByPlayerId: new Map(),
      projectionByPlayerName: new Map(),
      roleByPlayerId: new Map(),
      roleByPlayerName: new Map(),
    }),
    fetchAvailableYears(),
    withFantasyPageContextTimeout("ownership baseline", fetchLatestFantasyOwnershipBaselineSnapshot(), null, FANTASY_PAGE_OPTIONAL_CONTEXT_TIMEOUT_MS),
    fetchPlayerImages(),
    withFantasyPageContextTimeout("relevant casualty candidates", fetchRelevantCasualtyWardOutCandidates(), [], FANTASY_PAGE_OPTIONAL_CONTEXT_TIMEOUT_MS),
    withFantasyPageContextTimeout("2026 draw", loadDraw2026Data(), null, FANTASY_PAGE_OPTIONAL_CONTEXT_TIMEOUT_MS),
    withFantasyPageContextTimeout("Origin lineups", fetchOriginChances(), [], FANTASY_PAGE_OPTIONAL_CONTEXT_TIMEOUT_MS),
    withFantasyPageContextTimeout("top weekly fantasy player card summaries", fetchTopWeeklyFantasyPlayerCardSummaries(), []),
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
      precomputedAllPlayersRowsArePreview
      canAccessLoginSeason={canAccessLoginSeason}
      canBypassPlotGate={canBypassPlotGate}
      initialShowFantasyAnalytics={params.analytics === "1"}
      showPlayerDetails={false}
      playerRouteBasePath="/dashboard/fantasy"
      ownershipBaselineSnapshot={ownershipBaselineSnapshot}
      playerImages={playerImages}
      relevantOutCandidates={relevantOutCandidates}
      draw2026Data={draw2026Data}
      originChances={originChances}
      fantasyProjectionArticle={null}
    />
  )
}
