import { auth } from "@clerk/nextjs/server"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { fetchApprovedArticles } from "@/lib/articles"
import { isAccessibleSeason } from "@/lib/access/season-access"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import {
  fetchFantasyCoachPlayersSnapshot,
  fetchFantasyPlayersSnapshot,
  fetchLatestFantasyOwnershipBaselineSnapshot,
  fetchLineupsProjectionsByPlayerId,
} from "@/lib/fantasy/nrl"
import { fetchAvailableYears, fetchOriginChances, fetchPlayerImages, fetchPlayerStats, fetchRelevantCasualtyWardOutCandidates } from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"

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

export default async function FantasyPage({ searchParams }: FantasyPageProps) {
  const params = await searchParams
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)
  const canBypassPlotGate = await getServerProPlotAccess(userId)

  const [fantasyPlayers, fantasyCoachPlayers, lineupsProjections, availableYears, ownershipBaselineSnapshot, playerImages, approvedArticles, relevantOutCandidates, draw2026Data, originChances, initialAllPlayerStats] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchFantasyCoachPlayersSnapshot(),
    fetchLineupsProjectionsByPlayerId(),
    fetchAvailableYears(),
    fetchLatestFantasyOwnershipBaselineSnapshot(),
    fetchPlayerImages(),
    fetchApprovedArticles(),
    fetchRelevantCasualtyWardOutCandidates(),
    loadDraw2026Data().catch(() => null),
    fetchOriginChances(),
    fetchPlayerStats(["2026"]),
  ])
  const fantasyProjectionArticle = approvedArticles.find((article) => {
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
      initialAllPlayerStats={initialAllPlayerStats}
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
