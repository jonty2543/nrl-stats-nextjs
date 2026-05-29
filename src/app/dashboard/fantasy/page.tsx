import { auth } from "@clerk/nextjs/server"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { fetchApprovedArticleLinks } from "@/lib/articles"
import { isAccessibleSeason } from "@/lib/access/season-access"
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
const FANTASY_PAGE_ARTICLE_CONTEXT_TIMEOUT_MS = 8000

interface FantasyPageProps {
  searchParams: Promise<{
    analytics?: string
  }>
}

function defaultRecentYears(years: string[], maxYears = 4): string[] {
  return years.slice(0, Math.min(maxYears, years.length))
}

function normaliseArticleTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
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

  const [fantasyPlayers, fantasyCoachPlayers, lineupsProjections, availableYears, ownershipBaselineSnapshot, playerImages, approvedArticleLinks, relevantOutCandidates, draw2026Data, originChances, precomputedAllPlayersRows] = await Promise.all([
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
    withFantasyPageContextTimeout("player images", fetchPlayerImages(), [], FANTASY_PAGE_OPTIONAL_CONTEXT_TIMEOUT_MS),
    withFantasyPageContextTimeout("approved articles", fetchApprovedArticleLinks(), [], FANTASY_PAGE_ARTICLE_CONTEXT_TIMEOUT_MS),
    withFantasyPageContextTimeout("relevant casualty candidates", fetchRelevantCasualtyWardOutCandidates(), [], FANTASY_PAGE_OPTIONAL_CONTEXT_TIMEOUT_MS),
    withFantasyPageContextTimeout("2026 draw", loadDraw2026Data(), null, FANTASY_PAGE_OPTIONAL_CONTEXT_TIMEOUT_MS),
    withFantasyPageContextTimeout("Origin chances", fetchOriginChances(), [], FANTASY_PAGE_OPTIONAL_CONTEXT_TIMEOUT_MS),
    withFantasyPageContextTimeout("top weekly fantasy player card summaries", fetchTopWeeklyFantasyPlayerCardSummaries(), []),
  ])
  const fantasyProjectionArticle = approvedArticleLinks.find((article) => {
    const title = normaliseArticleTitle(article.title)
    return title.includes("fantasy projection model") || (title.includes("fantasy") && title.includes("model"))
  }) ?? null

  const unlockedYears = canAccessLoginSeason
    ? availableYears
    : availableYears.filter((year) => isAccessibleSeason(year, canAccessLoginSeason))
  const initialYears = defaultRecentYears(
    unlockedYears.length > 0 ? unlockedYears : availableYears.slice(0, 1)
  )
  return (
    <FantasyDashboard
      fantasyPlayers={fantasyPlayers}
      fantasyCoachPlayers={fantasyCoachPlayers}
      lineupsProjections={lineupsProjections}
      availableYears={unlockedYears}
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
      fantasyProjectionArticle={
        fantasyProjectionArticle
          ? {
              title: fantasyProjectionArticle.title,
              slug: fantasyProjectionArticle.slug,
              imageUrls: fantasyProjectionArticle.imageUrls,
            }
          : null
      }
    />
  )
}
