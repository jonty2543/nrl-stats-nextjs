import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"
import { FantasyBackLink } from "@/components/fantasy/fantasy-back-link"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import {
  fetchFantasyCoachPlayersSnapshot,
  fetchFantasyPlayersSnapshot,
  fetchFantasyProjectionSigmas,
  fetchLatestFantasyOwnershipBaselineSnapshot,
  fetchLineupsProjectionsByPlayerId,
  type LineupsProjectionSnapshot,
} from "@/lib/fantasy/nrl"
import { fantasyPlayerSlug } from "@/lib/fantasy/player-slug"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import {
  fetchAvailableYears,
  fetchCasualtyWardForPlayer,
  fetchFantasyPlayerCardSummaryForPlayer,
  fetchFantasyPlayerStatsForYears,
  fetchOriginChances,
  fetchPlayerImagesForPlayer,
  fetchRelevantCasualtyWardOutCandidates,
  fetchTeamLogos,
} from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"
const PLAYER_PAGE_CONTEXT_TIMEOUT_MS = 1500
const PLAYER_PAGE_LINEUPS_TIMEOUT_MS = 8000

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

async function withPlayerPageContextTimeout<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
  timeoutMs = PLAYER_PAGE_CONTEXT_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise.catch((error) => {
        console.warn(`Unable to load ${label} for fantasy player page.`, error)
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

interface FantasyPlayerPageProps {
  params: Promise<{
    playerSlug: string
  }>
  searchParams?: Promise<{
    from?: string
  }>
}

export default async function FantasyPlayerPage({ params, searchParams }: FantasyPlayerPageProps) {
  const authPromise = auth()
  const accessPromise = authPromise.then(({ userId }) => getServerProPlotAccess(userId))
  const [{ playerSlug }, query, { userId }, canBypassPlotGate, fantasyPlayers, availableYears] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ from?: string }>({}),
    authPromise,
    accessPromise,
    fetchFantasyPlayersSnapshot(),
    fetchAvailableYears(),
  ])
  const fromMyTeam = query?.from === "my-team"
  const fromAllPlayers = query?.from === "all-players"
  const canAccessLoginSeason = Boolean(userId)

  const selectedPlayer = fantasyPlayers.find(
    (player) => fantasyPlayerSlug(player.name) === decodeURIComponent(playerSlug)
  )

  if (!selectedPlayer) {
    notFound()
  }
  const initialYears = defaultRecentYears(availableYears)
  const preferredPlayerStatsYears = ["2026", "2025"].filter((year) => initialYears.includes(year))
  const initialPlayerStatsYears = preferredPlayerStatsYears.length > 0
    ? preferredPlayerStatsYears
    : initialYears.slice(0, 1)
  const [
    fantasyCoachPlayers,
    lineupsProjections,
    projectionSigmas,
    draw2026Data,
    playerImages,
    teamLogos,
    ownershipBaselineSnapshot,
    originChances,
    initialPlayerStats,
    casualtyWardRows,
    relevantOutCandidates,
    selectedPrecomputedRow,
  ] = await Promise.all([
    fetchFantasyCoachPlayersSnapshot(),
    withPlayerPageContextTimeout("lineup projections", fetchLineupsProjectionsByPlayerId(), emptyLineupsProjectionSnapshot(), PLAYER_PAGE_LINEUPS_TIMEOUT_MS),
    withPlayerPageContextTimeout("fantasy projection sigmas", fetchFantasyProjectionSigmas(), []),
    withPlayerPageContextTimeout("2026 draw", loadDraw2026Data(), null),
    withPlayerPageContextTimeout("player image", fetchPlayerImagesForPlayer(selectedPlayer.name), []),
    withPlayerPageContextTimeout("team logos", fetchTeamLogos(), {}),
    withPlayerPageContextTimeout("ownership baseline", fetchLatestFantasyOwnershipBaselineSnapshot(), null),
    withPlayerPageContextTimeout("Origin lineups", fetchOriginChances(), []),
    fetchFantasyPlayerStatsForYears(selectedPlayer.name, initialPlayerStatsYears),
    withPlayerPageContextTimeout("casualty ward", fetchCasualtyWardForPlayer(selectedPlayer.name), []),
    withPlayerPageContextTimeout("relevant casualty candidates", fetchRelevantCasualtyWardOutCandidates(), []),
    withPlayerPageContextTimeout(
      "fantasy player card summary",
      fetchFantasyPlayerCardSummaryForPlayer({
        playerId: selectedPlayer.id,
        playerName: selectedPlayer.name,
      }),
      null
    ),
  ])

  return (
    <div className="space-y-4">
      <div>
        <FantasyBackLink
          href={fromMyTeam ? "/dashboard/fantasy/my-team" : fromAllPlayers ? "/dashboard/fantasy/players" : "/dashboard/fantasy"}
          label={fromMyTeam ? "Back to My Team" : fromAllPlayers ? "Back to All Players" : "Back to Fantasy Dashboard"}
        />
      </div>

      <FantasyDashboard
        fantasyPlayers={fantasyPlayers}
        fantasyCoachPlayers={fantasyCoachPlayers}
        lineupsProjections={lineupsProjections}
        fantasyProjectionSigmas={projectionSigmas}
        availableYears={availableYears}
        defaultYears={initialPlayerStatsYears}
        initialPlayerStats={initialPlayerStats}
        precomputedAllPlayersRows={selectedPrecomputedRow ? [selectedPrecomputedRow] : []}
        canAccessLoginSeason={canAccessLoginSeason}
        canBypassPlotGate={canBypassPlotGate}
        draw2026Data={draw2026Data}
        playerImages={playerImages}
        teamLogos={teamLogos}
        initialSelectedFantasyName={selectedPlayer.name}
        showOwnedCards={false}
        playerRouteBasePath="/dashboard/fantasy"
        ownershipBaselineSnapshot={ownershipBaselineSnapshot}
        casualtyWardRows={casualtyWardRows}
        relevantOutCandidates={relevantOutCandidates}
        originChances={originChances}
      />
    </div>
  )
}
