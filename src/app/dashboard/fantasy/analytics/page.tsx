import { auth } from "@clerk/nextjs/server"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { fetchApprovedArticles } from "@/lib/articles"
import {
  fetchFantasyCoachPlayersSnapshot,
  fetchFantasyPlayersSnapshot,
  fetchLatestFantasyOwnershipBaselineSnapshot,
  fetchLineupsProjectionsByPlayerId,
} from "@/lib/fantasy/nrl"
import { fetchAvailableYears, fetchFantasyPlayerCardSummaries, fetchOriginChances, fetchPlayerImages, fetchPlayerStats } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

function defaultRecentYears(years: string[], maxYears = 4): string[] {
  return years.slice(0, Math.min(maxYears, years.length))
}

function normaliseArticleTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export default async function FantasyAnalyticsPage() {
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)
  const canBypassPlotGate = await getServerProPlotAccess(userId)

  const [fantasyPlayers, fantasyCoachPlayers, lineupsProjections, availableYears, ownershipBaselineSnapshot, playerImages, approvedArticles, originChances, precomputedAllPlayersRows, initialAllPlayerStats] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchFantasyCoachPlayersSnapshot(),
    fetchLineupsProjectionsByPlayerId(),
    fetchAvailableYears(),
    fetchLatestFantasyOwnershipBaselineSnapshot(),
    fetchPlayerImages(),
    fetchApprovedArticles(),
    fetchOriginChances(),
    fetchFantasyPlayerCardSummaries(),
    fetchPlayerStats(["2026"]),
  ])
  const fantasyProjectionArticle = approvedArticles.find((article) => {
    const title = normaliseArticleTitle(article.title)
    return title.includes("fantasy projection model") || (title.includes("fantasy") && title.includes("model"))
  }) ?? null

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
      precomputedAllPlayersRows={precomputedAllPlayersRows}
      canAccessLoginSeason={canAccessLoginSeason}
      canBypassPlotGate={canBypassPlotGate}
      initialShowFantasyAnalytics
      showFantasyActions={false}
      showFantasyAnalyticsOnly
      showPlayerDetails={false}
      playerRouteBasePath="/dashboard/fantasy"
      ownershipBaselineSnapshot={ownershipBaselineSnapshot}
      playerImages={playerImages}
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
