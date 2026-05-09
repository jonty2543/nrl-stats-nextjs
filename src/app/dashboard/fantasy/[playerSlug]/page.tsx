import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"
import { FantasyBackLink } from "@/components/fantasy/fantasy-back-link"
import { FantasyDashboard } from "@/components/views/fantasy-dashboard"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"
import { isAccessibleSeason } from "@/lib/access/season-access"
import {
  fetchFantasyCoachPlayersSnapshot,
  fetchFantasyPlayersSnapshot,
  fetchLatestFantasyOwnershipBaselineSnapshot,
  fetchLineupsProjectionsByPlayerId,
  type LineupsProjectionSnapshot,
} from "@/lib/fantasy/nrl"
import { fantasyPlayerSlug } from "@/lib/fantasy/player-slug"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import {
  fetchAvailableYears,
  fetchCasualtyWardForPlayer,
  fetchFantasyPlayerStatsForYears,
  fetchOriginChances,
  fetchPlayerImages,
  fetchRelevantCasualtyWardOuts,
  fetchRelevantCasualtyWardOutCandidates,
  fetchTeamLogos,
} from "@/lib/supabase/queries"

export const dynamic = "force-dynamic"
const PLAYER_PAGE_CONTEXT_TIMEOUT_MS = 1500

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
  fallback: T
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise.catch((error) => {
        console.warn(`Unable to load ${label} for fantasy player page.`, error)
        return fallback
      }),
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), PLAYER_PAGE_CONTEXT_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function normaliseLineupPlayerName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

interface FantasyPlayerPageProps {
  params: Promise<{
    playerSlug: string
  }>
}

export default async function FantasyPlayerPage({ params }: FantasyPlayerPageProps) {
  const { playerSlug } = await params
  const { userId } = await auth()
  const canAccessLoginSeason = Boolean(userId)
  const canBypassPlotGate = await getServerProPlotAccess(userId)

  const [fantasyPlayers, fantasyCoachPlayers, lineupsProjections, availableYears, draw2026Data, playerImages, teamLogos, ownershipBaselineSnapshot, originChances] = await Promise.all([
    fetchFantasyPlayersSnapshot(),
    fetchFantasyCoachPlayersSnapshot(),
    withPlayerPageContextTimeout("lineup projections", fetchLineupsProjectionsByPlayerId(), emptyLineupsProjectionSnapshot()),
    fetchAvailableYears(),
    withPlayerPageContextTimeout("2026 draw", loadDraw2026Data(), null),
    withPlayerPageContextTimeout("player images", fetchPlayerImages(), []),
    withPlayerPageContextTimeout("team logos", fetchTeamLogos(), {}),
    withPlayerPageContextTimeout("ownership baseline", fetchLatestFantasyOwnershipBaselineSnapshot(), null),
    withPlayerPageContextTimeout("Origin chances", fetchOriginChances(), []),
  ])

  const selectedPlayer = fantasyPlayers.find(
    (player) => fantasyPlayerSlug(player.name) === decodeURIComponent(playerSlug)
  )

  if (!selectedPlayer) {
    notFound()
  }

  const unlockedYears = canAccessLoginSeason
    ? availableYears
    : availableYears.filter((year) => isAccessibleSeason(year, canAccessLoginSeason))
  const initialYears = defaultRecentYears(
    unlockedYears.length > 0 ? unlockedYears : availableYears.slice(0, 1)
  )
  const initialPlayerStatsYears = initialYears.includes("2026") ? ["2026"] : initialYears.slice(0, 1)
  const selectedLineupRole = lineupsProjections.roleByPlayerId.get(selectedPlayer.id) ?? null
  const shouldFetchRelevantOuts =
    lineupsProjections.source === "lineups" &&
    Boolean(selectedLineupRole?.isOnField && selectedLineupRole.team && selectedLineupRole.position)

  const [initialPlayerStats, casualtyWardRows, rawRelevantOuts, relevantOutCandidates] = await Promise.all([
    fetchFantasyPlayerStatsForYears(selectedPlayer.name, initialPlayerStatsYears),
    withPlayerPageContextTimeout("casualty ward", fetchCasualtyWardForPlayer(selectedPlayer.name), []),
    shouldFetchRelevantOuts
      ? withPlayerPageContextTimeout(
        "relevant casualty outs",
        fetchRelevantCasualtyWardOuts({
          team: selectedLineupRole?.team,
          position: selectedLineupRole?.position,
          excludePlayer: selectedPlayer.name,
        }),
        []
      )
      : Promise.resolve([]),
    withPlayerPageContextTimeout("relevant casualty candidates", fetchRelevantCasualtyWardOutCandidates(), []),
  ])
  const relevantOuts = rawRelevantOuts.filter(
    (row) => !lineupsProjections.roleByPlayerName.has(normaliseLineupPlayerName(row.player))
  )

  return (
    <div className="space-y-4">
      <div>
        <FantasyBackLink />
      </div>

      <FantasyDashboard
        fantasyPlayers={fantasyPlayers}
        fantasyCoachPlayers={fantasyCoachPlayers}
        lineupsProjections={lineupsProjections}
        availableYears={unlockedYears}
        defaultYears={initialPlayerStatsYears}
        initialPlayerStats={initialPlayerStats}
        canAccessLoginSeason={canAccessLoginSeason}
        canBypassPlotGate={canBypassPlotGate}
        draw2026Data={draw2026Data}
        playerImages={playerImages}
        teamLogos={teamLogos}
        initialSelectedFantasyName={selectedPlayer.name}
        showOwnedCards={false}
        showPlayerComments
        playerRouteBasePath="/dashboard/fantasy"
        ownershipBaselineSnapshot={ownershipBaselineSnapshot}
        casualtyWardRows={casualtyWardRows}
        relevantOuts={relevantOuts}
        relevantOutCandidates={relevantOutCandidates}
        originChances={originChances}
      />
    </div>
  )
}
