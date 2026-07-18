"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { BillingPageLink } from "@/components/billing/billing-page-link"
import { ImageWithFallback } from "@/components/ui/image-with-fallback"
import { generateMatchupInsights, type MatchupInsight, type PlayerTryHistory } from "@/lib/lineups/matchup-insights"
import type { StatsinsiderTryChart } from "@/lib/supabase/queries"
import type {
  LineupCasualtyOut,
  LineupCompetition,
  LineupLiveMatch,
  LineupLivePlayerState,
  LineupLivePlayerStats,
  LineupMatch,
  LineupMatchPrediction,
  LineupMatchStats,
  LineupPlayer,
  LineupRecentResult,
  LineupSportsbetOdds,
  LineupTeam,
  LineupTeamMatchStats,
  LineupTryscorerOdds,
  LineupYearOption,
} from "@/lib/lineups/nrl-lineups"
import type { LineupWeatherForecast } from "@/lib/lineups/weather"

interface LineupsDashboardProps {
  matches: LineupMatch[]
  year: number
  liveMatches: Record<string, LineupLiveMatch>
  weatherForecasts: Record<string, LineupWeatherForecast>
  yearOptions: LineupYearOption[]
  selectedRound: string
  selectedYear: number
  selectedCompetition: LineupCompetition
  teamLogos: Record<string, string>
  sportsbetOdds?: Record<string, LineupSportsbetOdds>
  matchPredictions?: Record<string, LineupMatchPrediction>
  tryChartsByTeam: Record<string, StatsinsiderTryChart>
  canAccessFantasyProjections: boolean
  summaryDiagnostic?: string | null
}

interface LineupMatchDetailData {
  match: LineupMatch
  matchStats: LineupMatchStats | null
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  sportsbetOdds: Record<string, LineupSportsbetOdds>
  casualtyWardOuts: Record<string, LineupCasualtyOut[]>
  playerAverages: Record<string, Record<AverageStatKey, number>>
  playerAverageSources: Record<StatsSource, Record<string, Record<AverageStatKey, number>>>
  playerTryHistory: PlayerTryHistory
  positionPpmBaselines: Record<string, number>
}

type Slot = "FB" | "LW" | "LC" | "RW" | "RC" | "FE" | "HLF" | "LK" | "L2R" | "R2R" | "HK" | "PR"
type Orientation = "landscape" | "portrait"
type DisplayMode = "fantasy" | "odds" | AverageStatKey
type StatsSource = "nrl2026" | "origin2026" | "originLifetime"
type LineupDetailView = "lineup" | "stats" | "insights"
type PlayerStatsSelection = {
  player: LineupPlayer
  liveState: LineupLivePlayerState | null
  liveStats: LineupLivePlayerStats | null
  showPregameMetrics: boolean
  baselinePpm: number | null
  baselineLabel: string | null
  averages: Record<AverageStatKey, number> | null
  tryHistory: PlayerTryHistory[string]
  opponent: string | null
  opponentTryHistory: PlayerTryHistory[string]
  tryscorerOdds: LineupTryscorerOdds | null
}

type PlayerStatDisplayItem = {
  label: string
  value: string
}
type PlayerStatDisplayGroup = {
  title: string
  items: PlayerStatDisplayItem[]
}
type AverageStatKey =
  | "Tries"
  | "Try Assists"
  | "All Run Metres"
  | "Post Contact Metres"
  | "Tackles Made"
  | "Tackle Efficiency"
  | "Line Breaks"
  | "Line Break Assists"
  | "Errors"
  | "Missed Tackles"
  | "Receipts"
  | "Tackle Breaks"
  | "Offloads"

function fallbackLineupMatchDetail(match: LineupMatch): LineupMatchDetailData {
  return {
    match,
    matchStats: null,
    tryscorerOdds: {},
    sportsbetOdds: {},
    casualtyWardOuts: {},
    playerAverages: {},
    playerAverageSources: {
      nrl2026: {},
      origin2026: {},
      originLifetime: {},
    },
    playerTryHistory: {},
    positionPpmBaselines: {},
  }
}

const BLUE_GRADIENT_BORDER_STYLE: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(28,35,62,0.98), rgba(28,35,62,0.98)) padding-box, linear-gradient(rgba(96,165,250,0.46), rgba(96,165,250,0.46)) border-box",
}

const MATCH_CARD_TEXTURE_STYLE: CSSProperties = {
  backgroundImage:
    "radial-gradient(circle, rgba(226,239,255,0.08) 0 1px, transparent 1.2px), radial-gradient(circle, rgba(0,245,138,0.06) 0 1px, transparent 1.3px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(0deg, rgba(0,245,138,0.018) 1px, transparent 1px)",
  backgroundPosition: "0 0, 9px 10px, 0 0, 0 0",
  backgroundSize: "18px 18px, 22px 22px, 28px 28px, 32px 32px",
}

const BOOKIE_LOGOS: Record<string, string> = {
  Sportsbet: "/logos/sportsbet.png",
  Pointsbet: "/logos/pointsbet.png",
  Unibet: "/logos/unibet.png",
  Palmerbet: "/logos/palmerbet.png",
  Betright: "/logos/betright.png",
  Betr: "/logos/betr.png",
  Deluxebet: "/logos/deluxebet.png",
  Surgebet: "/logos/surgebet.png",
}

const DISPLAY_MODES: { key: DisplayMode; label: string; shortLabel: string }[] = [
  { key: "odds", label: "Best Odds", shortLabel: "Odds" },
  { key: "fantasy", label: "Fantasy Projection", shortLabel: "Proj" },
  { key: "Tries", label: "Try Scoring Avg", shortLabel: "Tries" },
  { key: "Try Assists", label: "Try Assists Avg", shortLabel: "TA" },
  { key: "All Run Metres", label: "Run Metres Avg", shortLabel: "RM" },
  { key: "Post Contact Metres", label: "Post Contact Metres Avg", shortLabel: "PCM" },
  { key: "Tackles Made", label: "Tackles Avg", shortLabel: "TK" },
  { key: "Tackle Efficiency", label: "Tackle Efficiency", shortLabel: "TK%" },
  { key: "Line Breaks", label: "Linebreaks Avg", shortLabel: "LB" },
  { key: "Line Break Assists", label: "Linebreak Assists Avg", shortLabel: "LBA" },
  { key: "Errors", label: "Errors Avg", shortLabel: "ERR" },
  { key: "Missed Tackles", label: "Missed Tackles Avg", shortLabel: "MT" },
  { key: "Receipts", label: "Receipts Avg", shortLabel: "REC" },
  { key: "Tackle Breaks", label: "Tackle Breaks Avg", shortLabel: "TB" },
  { key: "Offloads", label: "Offloads Avg", shortLabel: "OFF" },
]

const STATS_SOURCES: { key: StatsSource; label: string }[] = [
  { key: "nrl2026", label: "2026 NRL" },
  { key: "origin2026", label: "2026 Origin" },
  { key: "originLifetime", label: "Origin lifetime" },
]

function isAverageDisplayMode(mode: DisplayMode): mode is AverageStatKey {
  return mode !== "odds" && mode !== "fantasy"
}

function displayModeShortLabel(mode: DisplayMode): string {
  return DISPLAY_MODES.find((displayMode) => displayMode.key === mode)?.shortLabel ?? String(mode)
}

function statPerGameLabel(mode: AverageStatKey): string {
  if (mode === "Tackle Efficiency") return ""
  return `${displayModeShortLabel(mode)}/g`
}

const DEPTH_X: Record<Slot, number> = {
  FB: 7,
  LW: 14,
  LC: 14,
  RW: 14,
  RC: 14,
  FE: 24,
  HLF: 24,
  LK: 31,
  L2R: 36,
  R2R: 36,
  HK: 43,
  PR: 43,
}

const LANE_Y: Record<Slot, number> = {
  LW: 12,
  LC: 28,
  FB: 50,
  RC: 72,
  RW: 88,
  FE: 39,
  HLF: 61,
  LK: 50,
  L2R: 33,
  R2R: 67,
  HK: 50,
  PR: 21,
}

const PORTRAIT_DEPTH_X: Record<Slot, number> = {
  FB: 8.5,
  LW: 16,
  LC: 16,
  RW: 16,
  RC: 16,
  FE: 26,
  HLF: 26,
  LK: 33,
  L2R: 38,
  R2R: 38,
  HK: 44,
  PR: 44,
}

const PORTRAIT_LANE_Y: Record<Slot, number> = {
  LW: 9,
  LC: 30,
  FB: 50,
  RC: 70,
  RW: 91,
  FE: 38,
  HLF: 62,
  LK: 50,
  L2R: 32,
  R2R: 68,
  HK: 50,
  PR: 18,
}

const POSITION_BASELINE_LABELS: Record<string, string> = {
  FB: "Fullback",
  W: "Winger",
  C: "Centre",
  FE: "Five-eighth",
  HLF: "Halfback",
  HK: "Hooker",
  PR: "Prop",
  "2RF": "2nd row",
  LK: "Lock",
}

const LIVE_MATCH_FRESH_MS = 10 * 60 * 1000
const LIVE_SUPPLEMENTAL_POLL_MS = 30 * 1000
const LIVE_SUPPLEMENTAL_POLL_BEFORE_MS = 30 * 60 * 1000
const LIVE_SUPPLEMENTAL_POLL_AFTER_MS = 4 * 60 * 60 * 1000

function normaliseKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

const TEAM_ALIAS_GROUPS = [
  ["broncos", "brisbane broncos"],
  ["bulldogs", "canterbury bankstown bulldogs", "canterbury bulldogs", "canterbury"],
  ["cowboys", "north queensland cowboys", "north qld cowboys", "north queensland", "nth queensland cowboys", "nth qld cowboys", "nth queensland"],
  ["dolphins", "redcliffe dolphins"],
  ["dragons", "st george illawarra dragons", "st george dragons", "st george illawarra"],
  ["eels", "parramatta eels"],
  ["knights", "newcastle knights"],
  ["panthers", "penrith panthers"],
  ["rabbitohs", "south sydney rabbitohs", "south sydney"],
  ["raiders", "canberra raiders"],
  ["roosters", "sydney roosters"],
  ["sea eagles", "manly sea eagles", "manly warringah sea eagles", "manly"],
  ["sharks", "cronulla sharks", "cronulla sutherland sharks", "cronulla sutherland"],
  ["storm", "melbourne storm"],
  ["titans", "gold coast titans"],
  ["warriors", "new zealand warriors", "nz warriors"],
  ["wests tigers", "tigers", "western suburbs magpies"],
  ["maroons", "queensland", "qld", "queensland maroons"],
  ["blues", "new south wales", "nsw", "new south wales blues"],
]

const STATSINSIDER_TEAM_CODES: Record<string, string> = {
  broncos: "BRI",
  bulldogs: "CBY",
  cowboys: "NQL",
  dolphins: "DOL",
  dragons: "STI",
  eels: "PAR",
  knights: "NEW",
  panthers: "PEN",
  rabbitohs: "SOU",
  raiders: "CBR",
  roosters: "SYD",
  "sea eagles": "MAN",
  sharks: "CRO",
  storm: "MEL",
  titans: "GLD",
  warriors: "WAR",
  "wests tigers": "WST",
}

const ORIGIN_TEAM_LOGOS: Record<string, string> = {
  maroons: "/qld.png",
  queensland: "/qld.png",
  qld: "/qld.png",
  "queensland maroons": "/qld.png",
  blues: "/nsw.png",
  "new south wales": "/nsw.png",
  nsw: "/nsw.png",
  "new south wales blues": "/nsw.png",
}

function teamAliases(value: string | null | undefined): string[] {
  const key = normaliseKey(value)
  if (!key) return []
  const aliases = new Set([key])
  for (const group of TEAM_ALIAS_GROUPS) {
    if (group.includes(key)) group.forEach((alias) => aliases.add(alias))
  }
  return [...aliases]
}

function statsinsiderTeamCode(team: LineupTeam | null): string | null {
  for (const alias of [team?.team, team?.teamName].flatMap(teamAliases)) {
    const code = STATSINSIDER_TEAM_CODES[alias]
    if (code) return code
  }
  return null
}

function normaliseBookieKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

const BOOKIE_LOGOS_BY_KEY = Object.fromEntries(
  Object.entries(BOOKIE_LOGOS).map(([bookie, logo]) => [normaliseBookieKey(bookie), logo])
)

function resolveBookieLogo(bookie: string | null | undefined): string | null {
  if (!bookie) return null
  const candidates = bookie.split(/[,/&+]+/).map((part) => normaliseBookieKey(part)).filter(Boolean)
  for (const candidate of candidates) {
    const logo = BOOKIE_LOGOS_BY_KEY[candidate]
    if (logo) return logo
  }
  return BOOKIE_LOGOS_BY_KEY[normaliseBookieKey(bookie)] ?? null
}

function lineupsMatchTeams(match: LineupMatch): { home: string; away: string } {
  const parts = match.match.split(/\s+v(?:s|\.)?\s+/i).map((part) => part.trim()).filter(Boolean)
  return {
    home: match.homeTeam?.teamName || match.homeTeam?.team || parts[0] || "",
    away: match.awayTeam?.teamName || match.awayTeam?.team || parts.slice(1).join(" v ") || "",
  }
}

function lineupsMatchAnchorId(match: LineupMatch): string {
  const { home, away } = lineupsMatchTeams(match)
  const matchKey = [home, away].map((team) => normaliseKey(team)).filter(Boolean).join("|") || normaliseKey(match.match)
  return `lineups-match-${normaliseKey(`${matchDateKey(match)} ${matchKey}`).replace(/\s+/g, "-")}`
}

function livePlayerKey(player: LineupPlayer): string {
  return player.playerId != null ? String(player.playerId) : `${normaliseKey(player.team)}|${normaliseKey(player.player)}`
}

function getLivePlayerState(liveMatch: LineupLiveMatch | null | undefined, player: LineupPlayer): LineupLivePlayerState | null {
  return liveMatch?.playerStates[livePlayerKey(player)] ?? null
}

function getLivePlayerStats(liveMatch: LineupLiveMatch | null | undefined, player: LineupPlayer): LineupLivePlayerStats | null {
  return (
    liveMatch?.playerStats[livePlayerKey(player)] ??
    liveMatch?.playerStats[`${normaliseKey(player.team)}|${normaliseKey(player.player)}`] ??
    null
  )
}

function historicalLiveMatch(match: LineupMatch, stats: LineupMatchStats | null): LineupLiveMatch | null {
  if (!stats || (stats.scoringEvents.length === 0 && Object.keys(stats.playerStats).length === 0)) return null
  return {
    state: {
      matchId: match.matchId,
      matchState: "Full Time",
      matchMode: null,
      gameSeconds: 80 * 60,
      liveSeconds: 80 * 60,
      homeTeamId: match.homeTeam?.teamId ?? null,
      homeTeam: stats.homeTeam,
      homeScore: match.homeScore ?? stats.home.score,
      awayTeamId: match.awayTeam?.teamId ?? null,
      awayTeam: stats.awayTeam,
      awayScore: match.awayScore ?? stats.away.score,
      updatedAt: null,
    },
    scoringEvents: stats.scoringEvents,
    playerStates: {},
    playerStats: stats.playerStats,
  }
}

function formatGameClock(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.max(0, Math.floor(seconds % 60))
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`
}

function formatMatchState(value: string | null | undefined): string {
  const spaced = String(value ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").trim()
  if (!spaced) return "Live"
  const normalized = spaced.toLowerCase()
  if (normalized === "full time" || normalized === "fulltime") return "FT"
  if (normalized === "half time" || normalized === "halftime") return "HT"
  if (normalized === "second half") return "2nd"
  if (normalized === "first half") return "1st"
  return spaced
}

function formatTryMinute(value: number | null | undefined): string {
  return value == null ? "-" : `${value}'`
}

function formatTryScorerName(value: string | null | undefined): string {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] ?? "Unknown"
  return `${parts[0][0]} ${parts.slice(1).join(" ")}`
}

function isUpcomingMatchState(value: string | null | undefined): boolean {
  const state = String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  return state === "upcoming" || state === "scheduled" || state === "pre match" || state === "prematch"
}

function isCompletedMatchState(value: string | null | undefined): boolean {
  const state = String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  return state === "full time" || state === "fulltime" || state === "final" || state === "finished" || state === "complete" || state === "completed"
}

function isFreshLiveUpdate(value: string | null | undefined): boolean {
  if (!value) return false
  const updatedAt = new Date(value).getTime()
  if (!Number.isFinite(updatedAt)) return false
  return Date.now() - updatedAt <= LIVE_MATCH_FRESH_MS
}

function liveScore(liveMatch: LineupLiveMatch | null | undefined): { homeScore: number | null; awayScore: number | null } {
  const state = liveMatch?.state
  if (state && (state.homeScore != null || state.awayScore != null)) {
    return { homeScore: state.homeScore, awayScore: state.awayScore }
  }

  const latestScoreEvent = [...(liveMatch?.scoringEvents ?? [])]
    .reverse()
    .find((event) => event.homeScore != null || event.awayScore != null)
  return {
    homeScore: latestScoreEvent?.homeScore ?? null,
    awayScore: latestScoreEvent?.awayScore ?? null,
  }
}

function matchScore(match: LineupMatch, liveMatch: LineupLiveMatch | null | undefined): { homeScore: number | null; awayScore: number | null } {
  const score = liveScore(liveMatch)
  return {
    homeScore: score.homeScore ?? match.homeScore ?? null,
    awayScore: score.awayScore ?? match.awayScore ?? null,
  }
}

function completedPlayerStatsForPlayer(playerStats: Record<string, LineupLivePlayerStats>, player: LineupPlayer): LineupLivePlayerStats | null {
  return playerStats[`${normaliseKey(player.team)}|${normaliseKey(player.player)}`] ?? null
}

function historicalSideForNumber(number: number | null): LineupPlayer["side"] {
  if (number === 5 || number === 4 || number === 11 || number === 6) return "left"
  if (number === 2 || number === 3 || number === 12 || number === 7) return "right"
  if (number === 9 || number === 1) return "spine"
  if (number === 8 || number === 10 || number === 13) return "middle"
  return "unknown"
}

function applyCompletedPlayerStats(players: LineupPlayer[], matchStats: LineupMatchStats | null, team: LineupTeam | null): LineupPlayer[] {
  if (!matchStats || !team) return players
  const existingPlayerKeys = new Set(players.map((player) => normaliseKey(player.player)))
  const adjustedPlayers = players.map((player) => {
    const stats = completedPlayerStatsForPlayer(matchStats.playerStats, player)
    if (!stats) return player
    return {
      ...player,
      number: stats.number ?? player.number,
      position: stats.position ?? player.position,
      isOnField: stats.minutesPlayed != null ? stats.minutesPlayed > 0 : player.isOnField,
    }
  })

  const teamKeys = new Set([team.team, team.teamName].flatMap(teamAliases))
  const missingPlayers = Object.values(matchStats.playerStats)
    .filter((stats) => stats.player && stats.team && teamKeys.has(normaliseKey(stats.team)))
    .filter((stats) => !existingPlayerKeys.has(normaliseKey(stats.player)))
    .filter((stats) => (stats.minutesPlayed ?? 0) > 0)
    .map((stats): LineupPlayer => ({
      matchId: matchStats.matchId,
      team: team.team,
      teamName: team.teamName,
      teamId: team.teamId,
      teamType: team.teamType,
      number: stats.number,
      position: stats.position ?? "Interchange",
      player: stats.player ?? "Unknown",
      playerId: null,
      isCaptain: false,
      isOnField: true,
      headImage: null,
      bodyImage: null,
      fantasyProjection: null,
      side: historicalSideForNumber(stats.number),
      sideSource: "unknown",
    }))

  return [...adjustedPlayers, ...missingPlayers].sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
}

function historicalPlayersFromStats(
  matchStats: LineupMatchStats | null,
  teamStats: LineupTeamMatchStats | null | undefined,
  teamType: "Home" | "Away"
): LineupPlayer[] {
  if (!matchStats || !teamStats?.team) return []

  const teamKeys = new Set(teamAliases(teamStats.team))
  return Object.values(matchStats.playerStats)
    .filter((stats) => stats.player && stats.team && teamKeys.has(normaliseKey(stats.team)))
    .filter((stats) => (stats.minutesPlayed ?? 0) > 0)
    .map((stats): LineupPlayer => ({
      matchId: matchStats.matchId,
      team: teamStats.team,
      teamName: teamStats.team,
      teamId: null,
      teamType,
      number: stats.number,
      position: stats.position ?? "Interchange",
      player: stats.player ?? "Unknown",
      playerId: null,
      isCaptain: false,
      isOnField: true,
      headImage: null,
      bodyImage: null,
      fantasyProjection: null,
      side: historicalSideForNumber(stats.number),
      sideSource: "unknown",
    }))
    .sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
}

function historicalTeamFromStats(
  matchStats: LineupMatchStats | null,
  teamStats: LineupTeamMatchStats | null | undefined,
  teamType: "Home" | "Away",
  players: LineupPlayer[]
): LineupTeam | null {
  if (!matchStats || !teamStats?.team || players.length === 0) return null
  return {
    team: teamStats.team,
    teamName: teamStats.team,
    teamId: null,
    teamType,
    players,
  }
}

function hasMatchStarted(liveMatch: LineupLiveMatch | null | undefined): boolean {
  const state = liveMatch?.state
  if (!state) return (liveMatch?.scoringEvents.length ?? 0) > 0
  if (isUpcomingMatchState(state.matchState)) return false
  return Boolean(
    (state.gameSeconds != null && state.gameSeconds > 0) ||
    state.homeScore != null ||
    state.awayScore != null ||
    (liveMatch?.scoringEvents.length ?? 0) > 0
  )
}

function isMatchLive(liveMatch: LineupLiveMatch | null | undefined): boolean {
  const state = liveMatch?.state
  if (!hasMatchStarted(liveMatch) || isCompletedMatchState(state?.matchState)) return false
  return isFreshLiveUpdate(state?.updatedAt)
}

function isStaleUnfinishedMatch(liveMatch: LineupLiveMatch | null | undefined): boolean {
  const state = liveMatch?.state
  return Boolean(hasMatchStarted(liveMatch) && !isCompletedMatchState(state?.matchState) && !isFreshLiveUpdate(state?.updatedAt))
}

function isLiveDataVisible(liveMatch: LineupLiveMatch | null | undefined): boolean {
  const state = liveMatch?.state
  return Boolean(
    state ||
    (liveMatch?.scoringEvents.length ?? 0) > 0 ||
    Object.keys(liveMatch?.playerStates ?? {}).length > 0 ||
    Object.keys(liveMatch?.playerStats ?? {}).length > 0
  )
}

function shouldPollLiveSupplemental(matches: LineupMatch[], now = new Date()): boolean {
  const nowMs = now.getTime()
  return matches.some((match) => {
    if (!match.kickoffUtc) return false
    const kickoffMs = Date.parse(match.kickoffUtc)
    if (!Number.isFinite(kickoffMs)) return false
    return nowMs >= kickoffMs - LIVE_SUPPLEMENTAL_POLL_BEFORE_MS && nowMs <= kickoffMs + LIVE_SUPPLEMENTAL_POLL_AFTER_MS
  })
}

function dedupeScoringEvents(events: LineupLiveMatch["scoringEvents"]): LineupLiveMatch["scoringEvents"] {
  const deduped = new Map<string, LineupLiveMatch["scoringEvents"][number]>()

  for (const event of events) {
    const hasScore = event.homeScore != null || event.awayScore != null
    const key = hasScore
      ? [
          event.scoringType,
          event.teamId ?? normaliseKey(event.team),
          event.playerId ?? normaliseKey(event.player),
          event.homeScore ?? "",
          event.awayScore ?? "",
        ].join("|")
      : [
          event.scoringType,
          event.teamId ?? normaliseKey(event.team),
          event.playerId ?? normaliseKey(event.player),
          event.gameSeconds ?? "",
          event.matchMinute ?? "",
        ].join("|")
    const existing = deduped.get(key)
    if (!existing || (event.timelineIndex ?? -1) >= (existing.timelineIndex ?? -1)) deduped.set(key, event)
  }

  return [...deduped.values()].sort(
    (a, b) => (a.timelineIndex ?? 9999) - (b.timelineIndex ?? 9999) || (a.gameSeconds ?? 0) - (b.gameSeconds ?? 0)
  )
}

function scoringEventMatchesTeam(event: LineupLiveMatch["scoringEvents"][number], team: LineupTeam | null): boolean {
  if (!team) return false
  if (event.teamId != null && team.teamId != null) return event.teamId === team.teamId
  if (!event.team) return false
  return new Set([team.team, team.teamName].flatMap(teamAliases)).has(normaliseKey(event.team))
}

function resolveTeamLogo(teamName: string | null | undefined, teamLogos: Record<string, string>): string | null {
  if (!teamName) return null
  const candidates = [
    ...teamAliases(teamName),
    teamName,
    teamName.replace(/^North Queensland /, ""),
    teamName.replace(/^Gold Coast /, ""),
  ]
  for (const candidate of candidates) {
    const key = normaliseKey(candidate)
    const logo = ORIGIN_TEAM_LOGOS[key] ?? teamLogos[key]
    if (logo) return logo
  }
  return null
}

function resolveLogo(team: LineupTeam | null, teamLogos: Record<string, string>): string | null {
  if (!team) return null
  return resolveTeamLogo(team.team, teamLogos) ?? resolveTeamLogo(team.teamName, teamLogos)
}

function isStormTeam(team: LineupTeam | null): boolean {
  if (!team) return false
  return [team.team, team.teamName].flatMap(teamAliases).includes("storm")
}

function isBroncosTeam(team: LineupTeam | null): boolean {
  if (!team) return false
  return [team.team, team.teamName].flatMap(teamAliases).includes("broncos")
}

function isRabbitohsTeam(team: LineupTeam | null): boolean {
  if (!team) return false
  return [team.team, team.teamName].flatMap(teamAliases).includes("rabbitohs")
}

function matchDateKey(match: LineupMatch): string {
  if (match.matchDate) return match.matchDate
  if (!match.kickoffUtc) return "tbc"
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(match.kickoffUtc))
}

function formatMatchDateHeader(dateKey: string): string {
  if (dateKey === "tbc") return "Date TBC"
  const date = new Date(`${dateKey}T00:00:00+10:00`)
  if (Number.isNaN(date.getTime())) return dateKey
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Australia/Brisbane",
  }).format(date)
}

function formatKickoffTime(value: string | null): string {
  if (!value) return "TBC"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "TBC"
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Australia/Brisbane",
  }).format(date).replace(/\s/g, "")
}

function normaliseImageUrl(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`

  const marker = "/remote.axd?"
  const markerIndex = trimmed.indexOf(marker)
  if (markerIndex >= 0) {
    const nested = trimmed.slice(markerIndex + marker.length)
    if (nested.startsWith("http://")) return `https://${nested.slice("http://".length)}`
    if (nested) return nested
  }

  return trimmed
}

function playerImageSources(...sources: Array<string | null | undefined>): string[] {
  const out = sources.flatMap((source) => {
    const normalised = normaliseImageUrl(source ?? null)
    return normalised ? [normalised] : []
  })
  return out
}

function displayName(player: LineupPlayer): string {
  const parts = player.player.split(/\s+/).filter(Boolean)
  const last = parts.at(-1) ?? player.player
  return `${player.isCaptain ? "(C) " : ""}${last}`
}

function formatAverage(value: number | null | undefined, mode: AverageStatKey): string {
  if (value == null) return "-"
  if (mode === "All Run Metres" || mode === "Post Contact Metres" || mode === "Receipts") return value.toFixed(0)
  if (mode === "Tackle Efficiency") return `${value.toFixed(1)}%`
  return value.toFixed(1)
}

function PlayerMetric({
  player,
  displayMode,
  tryscorerOdds,
  playerAverages,
  canAccessFantasyProjections,
  compact,
}: {
  player: LineupPlayer
  displayMode: DisplayMode
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  playerAverages: Record<string, Record<AverageStatKey, number>>
  canAccessFantasyProjections: boolean
  compact: boolean
}) {
  const playerKey = normaliseKey(player.player)
  const textClass = compact ? "text-[10px]" : "text-[11px]"

  if (displayMode === "fantasy") {
    if (!canAccessFantasyProjections) {
      return <div className={`${textClass} font-semibold leading-tight text-emerald-100/60`}>-</div>
    }
    return player.fantasyProjection != null ? (
      <div className={`${textClass} font-semibold leading-tight text-emerald-100/90`}>{Math.round(player.fantasyProjection)} proj</div>
    ) : (
      <div className={`${textClass} font-semibold leading-tight text-emerald-100/60`}>-</div>
    )
  }

  if (displayMode === "odds") {
    const odds = tryscorerOdds[playerKey]
    const logo = resolveBookieLogo(odds?.bestBookie)
    return odds?.bestPrice != null ? (
      <div className={`mt-0.5 flex items-center justify-center gap-1 ${textClass} font-semibold leading-tight text-emerald-100/90`}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={odds.bestBookie ?? ""} className={`${compact ? "h-2.5" : "h-3"} w-auto object-contain`} loading="lazy" />
        ) : null}
        <span>{odds.bestPrice.toFixed(2)}</span>
      </div>
    ) : (
      <div className={`${textClass} font-semibold leading-tight text-emerald-100/60`}>-</div>
    )
  }

  if (!isAverageDisplayMode(displayMode)) return null

  const statLabel = statPerGameLabel(displayMode)
  return (
    <div className={`${textClass} font-semibold leading-tight text-emerald-100/90`}>
      {formatAverage(playerAverages[playerKey]?.[displayMode], displayMode)}
      {statLabel ? ` ${statLabel}` : ""}
    </div>
  )
}

function LiveStatusIcon({ type, compact = false }: { type: "off" | "on"; compact?: boolean }) {
  const isOff = type === "off"
  return (
    <span
      className={`${compact ? "h-4 w-4" : "h-5 w-5"} grid place-items-center rounded-full border ${
        isOff
          ? "border-red-200/70 bg-red-500 text-white shadow-[0_0_0_2px_rgba(127,29,29,0.42)]"
          : "border-emerald-100/75 bg-emerald-400 text-emerald-950 shadow-[0_0_0_2px_rgba(6,78,59,0.35)]"
      }`}
      title={isOff ? "Off field" : "On field"}
      aria-label={isOff ? "Off field" : "On field"}
    >
      <svg viewBox="0 0 16 16" className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} fill="none" aria-hidden="true">
        {isOff ? (
          <path d="M8 3v9M4.5 8.5 8 12l3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M8 13V4M4.5 7.5 8 4l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </span>
  )
}

function weatherConditionEmoji(condition: string): string {
  const value = condition.toLowerCase()
  if (value.includes("storm")) return "⛈️"
  if (value.includes("drizzle")) return "🌦️"
  if (value.includes("rain")) return "🌧️"
  if (value.includes("snow")) return "🌨️"
  if (value.includes("fog")) return "🌫️"
  if (value.includes("partly") || value.includes("mostly")) return "🌤️"
  if (value.includes("cloud")) return "☁️"
  if (value.includes("clear")) return "☀️"
  return "🌤️"
}

function ScoreNumber({ value, align, isWinner, lift = false }: { value: number | null; align: "left" | "right"; isWinner: boolean; lift?: boolean }) {
  return (
    <div
      className={`min-w-[1.55rem] text-[1.7rem] leading-none tabular-nums text-nrl-text sm:min-w-[3.75rem] sm:text-5xl lg:text-6xl ${
        isWinner ? "font-black" : "font-normal"
      } ${
        align === "right" ? "justify-self-end text-right" : "justify-self-start text-left"
      } ${
        lift ? "sm:-translate-y-3" : ""
      }`}
    >
      {value ?? "-"}
    </div>
  )
}

function LiveScoreHeader({
  match,
  liveMatch,
  splitScore = false,
  lift = false,
}: {
  match: LineupMatch
  liveMatch: LineupLiveMatch | null
  splitScore?: boolean
  lift?: boolean
}) {
  const state = liveMatch?.state
  const clock = formatGameClock(state?.gameSeconds ?? state?.liveSeconds)
  const score = matchScore(match, liveMatch)
  const showLiveBadge = isMatchLive(liveMatch)
  const matchStateLabel = state
    ? isStaleUnfinishedMatch(liveMatch)
      ? "FT"
      : formatMatchState(state.matchState)
    : "FT"

  const hasScore = score.homeScore != null || score.awayScore != null

  return (
    <div className={`flex flex-col justify-center px-1.5 text-center sm:px-2 ${lift ? "sm:-translate-y-3" : ""} ${splitScore ? "min-w-[4.7rem] sm:min-w-[6.75rem]" : "min-w-[6.4rem] sm:min-w-[10rem] sm:px-4"}`}>
      {hasScore ? (
        <>
          {showLiveBadge ? (
            <div className={`${splitScore ? "mb-1.5 px-1.5 py-0.5 text-[8px] sm:mb-2 sm:px-2 sm:py-1 sm:text-xs" : "mb-2 px-1.5 py-px text-[8px]"} inline-flex self-center items-center gap-1 rounded-md border border-red-300/30 bg-red-500/15 font-black uppercase tracking-[0.14em] text-red-100`}>
              <span className="h-1 w-1 rounded-full bg-red-300 shadow-[0_0_8px_rgba(252,165,165,0.85)]" aria-hidden="true" />
              {splitScore ? matchStateLabel : "Live"}
            </div>
          ) : null}
          {splitScore ? null : (
            <div className="text-2xl font-black leading-none tabular-nums text-nrl-text sm:text-3xl">
              {score.homeScore ?? "-"} - {score.awayScore ?? "-"}
            </div>
          )}
          {splitScore && clock && showLiveBadge ? (
            <div className="text-[1.0625rem] font-semibold leading-none tabular-nums text-nrl-text sm:text-2xl">{clock}</div>
          ) : (
            <div className={`${splitScore ? "mt-0" : "mt-3.5 sm:mt-5"} inline-flex self-center rounded-full border border-emerald-300/35 bg-emerald-400/12 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.16)] sm:px-2 sm:text-[10px]`}>
              {matchStateLabel}{clock && showLiveBadge && !splitScore ? ` · ${clock}` : ""}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="text-xl font-black leading-none tabular-nums text-nrl-text sm:text-3xl">
            {formatKickoffTime(match.kickoffUtc)}
          </div>
        </>
      )}
    </div>
  )
}

function TeamTryScorersList({
  events,
  showEmpty,
  align = "left",
}: {
  events: LineupLiveMatch["scoringEvents"]
  showEmpty: boolean
  align?: "left" | "right"
}) {
  if (events.length === 0 && !showEmpty) return null

  return (
    <div className={`min-w-0 space-y-1 text-[11px] leading-snug text-nrl-muted sm:text-sm ${align === "right" ? "text-right" : "text-left"}`}>
      {events.length > 0 ? (
        <>
          {events.map((event) => (
            <div key={event.eventKey} className="truncate">
              <span>{formatTryScorerName(event.player)}</span>{" "}
              <span className="font-semibold tabular-nums text-nrl-text">{formatTryMinute(event.matchMinute)}</span>
            </div>
          ))}
        </>
      ) : (
        <div>No tries</div>
      )}
    </div>
  )
}

function LiveTryScorersStrip({ match, liveMatch }: { match: LineupMatch; liveMatch: LineupLiveMatch | null }) {
  if (!isLiveDataVisible(liveMatch)) return null
  const tryEvents = dedupeScoringEvents(liveMatch?.scoringEvents ?? []).filter((event) => event.scoringType === "try")
  const started = hasMatchStarted(liveMatch)
  if (tryEvents.length === 0 && !started) return null
  const homeTries = tryEvents.filter((event) => scoringEventMatchesTeam(event, match.homeTeam))
  const awayTries = tryEvents.filter((event) => scoringEventMatchesTeam(event, match.awayTeam))
  const unmatchedTries = tryEvents.filter(
    (event) => !scoringEventMatchesTeam(event, match.homeTeam) && !scoringEventMatchesTeam(event, match.awayTeam)
  )

  return (
    <div className="mb-3 rounded-md border border-nrl-border bg-nrl-panel/60 px-3 py-3 shadow-[0_14px_32px_rgba(0,0,0,0.24)]">
      {tryEvents.length > 0 ? (
        <div className="mx-auto grid max-w-md grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-4 px-2 sm:gap-6">
          <TeamTryScorersList events={homeTries} showEmpty={started} align="right" />
          <div className="pt-0.5 text-nrl-muted" aria-hidden="true">
            •
          </div>
          <TeamTryScorersList events={awayTries} showEmpty={started} />
          {unmatchedTries.length > 0 ? (
            <div className="col-span-3 mx-auto min-w-0 pt-1">
              <TeamTryScorersList events={unmatchedTries} showEmpty={false} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mx-auto max-w-md px-2 text-left text-[11px] text-nrl-muted sm:text-sm">
          No tries
        </div>
      )}
    </div>
  )
}

function formatStatValue(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return "-"
  return value.toFixed(decimals)
}

function formatCompactStat(value: number | null | undefined, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return "-"
  const rounded = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(value % 1 === 0 ? 0 : 1)
  return `${rounded}${suffix}`
}

function sumLiveStats(
  liveMatch: LineupLiveMatch | null,
  team: LineupTeam | null,
  fallback: LineupTeamMatchStats | null | undefined
): LineupTeamMatchStats | null {
  if (!team) return fallback ?? null
  const teamKey = normaliseKey(team.team)
  const stats = Object.values(liveMatch?.playerStats ?? {}).filter((player) => normaliseKey(player.team) === teamKey)
  if (stats.length === 0) return fallback ?? null

  const sum = (selector: (row: LineupLivePlayerStats) => number | null) =>
    stats.reduce((total, row) => total + (selector(row) ?? 0), 0)

  return {
    team: team.team,
    score: fallback?.score ?? null,
    possessionPct: fallback?.possessionPct ?? null,
    completionRate: fallback?.completionRate ?? null,
    fantasyPoints: sum((row) => row.fantasyPointsTotal),
    tries: sum((row) => row.tries),
    allRunMetres: sum((row) => row.allRunMetres),
    postContactMetres: sum((row) => row.postContactMetres),
    lineBreaks: sum((row) => row.lineBreaks),
    tackleBreaks: sum((row) => row.tackleBreaks),
    tacklesMade: sum((row) => row.tacklesMade),
    missedTackles: sum((row) => row.missedTackles),
    errors: sum((row) => row.errors),
    offloads: sum((row) => row.offloads),
  }
}

function MatchStatCompare({
  label,
  home,
  away,
  suffix = "",
  bar = false,
}: {
  label: string
  home: number | null | undefined
  away: number | null | undefined
  suffix?: string
  bar?: boolean
}) {
  const hasValues = home != null || away != null
  if (!hasValues) return null
  const homeValue = home ?? 0
  const awayValue = away ?? 0
  const total = Math.max(homeValue + awayValue, 1)
  const homePct = Math.min(100, Math.max(0, (homeValue / total) * 100))

  return (
    <div className="rounded-md border border-white/8 bg-nrl-panel-2/55 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wide text-nrl-muted">
        <span>{formatCompactStat(home, suffix)}</span>
        <span>{label}</span>
        <span>{formatCompactStat(away, suffix)}</span>
      </div>
      {bar ? (
        <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
          <div className="bg-nrl-accent" style={{ width: `${homePct}%` }} />
          <div className="bg-sky-400" style={{ width: `${100 - homePct}%` }} />
        </div>
      ) : null}
    </div>
  )
}

function formatResultDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" })
}

function resultSideForTeam(result: LineupRecentResult, team: string): "home" | "away" | null {
  const keys = new Set(teamAliases(team))
  if (keys.has(normaliseKey(result.homeTeam))) return "home"
  if (keys.has(normaliseKey(result.awayTeam))) return "away"
  return null
}

function resultOutcomeForTeam(result: LineupRecentResult, team: string): "W" | "L" | "D" {
  const side = resultSideForTeam(result, team)
  if (!side) return "D"
  const scored = side === "home" ? result.homeScore : result.awayScore
  const conceded = side === "home" ? result.awayScore : result.homeScore
  if (scored > conceded) return "W"
  if (scored < conceded) return "L"
  return "D"
}

function TeamLogoMark({ team, teamLogos }: { team: string; teamLogos: Record<string, string> }) {
  const logo = resolveTeamLogo(team, teamLogos)
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" className="h-6 w-6 object-contain" loading="lazy" />
  ) : (
    <span className="grid h-6 w-6 place-items-center rounded bg-white/8 text-[9px] font-black text-nrl-muted">
      {team.slice(0, 1)}
    </span>
  )
}

function RecentFormPills({ team, results, compact = false }: { team: string; results: LineupRecentResult[]; compact?: boolean }) {
  return (
    <div className={`flex items-center justify-center gap-1.5 ${compact ? "min-h-0 flex-1 flex-col justify-evenly" : ""}`}>
      {results.length > 0 ? (
        results.map((result, index) => {
          const outcome = resultOutcomeForTeam(result, team)
          const className =
            outcome === "W"
              ? "bg-emerald-500/15 text-emerald-300"
              : outcome === "L"
                ? "bg-red-500/12 text-red-300"
                : "bg-white/8 text-nrl-muted"
          const latestClass = index === 0
            ? outcome === "W"
              ? "border-emerald-300"
              : outcome === "L"
                ? "border-red-300"
                : "border-white/40"
            : ""
          return (
            <span
              key={`${team}-${result.matchDate}-${result.homeTeam}-${result.awayTeam}`}
              className={`inline-flex h-5 min-w-7 items-center justify-center rounded-md px-2 text-[10px] font-semibold ${className} ${latestClass || "border border-transparent"}`}
            >
              {outcome}
            </span>
          )
        })
      ) : (
        <span className="text-xs font-semibold text-nrl-muted">No recent form</span>
      )}
    </div>
  )
}

function HeadToHeadResults({ results, teamLogos }: { results: LineupRecentResult[]; teamLogos: Record<string, string> }) {
  return (
    <div className="h-full rounded-lg border border-white/8 bg-nrl-panel-2/55 p-3">
      <div className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.18em] text-nrl-muted">Last 5 head to head</div>
      <div className="space-y-2">
        {results.length > 0 ? (
          results.map((result) => (
            <div
              key={`${result.matchDate}-${result.homeTeam}-${result.awayTeam}`}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-white/8 bg-nrl-panel/60 px-2 py-2"
            >
              <div className="flex min-w-0 items-center justify-center">
                <TeamLogoMark team={result.homeTeam} teamLogos={teamLogos} />
              </div>
              <div className="text-center">
                <div className="text-sm font-black tabular-nums text-nrl-text">{result.homeScore} - {result.awayScore}</div>
                <div className="text-[10px] font-semibold text-nrl-muted">{formatResultDate(result.matchDate)}</div>
              </div>
              <div className="flex min-w-0 items-center justify-center">
                <TeamLogoMark team={result.awayTeam} teamLogos={teamLogos} />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-white/8 bg-nrl-panel/60 px-3 py-4 text-center text-sm text-nrl-muted">
            No recent head-to-head results.
          </div>
        )}
      </div>
    </div>
  )
}

function PregameMatchStatsPreview({ match, teamLogos }: { match: LineupMatch; teamLogos: Record<string, string> }) {
  const homeTeam = match.homeTeam?.team ?? match.match.split(/\s+vs\s+/i)[0]?.trim() ?? "Home"
  const awayTeam = match.awayTeam?.team ?? match.match.split(/\s+vs\s+/i)[1]?.trim() ?? "Away"
  const homeResults = (match.homeRecentResults ?? []).slice(0, 5)
  const awayResults = (match.awayRecentResults ?? []).slice(0, 5)
  const headToHead = (match.recentHeadToHead ?? []).slice(0, 5)

  return (
    <div className="space-y-3 rounded-lg border border-nrl-border bg-nrl-panel/70 p-3 shadow-[0_16px_34px_rgba(0,0,0,0.22)]">
      <div className="grid grid-cols-[minmax(3.2rem,0.42fr)_minmax(0,1.7fr)_minmax(3.2rem,0.42fr)] gap-2 sm:gap-3">
        <div className="flex h-full flex-col rounded-lg border border-white/8 bg-nrl-panel-2/55 p-2 text-center sm:p-3">
          <div className="mb-2 flex justify-center sm:hidden">
            <TeamLogoMark team={homeTeam} teamLogos={teamLogos} />
          </div>
          <div className="mb-2 hidden truncate text-xs font-black text-nrl-text sm:block">{homeTeam}</div>
          <RecentFormPills team={homeTeam} results={homeResults} compact />
        </div>
        <HeadToHeadResults results={headToHead} teamLogos={teamLogos} />
        <div className="flex h-full flex-col rounded-lg border border-white/8 bg-nrl-panel-2/55 p-2 text-center sm:p-3">
          <div className="mb-2 flex justify-center sm:hidden">
            <TeamLogoMark team={awayTeam} teamLogos={teamLogos} />
          </div>
          <div className="mb-2 hidden truncate text-xs font-black text-nrl-text sm:block">{awayTeam}</div>
          <RecentFormPills team={awayTeam} results={awayResults} compact />
        </div>
      </div>
    </div>
  )
}

function FixtureOnlyPanel() {
  return (
    <div className="rounded-lg border border-nrl-border bg-nrl-panel/70 px-4 py-5 text-sm text-nrl-muted">
      Team lists are unavailable for this game while live lineup data is offline.
    </div>
  )
}

function MatchStatsPanel({
  match,
  liveMatch,
  stats,
  teamLogos,
}: {
  match: LineupMatch
  liveMatch: LineupLiveMatch | null
  stats: LineupMatchStats | null
  teamLogos: Record<string, string>
}) {
  const score = matchScore(match, liveMatch)
  const baseHome = stats?.home
  const baseAway = stats?.away
  const home = sumLiveStats(liveMatch, match.homeTeam, baseHome)
  const away = sumLiveStats(liveMatch, match.awayTeam, baseAway)
  const isPregame = !hasMatchStarted(liveMatch) && match.homeScore == null && match.awayScore == null
  const isFixtureOnly = match.matchId.startsWith("draw-2026-")

  if (!home || !away) {
    if (isPregame) return <PregameMatchStatsPreview match={match} teamLogos={teamLogos} />
    if (isFixtureOnly) return <FixtureOnlyPanel />
    return (
      <div className="rounded-lg border border-nrl-border bg-nrl-panel/70 px-4 py-5 text-sm text-nrl-muted">
        No match stats available for this game yet.
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-nrl-border bg-nrl-panel/70 p-3 shadow-[0_16px_34px_rgba(0,0,0,0.22)]">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <div className="truncate text-sm font-black text-nrl-text">{home.team}</div>
        <div className="text-xl font-black tabular-nums text-nrl-text">
          {score.homeScore ?? home.score ?? "-"} - {score.awayScore ?? away.score ?? "-"}
        </div>
        <div className="truncate text-sm font-black text-nrl-text">{away.team}</div>
      </div>
      <MatchStatCompare label="Possession" home={home.possessionPct} away={away.possessionPct} suffix="%" bar />
      <div className="grid gap-2 sm:grid-cols-2">
        <MatchStatCompare label="Fantasy" home={home.fantasyPoints} away={away.fantasyPoints} />
        <MatchStatCompare label="Completion" home={home.completionRate} away={away.completionRate} suffix="%" />
        <MatchStatCompare label="Run metres" home={home.allRunMetres} away={away.allRunMetres} />
        <MatchStatCompare label="Post contact" home={home.postContactMetres} away={away.postContactMetres} />
        <MatchStatCompare label="Line breaks" home={home.lineBreaks} away={away.lineBreaks} />
        <MatchStatCompare label="Tackle breaks" home={home.tackleBreaks} away={away.tackleBreaks} />
        <MatchStatCompare label="Tackles" home={home.tacklesMade} away={away.tacklesMade} />
        <MatchStatCompare label="Missed tackles" home={home.missedTackles} away={away.missedTackles} />
        <MatchStatCompare label="Errors" home={home.errors} away={away.errors} />
        <MatchStatCompare label="Offloads" home={home.offloads} away={away.offloads} />
      </div>
    </div>
  )
}

const FANTASY_BASELINE_RATIO_MAX = 2

function fantasyPointsPerMinute(liveStats: LineupLivePlayerStats | null | undefined): number | null {
  const minutes = liveStats?.minutesPlayed
  const fantasy = liveStats?.fantasyPointsTotal
  if (minutes == null || fantasy == null || minutes <= 0) return null
  return fantasy / minutes
}

function fantasyBaselineRatio(
  liveStats: LineupLivePlayerStats | null | undefined,
  baselinePpm: number | null | undefined
): number | null {
  const ppm = fantasyPointsPerMinute(liveStats)
  if (ppm == null || baselinePpm == null || baselinePpm <= 0) return null
  return ppm / baselinePpm
}

function fantasyBaselinePercent(value: number): number {
  return Math.max(0, Math.min(100, (value / FANTASY_BASELINE_RATIO_MAX) * 100))
}

function fantasyBaselineFillColor(value: number | null): string {
  if (value == null) return "rgba(148, 163, 184, 0.35)"
  if (value < 0.7) return "#ef4444"
  if (value < 0.9) return "#f97316"
  if (value < 1.1) return "#facc15"
  if (value < 1.35) return "#84cc16"
  return "#22c55e"
}

function FantasyBaselineBar({
  stats,
  baselinePpm,
  baselineLabel,
  compact = false,
  className = "",
}: {
  stats: LineupLivePlayerStats | null | undefined
  baselinePpm: number | null | undefined
  baselineLabel: string | null | undefined
  compact?: boolean
  className?: string
}) {
  if (!stats) return null
  const ppm = fantasyPointsPerMinute(stats)
  const ratio = fantasyBaselineRatio(stats, baselinePpm)
  const title =
    ppm == null || ratio == null
      ? "Fantasy points per minute baseline unavailable"
      : `${baselineLabel ?? "Position"} PPM: ${ppm.toFixed(2)} vs ${baselinePpm?.toFixed(2)} baseline (${ratio.toFixed(2)}x)`

  return (
    <div className={`${compact ? "h-2 w-11" : "h-2.5 w-16"} ${className}`} title={title} aria-label={title}>
      <div className="h-full overflow-hidden rounded-full border border-white/20 bg-white/12 shadow-inner">
        <div
          className="h-full rounded-full transition-[width,background-color]"
          style={{
            width: `${ratio == null ? 0 : fantasyBaselinePercent(ratio)}%`,
            backgroundColor: fantasyBaselineFillColor(ratio),
          }}
        />
      </div>
    </div>
  )
}

function PlayerStatTile({ item }: { item: PlayerStatDisplayItem }) {
  return (
    <div className="min-w-0 rounded-md bg-nrl-panel px-3 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
      <div className="truncate text-[9px] font-bold uppercase tracking-wide text-nrl-muted">{item.label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums text-nrl-text">{item.value}</div>
    </div>
  )
}

function PlayerStatGroup({ group }: { group: PlayerStatDisplayGroup }) {
  return (
    <section className="rounded-md border border-nrl-border bg-nrl-panel-2/70 p-2 shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-nrl-muted">{group.title}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {group.items.map((item) => (
          <PlayerStatTile key={`${group.title}-${item.label}`} item={item} />
        ))}
      </div>
    </section>
  )
}

function formatTriesPerGame(tries: number, games: number): string {
  if (!Number.isFinite(tries) || !Number.isFinite(games) || games <= 0) return "-"
  return `${(tries / games).toFixed(2)}/g`
}

function TryRateTile({ label, value, subtext }: { label: string; value: string; subtext: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-nrl-muted">{label}</div>
      <div className="mt-1 truncate text-xl font-black text-emerald-300">{value}</div>
      <div className="text-[10px] font-semibold text-nrl-muted">{subtext}</div>
    </div>
  )
}

function TryHistoryDots({ history }: { history: PlayerTryHistory[string] }) {
  if (history.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {[...history].slice(0, 10).reverse().map((entry, index) => (
        <span
          key={`${entry.year}-${entry.round}-${index}`}
          className={`grid h-6 w-6 place-items-center rounded-full border text-[10px] font-black ${
            entry.tries > 0
              ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-200"
              : "border-red-300/45 bg-red-400/12 text-red-200"
          }`}
          title={`${entry.year} R${entry.round}${entry.opponent ? ` v ${entry.opponent}` : ""}: ${entry.tries} tries`}
        >
          {entry.tries}
        </span>
      ))}
    </div>
  )
}

function shortLineupTeamName(value: string | null): string {
  const key = normaliseKey(value)
  const labels: Record<string, string> = {
    "brisbane broncos": "Broncos",
    broncos: "Broncos",
    "canberra raiders": "Raiders",
    raiders: "Raiders",
    "canterbury bankstown bulldogs": "Bulldogs",
    bulldogs: "Bulldogs",
    "cronulla sutherland sharks": "Sharks",
    sharks: "Sharks",
    dolphins: "Dolphins",
    "gold coast titans": "Titans",
    titans: "Titans",
    "manly warringah sea eagles": "Sea Eagles",
    "manly sea eagles": "Sea Eagles",
    "sea eagles": "Sea Eagles",
    manly: "Sea Eagles",
    "melbourne storm": "Storm",
    storm: "Storm",
    "newcastle knights": "Knights",
    knights: "Knights",
    "new zealand warriors": "Warriors",
    warriors: "Warriors",
    "north queensland cowboys": "Cowboys",
    cowboys: "Cowboys",
    "parramatta eels": "Eels",
    eels: "Eels",
    "penrith panthers": "Panthers",
    panthers: "Panthers",
    "south sydney rabbitohs": "Rabbitohs",
    rabbitohs: "Rabbitohs",
    "st george illawarra dragons": "Dragons",
    dragons: "Dragons",
    "sydney roosters": "Roosters",
    roosters: "Roosters",
    "wests tigers": "Tigers",
    tigers: "Tigers",
  }
  return labels[key] ?? value ?? "Opponent"
}

function PlayerTryFormPanel({ selection }: { selection: PlayerStatsSelection }) {
  const { player, averages, tryHistory, opponent, opponentTryHistory, tryscorerOdds, baselineLabel } = selection
  const recentFive = tryHistory.slice(0, 5)
  const recentTen = tryHistory.slice(0, 10)
  const scoredFive = recentFive.filter((entry) => entry.tries > 0).length
  const scoredTen = recentTen.filter((entry) => entry.tries > 0).length
  const triesFive = recentFive.reduce((total, entry) => total + entry.tries, 0)
  const triesTen = recentTen.reduce((total, entry) => total + entry.tries, 0)
  const seasonTries = tryHistory.reduce((total, entry) => total + entry.tries, 0)

  return (
    <section className="border-b border-blue-300/10 pb-4">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-nrl-muted">Try form</div>
      <div className="grid grid-cols-3 gap-4">
        <TryRateTile label="L5" value={`${scoredFive}/${recentFive.length}`} subtext={`${triesFive} tries`} />
        <TryRateTile label="L10" value={`${scoredTen}/${recentTen.length}`} subtext={`${triesTen} tries`} />
        <TryRateTile label="Season" value={formatTriesPerGame(seasonTries, tryHistory.length)} subtext={`${seasonTries} in ${tryHistory.length}`} />
      </div>
      {tryHistory.length > 0 ? (
        <div className="mt-3">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-nrl-muted">Recent tries</div>
          <TryHistoryDots history={tryHistory} />
        </div>
      ) : null}
      {opponent ? (
        <div className="mt-3">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-nrl-muted">Vs {shortLineupTeamName(opponent)}</div>
          {opponentTryHistory.length > 0 ? (
            <TryHistoryDots history={opponentTryHistory} />
          ) : (
            <div className="text-xs font-semibold text-nrl-muted">No recent try history against this opponent.</div>
          )}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.08em]">
        <span className="rounded-md border border-blue-300/20 bg-white/[0.03] px-2 py-1 text-nrl-muted">Starts: {player.position || "TBC"}</span>
        <span className="rounded-md border border-blue-300/20 bg-white/[0.03] px-2 py-1 text-nrl-muted">Edge: {player.side}</span>
        {baselineLabel ? <span className="rounded-md border border-blue-300/20 bg-white/[0.03] px-2 py-1 text-nrl-muted">{baselineLabel}</span> : null}
        {tryscorerOdds?.bestPrice != null ? <span className="rounded-md border border-blue-300/20 bg-white/[0.03] px-2 py-1 text-nrl-muted">Anytime best: {tryscorerOdds.bestPrice.toFixed(2)}</span> : null}
        {averages?.Tries != null ? <span className="rounded-md border border-blue-300/20 bg-white/[0.03] px-2 py-1 text-nrl-muted">Avg tries: {averages.Tries.toFixed(2)}</span> : null}
        {triesTen > 0 ? <span className="rounded-md border border-blue-300/20 bg-white/[0.03] px-2 py-1 text-nrl-muted">L10 tries: {triesTen}</span> : null}
      </div>
    </section>
  )
}

function PlayerStatsDialog({ selection, onClose }: { selection: PlayerStatsSelection | null; onClose: () => void }) {
  if (!selection || typeof document === "undefined") return null
  const { player, liveState, liveStats, showPregameMetrics } = selection
  const fantasyPpm = fantasyPointsPerMinute(liveStats)
  const imageSources = playerImageSources(player.cachedHeadImage, player.cachedBodyImage, player.headImage, player.bodyImage)
  const averageItems: PlayerStatDisplayItem[] = DISPLAY_MODES
    .filter((mode): mode is { key: AverageStatKey; label: string; shortLabel: string } => isAverageDisplayMode(mode.key))
    .map((mode) => ({
      label: mode.shortLabel,
      value: selection.averages?.[mode.key] == null ? "-" : formatAverage(selection.averages[mode.key], mode.key),
    }))
  const groups: PlayerStatDisplayGroup[] = [
    {
      title: showPregameMetrics ? "Summary" : "Match facts",
      items: [
        { label: "Mins", value: formatStatValue(liveStats?.minutesPlayed) },
        { label: "Fantasy", value: formatStatValue(liveStats?.fantasyPointsTotal) },
        { label: "Fantasy PPM", value: formatStatValue(fantasyPpm, 2) },
        { label: "Points", value: formatStatValue(liveStats?.points) },
      ],
    },
    {
      title: "Scoring",
      items: [
        { label: "Tries", value: formatStatValue(liveStats?.tries) },
        { label: "Try Assists", value: formatStatValue(liveStats?.tryAssists) },
        { label: "Line Breaks", value: formatStatValue(liveStats?.lineBreaks) },
        { label: "LB Assists", value: formatStatValue(liveStats?.lineBreakAssists) },
      ],
    },
    {
      title: "Attack",
      items: [
        { label: "Runs", value: formatStatValue(liveStats?.allRuns) },
        { label: "Run Metres", value: formatStatValue(liveStats?.allRunMetres) },
        { label: "Post Contact", value: formatStatValue(liveStats?.postContactMetres) },
        { label: "Tackle Breaks", value: formatStatValue(liveStats?.tackleBreaks) },
        { label: "Offloads", value: formatStatValue(liveStats?.offloads) },
        { label: "Receipts", value: formatStatValue(liveStats?.receipts) },
      ],
    },
    {
      title: "Defence",
      items: [
        { label: "Tackles", value: formatStatValue(liveStats?.tacklesMade) },
        { label: "Missed", value: formatStatValue(liveStats?.missedTackles) },
        { label: "Ineffective", value: formatStatValue(liveStats?.ineffectiveTackles) },
      ],
    },
    {
      title: "Kicking / Discipline",
      items: [
        { label: "Kicks", value: formatStatValue(liveStats?.kicks) },
        { label: "Kick Metres", value: formatStatValue(liveStats?.kickMetres) },
        { label: "Errors", value: formatStatValue(liveStats?.errors) },
        { label: "Penalties", value: formatStatValue(liveStats?.penalties) },
      ],
    },
  ]

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-lg border border-blue-300/20 bg-[#071024] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-blue-300/15 bg-[#0b1630] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <ImageWithFallback sources={imageSources} alt={`${player.player} player image`} className="h-14 w-14 shrink-0 rounded-full border border-white/10 bg-nrl-panel object-cover" />
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-nrl-text">{player.player}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-nrl-muted">
                <span>{player.team}</span>
                <span>{player.number ?? "-"} · {player.position || "Position TBC"}</span>
                {liveState ? (
                  <span className={liveState.isOnField ? "font-semibold text-emerald-300" : "font-semibold text-red-200"}>
                    {liveState.isOnField ? "On field" : "Off field"}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-lg font-bold leading-none text-nrl-muted transition-colors hover:text-nrl-text"
            aria-label="Close player stats"
          >
            ×
          </button>
        </div>

        <div className="max-h-[calc(88vh-5.5rem)] space-y-3 overflow-y-auto p-3">
          {showPregameMetrics ? (
            <>
              <PlayerTryFormPanel selection={selection} />
              {averageItems.some((item) => item.value !== "-") ? (
                <PlayerStatGroup group={{ title: "Per-game averages", items: averageItems }} />
              ) : null}
            </>
          ) : null}
          {liveStats ? (
            <>
            {groups.map((group) => (
              <PlayerStatGroup key={group.title} group={group} />
            ))}
            </>
          ) : (
            <div className="rounded-md border border-nrl-border bg-nrl-panel/70 px-4 py-5 text-sm text-nrl-muted">No match facts available for this player yet.</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function playerSlot(player: LineupPlayer): Slot | null {
  const position = player.position.toLowerCase()
  const isInterchange = position.includes("interchange") || position.includes("reserve")
  if (isInterchange && !player.isOnField) return null
  if (player.number === 1 || position.includes("fullback")) return "FB"
  if (player.number === 6) return player.side === "right" ? "HLF" : "FE"
  if (player.number === 7) return player.side === "left" ? "FE" : "HLF"
  if (player.number === 8 || player.number === 10) return "PR"
  if (player.number === 9) return "HK"
  if (player.number === 11 || player.number === 12) return player.side === "right" ? "R2R" : "L2R"
  if (player.number === 13) return "LK"
  if (player.number != null && player.number >= 14) return null
  if (isInterchange) return null
  if (position.includes("five-eighth") || position.includes("five eighth")) return "FE"
  if (position.includes("halfback")) return "HLF"
  if (position.includes("hooker")) return "HK"
  if (position.includes("lock")) return "LK"
  if (position.includes("prop")) return "PR"
  if (position.includes("wing") || player.number === 2 || player.number === 5) return player.side === "right" ? "RW" : "LW"
  if (position.includes("centre") || player.number === 3 || player.number === 4) return player.side === "right" ? "RC" : "LC"
  if (position.includes("row")) return player.side === "right" ? "R2R" : "L2R"
  return null
}

function pitchPlayerKey(player: LineupPlayer): string {
  return `${player.team}-${player.playerId ?? player.number ?? player.player}`
}

function replacementCandidateSlots(player: LineupPlayer): Slot[] {
  if (!player.isOnField || player.number == null || player.number < 14) return []
  const position = player.position.toLowerCase()
  if (position.includes("interchange") || position.includes("reserve")) return []
  if (position.includes("fullback")) return ["FB"]
  if (position.includes("wing")) return ["RW", "LW"]
  if (position.includes("centre") || position.includes("center")) return ["RC", "LC"]
  if (position.includes("five-eighth") || position.includes("five eighth")) return ["FE"]
  if (position.includes("halfback")) return ["HLF"]
  if (position.includes("prop")) return ["PR"]
  if (position.includes("hooker")) return ["HK"]
  if (position.includes("row")) return player.side === "right" ? ["R2R", "L2R"] : ["L2R", "R2R"]
  if (position.includes("lock")) return ["LK"]
  return []
}

function slotCapacity(slot: Slot): number {
  return slot === "PR" ? 2 : 1
}

function buildTeamPitchSlotMap(players: LineupPlayer[]): Map<string, Slot> {
  const slots = new Map<string, Slot>()
  const slotCounts = new Map<Slot, number>()
  const addSlot = (player: LineupPlayer, slot: Slot) => {
    slots.set(pitchPlayerKey(player), slot)
    slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1)
  }
  const isAvailable = (slot: Slot) => (slotCounts.get(slot) ?? 0) < slotCapacity(slot)

  for (const player of players) {
    const slot = playerSlot(player)
    if (!slot) continue
    addSlot(player, slot)
  }

  for (const player of players) {
    const key = pitchPlayerKey(player)
    if (slots.has(key)) continue
    const slot = replacementCandidateSlots(player).find(isAvailable)
    if (!slot) continue
    addSlot(player, slot)
  }

  return slots
}

function buildPropLaneIndexMap(players: LineupPlayer[], pitchSlots: Map<string, Slot>): Map<string, number> {
  const out = new Map<string, number>()
  const props = players.filter((player) => pitchSlots.get(pitchPlayerKey(player)) === "PR")
  const used = new Set<number>()

  const assign = (player: LineupPlayer | undefined, lane: number) => {
    if (!player || used.has(lane)) return
    out.set(pitchPlayerKey(player), lane)
    used.add(lane)
  }

  assign(props.find((player) => player.number === 8), 0)
  assign(props.find((player) => player.number === 10), 1)

  for (const player of props) {
    const key = pitchPlayerKey(player)
    if (out.has(key)) continue
    const lane = [0, 1].find((candidate) => !used.has(candidate))
    if (lane == null) break
    assign(player, lane)
  }

  return out
}

function positionBaselineKeyForPlayer(player: LineupPlayer): string | null {
  if (player.number === 1) return "FB"
  if (player.number === 2 || player.number === 5) return "W"
  if (player.number === 3 || player.number === 4) return "C"
  if (player.number === 6) return "FE"
  if (player.number === 7) return "HLF"
  if (player.number === 8 || player.number === 10) return "PR"
  if (player.number === 9) return "HK"
  if (player.number === 11 || player.number === 12) return "2RF"
  if (player.number === 13) return "LK"

  const position = player.position.toLowerCase()
  if (position.includes("fullback")) return "FB"
  if (position.includes("wing")) return "W"
  if (position.includes("centre") || position.includes("center")) return "C"
  if (position.includes("five-eighth") || position.includes("five eighth")) return "FE"
  if (position.includes("halfback")) return "HLF"
  if (position.includes("hooker")) return "HK"
  if (position.includes("prop")) return "PR"
  if (position.includes("row")) return "2RF"
  if (position.includes("lock")) return "LK"
  return null
}

function positionBaselineForPlayer(player: LineupPlayer, baselines: Record<string, number>): { value: number | null; label: string | null } {
  const key = positionBaselineKeyForPlayer(player)
  if (!key) return { value: null, label: null }
  const value = baselines[key]
  return {
    value: value != null && Number.isFinite(value) && value > 0 ? value : null,
    label: POSITION_BASELINE_LABELS[key] ?? key,
  }
}

function slotPosition(
  slot: Slot,
  player: LineupPlayer,
  side: "home" | "away",
  orientation: Orientation,
  propLaneIndex = 0
): { left: string; top: string } {
  const depthMap = orientation === "portrait" ? PORTRAIT_DEPTH_X : DEPTH_X
  const laneMap = orientation === "portrait" ? PORTRAIT_LANE_Y : LANE_Y
  const propLane = orientation === "portrait" ? 82 : 79
  const depth = depthMap[slot]
  const lane = slot === "PR" && propLaneIndex === 1 ? propLane : laneMap[slot]

  if (orientation === "portrait") {
    const top = side === "home" ? depth : 100 - depth
    const left = side === "home" ? 100 - lane : lane
    return { left: `${left}%`, top: `${top}%` }
  }

  const left = side === "home" ? depth : 100 - depth
  const top = side === "home" ? lane : 100 - lane
  return { left: `${left}%`, top: `${top}%` }
}

const TEAM_BADGE_DISPLAY_NAMES: Record<string, string> = {
  broncos: "Broncos",
  bulldogs: "Bulldogs",
  cowboys: "Cowboys",
  dolphins: "Dolphins",
  dragons: "Dragons",
  eels: "Eels",
  knights: "Knights",
  panthers: "Panthers",
  rabbitohs: "Rabbitohs",
  raiders: "Raiders",
  roosters: "Roosters",
  "sea eagles": "Sea Eagles",
  sharks: "Sharks",
  storm: "Storm",
  titans: "Titans",
  warriors: "Warriors",
  "wests tigers": "Tigers",
}

function displayTeamBadgeName(value: string): string {
  for (const alias of teamAliases(value)) {
    const displayName = TEAM_BADGE_DISPLAY_NAMES[alias]
    if (displayName) return displayName
  }
  return value
}

function TeamBadge({
  team,
  teamLogos,
}: {
  team: LineupTeam | null
  teamLogos: Record<string, string>
}) {
  const logo = resolveLogo(team, teamLogos)
  const shortName = displayTeamBadgeName(team?.team ?? team?.teamName ?? "TBC")

  return (
    <div className="flex min-h-[5rem] w-[4rem] min-w-0 max-w-full -translate-y-0.5 flex-col items-center justify-start gap-0.5 px-1 py-1 text-center sm:min-h-[7.5rem] sm:w-[6.75rem] sm:-translate-y-1.5 sm:px-2.5">
      {logo ? (
        <div className="relative grid h-12 w-12 place-items-center sm:h-20 sm:w-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo}
            alt=""
            className="h-full w-full object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)]"
            loading="lazy"
          />
        </div>
      ) : null}
      <div className="mt-1 w-full min-w-0 sm:mt-1.5">
        <div className="line-clamp-2 text-[10px] font-bold leading-tight text-nrl-text sm:hidden">{shortName}</div>
        <div className="hidden text-wrap text-xs font-bold leading-tight text-nrl-text sm:block">{shortName}</div>
      </div>
    </div>
  )
}

function PitchPlayer({
  player,
  slot,
  propLaneIndex = 0,
  side,
  orientation,
  displayMode,
  tryscorerOdds,
  playerAverages,
  canAccessFantasyProjections,
  showPlayerMetric,
  showLiveIndicators,
  liveMatch,
  positionPpmBaselines,
  onPlayerSelect,
}: {
  player: LineupPlayer
  slot: Slot
  propLaneIndex?: number
  side: "home" | "away"
  orientation: Orientation
  displayMode: DisplayMode
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  playerAverages: Record<string, Record<AverageStatKey, number>>
  canAccessFantasyProjections: boolean
  showPlayerMetric: boolean
  showLiveIndicators: boolean
  liveMatch: LineupLiveMatch | null
  positionPpmBaselines: Record<string, number>
  onPlayerSelect: (player: LineupPlayer) => void
}) {
  const imageSources = playerImageSources(player.cachedHeadImage, player.cachedBodyImage, player.headImage, player.bodyImage)
  const position = slotPosition(slot, player, side, orientation, propLaneIndex)
  const compact = orientation === "portrait"
  const liveState = getLivePlayerState(liveMatch, player)
  const liveStats = getLivePlayerStats(liveMatch, player)
  const baseline = positionBaselineForPlayer(player, positionPpmBaselines)
  const isOffFieldStarter = isMatchLive(liveMatch) && liveState?.isOnField === false

  return (
    <button
      type="button"
      className={`${compact ? "w-14 sm:w-16" : "w-20"} absolute z-[2] -translate-x-1/2 -translate-y-1/2 text-center outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-emerald-300`}
      style={position}
      title={`${player.player}${player.sideSource === "override" ? " - side override" : ""}`}
      onClick={() => onPlayerSelect(player)}
    >
      <div className={`${compact ? "h-9 w-9 sm:h-10 sm:w-10" : "h-12 w-12"} relative mx-auto`}>
        <div className="grid h-full w-full place-items-center overflow-hidden rounded-full border-2 border-white/75 bg-nrl-panel shadow-[0_8px_18px_rgba(0,0,0,0.32)]">
          <ImageWithFallback sources={imageSources} alt={`${player.player} player image`} className="h-full w-full object-cover object-top" />
        </div>
        <div className={`${compact ? "-right-3 px-1.5 text-[9px]" : "-right-3.5 px-2 text-[10px]"} absolute -top-1 rounded-full bg-blue-950 py-0.5 font-bold text-white`}>
          {slot}
        </div>
        {isOffFieldStarter ? (
          <div className={`${compact ? "-left-1 -top-1" : "-left-2 -top-1.5"} absolute`}>
            <LiveStatusIcon type="off" compact={compact} />
          </div>
        ) : null}
      </div>
      <div className={`${compact ? "max-w-[3.45rem] text-[9px]" : "text-[11px]"} mx-auto mt-1 whitespace-normal break-words font-bold leading-tight text-white drop-shadow`} title={player.player}>
        {displayName(player)}
      </div>
      {showPlayerMetric ? (
        <PlayerMetric
          player={player}
          displayMode={displayMode}
          tryscorerOdds={tryscorerOdds}
          playerAverages={playerAverages}
          canAccessFantasyProjections={canAccessFantasyProjections}
          compact={compact}
        />
      ) : null}
      {showLiveIndicators ? (
        <FantasyBaselineBar
          stats={liveStats}
          baselinePpm={baseline.value}
          baselineLabel={baseline.label}
          compact={compact}
          className="mx-auto mt-1"
        />
      ) : null}
    </button>
  )
}

function FieldLines({ orientation }: { orientation: Orientation }) {
  const marks = [8, 16.5, 25, 33.5, 41.5, 58.5, 66.5, 75, 83.5, 92]
  return (
    <div className="pointer-events-none absolute inset-0">
      {orientation === "portrait" ? (
        <>
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-emerald-200/45" />
          {marks.map((top) => (
            <div key={top} className="absolute inset-x-0 h-px bg-emerald-200/20" style={{ top: `${top}%` }} />
          ))}
          <div className="absolute left-1/2 top-[7%] h-8 w-0.5 -translate-x-1/2 bg-emerald-200/35" />
          <div className="absolute bottom-[7%] left-1/2 h-8 w-0.5 -translate-x-1/2 bg-emerald-200/35" />
        </>
      ) : (
        <>
          <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-emerald-200/45" />
          {marks.map((left) => (
            <div key={left} className="absolute inset-y-0 w-px bg-emerald-200/20" style={{ left: `${left}%` }} />
          ))}
          <div className="absolute left-[7%] top-1/2 h-0.5 w-8 -translate-y-1/2 bg-emerald-200/35" />
          <div className="absolute right-[7%] top-1/2 h-0.5 w-8 -translate-y-1/2 bg-emerald-200/35" />
        </>
      )}
    </div>
  )
}

function Pitch({
  homePlayers,
  awayPlayers,
  orientation,
  displayMode,
  onDisplayModeChange,
  statsSource,
  onStatsSourceChange,
  selectedCompetition,
  tryscorerOdds,
  playerAverages,
  canAccessFantasyProjections,
  liveMatch,
  positionPpmBaselines,
  showLiveIndicators,
  showPregameMetrics,
  showStatsSourceControl,
  onPlayerSelect,
}: {
  homePlayers: LineupPlayer[]
  awayPlayers: LineupPlayer[]
  orientation: Orientation
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
  statsSource: StatsSource
  onStatsSourceChange: (source: StatsSource) => void
  selectedCompetition: LineupCompetition
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  playerAverages: Record<string, Record<AverageStatKey, number>>
  canAccessFantasyProjections: boolean
  liveMatch: LineupLiveMatch | null
  positionPpmBaselines: Record<string, number>
  showLiveIndicators: boolean
  showPregameMetrics: boolean
  showStatsSourceControl: boolean
  onPlayerSelect: (player: LineupPlayer) => void
}) {
  const sizeClass =
    orientation === "portrait"
      ? "mx-auto h-[840px] w-full max-w-[460px] md:hidden"
      : "hidden h-[520px] w-full md:block"
  const homePitchSlots = buildTeamPitchSlotMap(homePlayers)
  const awayPitchSlots = buildTeamPitchSlotMap(awayPlayers)
  const homePropLaneIndexes = buildPropLaneIndexMap(homePlayers, homePitchSlots)
  const awayPropLaneIndexes = buildPropLaneIndexMap(awayPlayers, awayPitchSlots)

  return (
    <div className={`${sizeClass} relative overflow-hidden rounded-lg border-2 border-emerald-300/45 bg-[radial-gradient(circle_at_50%_50%,rgba(0,245,138,0.16),transparent_30%),linear-gradient(90deg,rgba(8,26,33,0.98),rgba(15,112,73,0.92)_50%,rgba(8,26,33,0.98))]`}>
      <FieldLines orientation={orientation} />
      {showPregameMetrics ? (
        <div className={orientation === "portrait" ? "absolute left-2 top-2 z-[4]" : "absolute left-1/2 top-3 z-[4] -translate-x-1/2"}>
          <DisplayModeControl
            displayMode={displayMode}
            onDisplayModeChange={onDisplayModeChange}
            statsSource={statsSource}
            onStatsSourceChange={onStatsSourceChange}
            selectedCompetition={selectedCompetition}
            showStatsSourceControl={showStatsSourceControl}
            compact={orientation === "portrait"}
          />
        </div>
      ) : null}
      {homePlayers.map((player) => {
        const slot = homePitchSlots.get(pitchPlayerKey(player))
        if (!slot) return null
        return (
          <PitchPlayer
            key={`${orientation}-${player.team}-${player.playerId ?? player.number ?? player.player}`}
            player={player}
            slot={slot}
            propLaneIndex={homePropLaneIndexes.get(pitchPlayerKey(player)) ?? 0}
            side="home"
            orientation={orientation}
            displayMode={displayMode}
            tryscorerOdds={tryscorerOdds}
            playerAverages={playerAverages}
            canAccessFantasyProjections={canAccessFantasyProjections}
            showPlayerMetric={showPregameMetrics}
            showLiveIndicators={showLiveIndicators}
            liveMatch={liveMatch}
            positionPpmBaselines={positionPpmBaselines}
            onPlayerSelect={onPlayerSelect}
          />
        )
      })}
      {awayPlayers.map((player) => {
        const slot = awayPitchSlots.get(pitchPlayerKey(player))
        if (!slot) return null
        return (
          <PitchPlayer
            key={`${orientation}-${player.team}-${player.playerId ?? player.number ?? player.player}`}
            player={player}
            slot={slot}
            propLaneIndex={awayPropLaneIndexes.get(pitchPlayerKey(player)) ?? 0}
            side="away"
            orientation={orientation}
            displayMode={displayMode}
            tryscorerOdds={tryscorerOdds}
            playerAverages={playerAverages}
            canAccessFantasyProjections={canAccessFantasyProjections}
            showPlayerMetric={showPregameMetrics}
            showLiveIndicators={showLiveIndicators}
            liveMatch={liveMatch}
            positionPpmBaselines={positionPpmBaselines}
            onPlayerSelect={onPlayerSelect}
          />
        )
      })}
    </div>
  )
}

function TeamBench({
  team,
  liveMatch,
  positionPpmBaselines,
  showLiveIndicators,
  onPlayerSelect,
}: {
  team: LineupTeam | null
  liveMatch: LineupLiveMatch | null
  positionPpmBaselines: Record<string, number>
  showLiveIndicators: boolean
  onPlayerSelect: (player: LineupPlayer) => void
}) {
  const pitchSlots = buildTeamPitchSlotMap(team?.players ?? [])
  const bench = team?.players.filter((player) => !pitchSlots.has(pitchPlayerKey(player))) ?? []
  const showSubstitutionIndicators = isMatchLive(liveMatch)
  return (
    <div
      className="min-w-0 rounded-md border border-transparent p-2 shadow-[0_12px_28px_rgba(0,0,0,0.24)]"
      style={BLUE_GRADIENT_BORDER_STYLE}
    >
      <div className="mb-1 truncate text-[10px] font-bold uppercase tracking-wide text-nrl-muted">{team?.team ?? "Team"} bench</div>
      {bench.length > 0 ? (
        <div className="grid gap-1 text-[11px] text-nrl-text">
          {bench.map((player) => {
            const liveState = getLivePlayerState(liveMatch, player)
            const liveStats = getLivePlayerStats(liveMatch, player)
            const baseline = positionBaselineForPlayer(player, positionPpmBaselines)
            return (
              <button
                key={`${player.team}-${player.playerId ?? player.number ?? player.player}`}
                type="button"
                onClick={() => onPlayerSelect(player)}
                className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-300"
              >
                <span className="w-5 shrink-0 font-semibold text-nrl-muted">{player.number ?? "-"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{player.player}</span>
                  {showLiveIndicators ? (
                    <FantasyBaselineBar
                      stats={liveStats}
                      baselinePpm={baseline.value}
                      baselineLabel={baseline.label}
                      compact
                      className="mt-1"
                    />
                  ) : null}
                </span>
                {showSubstitutionIndicators && liveState?.isOnField ? <LiveStatusIcon type="on" compact /> : null}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="text-[11px] text-nrl-muted">No bench listed</div>
      )}
    </div>
  )
}

function getTeamOuts(team: LineupTeam | null, casualtyWardOuts: Record<string, LineupCasualtyOut[]>): LineupCasualtyOut[] {
  if (!team) return []
  const namedPlayers = new Set(team.players.map((player) => normaliseKey(player.player)).filter(Boolean))
  const candidates = [team.teamName, team.team]
  for (const candidate of candidates) {
    const outs = casualtyWardOuts?.[normaliseKey(candidate)]
    if (outs?.length) return outs.filter((out) => !namedPlayers.has(normaliseKey(out.player)))
  }
  return []
}

function TeamNotableOuts({ team, outs }: { team: LineupTeam | null; outs: LineupCasualtyOut[] }) {
  return (
    <div className="min-w-0 rounded-md bg-nrl-panel/55 p-2 shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
      <div className="truncate text-[10px] font-bold uppercase tracking-wide text-nrl-muted">{team?.team ?? "Team"}</div>
      {outs.length > 0 ? (
        <div className="mt-1.5 grid gap-1.5">
          {outs.map((out) => (
            <div key={`${out.team}-${out.player}-${out.injury ?? ""}-${out.returnDate ?? ""}`} className="min-w-0">
              <div className="truncate text-[11px] font-semibold leading-tight text-nrl-text">{out.player}</div>
              <div className="truncate text-[10px] leading-tight text-nrl-muted">
                {out.injury ?? "Unavailable"} · Return: {out.returnDate ?? "TBC"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-1.5 text-[11px] text-nrl-muted">No notable outs listed</div>
      )}
    </div>
  )
}

function InjuryIcon() {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-red-300/35 bg-red-500/15 text-red-100" aria-hidden="true">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function NotableOuts({
  homeTeam,
  awayTeam,
  casualtyWardOuts,
}: {
  homeTeam: LineupTeam | null
  awayTeam: LineupTeam | null
  casualtyWardOuts: Record<string, LineupCasualtyOut[]>
}) {
  const homeOuts = getTeamOuts(homeTeam, casualtyWardOuts)
  const awayOuts = getTeamOuts(awayTeam, casualtyWardOuts)
  const totalOuts = homeOuts.length + awayOuts.length

  return (
    <details
      className="group/notable mt-3 overflow-hidden rounded-md border border-transparent shadow-[0_16px_34px_rgba(0,0,0,0.26)]"
      style={BLUE_GRADIENT_BORDER_STYLE}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <InjuryIcon />
          <span className="truncate text-[10px] font-bold uppercase tracking-wide text-nrl-muted">Notable Outs</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] font-semibold tabular-nums text-nrl-muted">{totalOuts}</span>
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4 text-nrl-muted transition-transform group-open/notable:rotate-180"
            fill="none"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className="grid gap-2 border-t border-nrl-border p-2 sm:grid-cols-2">
        <TeamNotableOuts team={homeTeam} outs={homeOuts} />
        <TeamNotableOuts team={awayTeam} outs={awayOuts} />
      </div>
    </details>
  )
}

type TeamFormSummary = {
  wins: number
  losses: number
  draws: number
  pointsFor: number | null
  pointsAgainst: number | null
  winRate: number | null
  lastFive: string
  streak: string
  homeAwayRecord: string
  closeWins: number
  closeGames: number
}

type MatchDriver =
  | {
      kind: "bar"
      label: string
      homeAdvantage: number
      value: string | null
    }
  | {
      kind: "value"
      label: string
      value: string
    }

function teamDisplayName(team: LineupTeam | null, fallback: string): string {
  return team?.team || team?.teamName || fallback
}

function resultScoreForTeam(result: LineupRecentResult, team: string): { for: number; against: number; side: "home" | "away" } | null {
  const side = resultSideForTeam(result, team)
  if (!side) return null
  return side === "home"
    ? { for: result.homeScore, against: result.awayScore, side }
    : { for: result.awayScore, against: result.homeScore, side }
}

function buildTeamFormSummary(team: string, results: LineupRecentResult[], currentSide: "home" | "away"): TeamFormSummary {
  const scored = results
    .map((result) => ({ result, score: resultScoreForTeam(result, team) }))
    .filter((entry): entry is { result: LineupRecentResult; score: NonNullable<ReturnType<typeof resultScoreForTeam>> } => entry.score != null)
  const wins = scored.filter((entry) => entry.score.for > entry.score.against).length
  const losses = scored.filter((entry) => entry.score.for < entry.score.against).length
  const draws = scored.length - wins - losses
  const pointsFor = scored.length > 0 ? scored.reduce((total, entry) => total + entry.score.for, 0) / scored.length : null
  const pointsAgainst = scored.length > 0 ? scored.reduce((total, entry) => total + entry.score.against, 0) / scored.length : null
  const outcomes = scored.slice(0, 5).map((entry) => entry.score.for > entry.score.against ? "W" : entry.score.for < entry.score.against ? "L" : "D")
  const first = outcomes[0] ?? ""
  const streakLength = first ? outcomes.findIndex((outcome) => outcome !== first) : -1
  const sideRows = scored.filter((entry) => entry.score.side === currentSide)
  const sideWins = sideRows.filter((entry) => entry.score.for > entry.score.against).length
  const sideLosses = sideRows.filter((entry) => entry.score.for < entry.score.against).length
  const closeRows = scored.filter((entry) => Math.abs(entry.score.for - entry.score.against) <= 6)
  const closeWins = closeRows.filter((entry) => entry.score.for > entry.score.against).length

  return {
    wins,
    losses,
    draws,
    pointsFor,
    pointsAgainst,
    winRate: scored.length > 0 ? wins / scored.length : null,
    lastFive: outcomes.length > 0 ? outcomes.join("-") : "-",
    streak: first ? `${streakLength === -1 ? outcomes.length : streakLength}${first}` : "-",
    homeAwayRecord: sideRows.length > 0 ? `${sideWins}-${sideLosses}` : "-",
    closeWins,
    closeGames: closeRows.length,
  }
}

function clampDriver(value: number): number {
  return Math.max(-1, Math.min(1, value))
}

function formatRatingNumber(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "")
}

function formatSignedRatingDelta(value: number): string {
  if (Math.abs(value) < 0.05) return "0"
  return `${value > 0 ? "+" : ""}${formatRatingNumber(value)}`
}

function buildRecentMatchupsDriver(match: LineupMatch, homeName: string): MatchDriver | null {
  const margins = (match.recentHeadToHead ?? [])
    .map((result) => resultScoreForTeam(result, homeName))
    .filter((score): score is NonNullable<ReturnType<typeof resultScoreForTeam>> => score != null)
    .map((score) => score.for - score.against)

  if (margins.length === 0) return null

  const averageMargin = margins.reduce((total, value) => total + value, 0) / margins.length
  return {
    kind: "bar",
    label: "Recent Matchups",
    homeAdvantage: clampDriver(averageMargin / 24),
    value: formatSignedRatingDelta(averageMargin),
  }
}

function buildMatchDrivers(
  match: LineupMatch,
  homeSummary: TeamFormSummary,
  awaySummary: TeamFormSummary,
  matchPrediction: LineupMatchPrediction | null
): MatchDriver[] {
  const drivers: MatchDriver[] = []
  const homeName = teamDisplayName(match.homeTeam, "Home")

  if (matchPrediction?.predMargin != null) {
    drivers.push({
      kind: "bar",
      label: "Predicted Margin",
      homeAdvantage: clampDriver(matchPrediction.predMargin / 24),
      value: formatSignedRatingDelta(matchPrediction.predMargin),
    })
  }

  if (homeSummary.pointsFor != null && awaySummary.pointsFor != null) {
    const attackDelta = homeSummary.pointsFor - awaySummary.pointsFor
    drivers.push({
      kind: "bar",
      label: "Attack",
      homeAdvantage: clampDriver(attackDelta / 18),
      value: formatSignedRatingDelta(attackDelta),
    })
  }

  if (homeSummary.pointsAgainst != null && awaySummary.pointsAgainst != null) {
    const defenseDelta = awaySummary.pointsAgainst - homeSummary.pointsAgainst
    drivers.push({
      kind: "bar",
      label: "Defense",
      homeAdvantage: clampDriver(defenseDelta / 18),
      value: formatSignedRatingDelta(defenseDelta),
    })
  }

  const recentMatchupsDriver = buildRecentMatchupsDriver(match, homeName)
  if (recentMatchupsDriver) drivers.push(recentMatchupsDriver)

  if (matchPrediction?.predTotal != null) {
    drivers.push({ kind: "value", label: "Total Points Prediction", value: formatRatingNumber(matchPrediction.predTotal) })
  }

  return drivers.filter((driver, index, list) => list.findIndex((item) => item.label === driver.label) === index)
}

function DriverBar({
  driver,
  homeLogo,
  awayLogo,
  locked = false,
  lockValue = false,
}: {
  driver: MatchDriver
  homeLogo: string | null
  awayLogo: string | null
  locked?: boolean
  lockValue?: boolean
}) {
  if (driver.kind === "value") {
    return (
      <div className="my-2 grid grid-cols-[minmax(10.5rem,1fr)_auto] items-center gap-3 border-y border-white/8 py-2 sm:grid-cols-[minmax(13rem,1fr)_auto]">
        <div className="truncate text-xs font-semibold text-nrl-text">{driver.label}</div>
        <div className="text-right text-sm font-black tabular-nums text-nrl-text">
          {lockValue ? <span aria-label="Premium locked" className="grayscale">🔒</span> : driver.value}
        </div>
      </div>
    )
  }

  if (locked) {
    return (
      <div className="grid grid-cols-[minmax(10.5rem,1fr)_minmax(0,2.4fr)] items-center gap-3 sm:grid-cols-[minmax(13rem,1fr)_minmax(0,2.6fr)]">
        <div className="truncate text-xs font-semibold text-nrl-text">{driver.label}</div>
        <div className="grid h-7 place-items-center rounded-full border border-white/10 bg-white/[0.03]">
          <BillingPageLink
            className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted transition-colors hover:border-emerald-300/35 hover:text-nrl-text"
            aria-label="View premium billing"
          >
            <span aria-hidden="true" className="grayscale">🔒</span>
            Premium
          </BillingPageLink>
        </div>
      </div>
    )
  }

  const width = Math.max(4, Math.abs(driver.homeAdvantage) * 50)
  const left = driver.homeAdvantage >= 0 ? 50 - width : 50
  const logoLeft = driver.homeAdvantage >= 0 ? 50 - width : 50 + width
  const logo = driver.homeAdvantage >= 0 ? homeLogo : awayLogo

  return (
    <div className="grid grid-cols-[minmax(10.5rem,1fr)_minmax(0,2.4fr)] items-center gap-3 sm:grid-cols-[minmax(13rem,1fr)_minmax(0,2.6fr)]">
      <div className="truncate text-xs font-semibold text-nrl-text">{driver.label}</div>
      <div className="relative h-3 rounded-full bg-white/8">
        <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
        <div
          className={`absolute top-0 h-full rounded-full ${driver.homeAdvantage >= 0 ? "bg-nrl-accent" : "bg-sky-400"}`}
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        {logo ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-nrl-panel p-0.5 ring-1 ring-white/20"
            style={{ left: `${logoLeft}%` }}
          >
            <ImageWithFallback sources={[logo]} alt="" className="h-full w-full object-contain" />
          </span>
        ) : null}
      </div>
    </div>
  )
}

function DrivingPickPanel({
  match,
  drivers,
  teamLogos,
  canAccessFantasyProjections,
}: {
  match: LineupMatch
  drivers: MatchDriver[]
  teamLogos: Record<string, string>
  canAccessFantasyProjections: boolean
}) {
  if (drivers.length === 0) return null
  const homeLogo = resolveLogo(match.homeTeam, teamLogos)
  const awayLogo = resolveLogo(match.awayTeam, teamLogos)

  return (
    <section className="rounded-lg border border-nrl-border bg-nrl-panel/75 p-3 shadow-[0_16px_34px_rgba(0,0,0,0.22)]">
      <div className="mb-2 flex justify-end">
        <details className="group/info relative">
          <summary
            className="grid h-6 w-6 cursor-pointer list-none place-items-center rounded-full border border-white/12 bg-white/[0.04] text-[11px] font-black text-nrl-muted transition-colors hover:border-emerald-300/35 hover:text-nrl-text marker:hidden [&::-webkit-details-marker]:hidden"
            aria-label="Explain matchup drivers"
            title="Explain matchup drivers"
          >
            i
          </summary>
          <div className="absolute right-0 top-8 z-20 w-72 rounded-md border border-white/12 bg-[#111a35] p-3 text-[10px] leading-relaxed text-nrl-muted shadow-[0_16px_34px_rgba(0,0,0,0.35)]">
            <div><span className="font-black text-nrl-text">Predicted Margin:</span> premium model margin projection.</div>
            <div className="mt-1"><span className="font-black text-nrl-text">Attack:</span> season points-for differential.</div>
            <div className="mt-1"><span className="font-black text-nrl-text">Defense:</span> season points-against differential.</div>
            <div className="mt-1"><span className="font-black text-nrl-text">Recent Matchups:</span> average margin from recent head-to-head games.</div>
            <div className="mt-1"><span className="font-black text-nrl-text">Total Points Prediction:</span> premium model total-points projection.</div>
          </div>
        </details>
      </div>
      <div className="space-y-2">
        {drivers.map((driver) => (
          <DriverBar
            key={driver.label}
            driver={driver}
            homeLogo={homeLogo}
            awayLogo={awayLogo}
            locked={!canAccessFantasyProjections && driver.label === "Predicted Margin"}
            lockValue={!canAccessFantasyProjections && driver.label === "Total Points Prediction"}
          />
        ))}
      </div>
    </section>
  )
}

function SeasonFormGuide({
  match,
  homeSummary,
  awaySummary,
}: {
  match: LineupMatch
  homeSummary: TeamFormSummary
  awaySummary: TeamFormSummary
}) {
  const rows = [
    ["Win-loss", `${homeSummary.wins}-${homeSummary.losses}${homeSummary.draws ? `-${homeSummary.draws}` : ""}`, `${awaySummary.wins}-${awaySummary.losses}${awaySummary.draws ? `-${awaySummary.draws}` : ""}`],
    ["Pts for / game", formatStatValue(homeSummary.pointsFor, 1), formatStatValue(awaySummary.pointsFor, 1)],
    ["Pts against / game", formatStatValue(homeSummary.pointsAgainst, 1), formatStatValue(awaySummary.pointsAgainst, 1)],
    ["Last 5", homeSummary.lastFive, awaySummary.lastFive],
    ["Streak", homeSummary.streak, awaySummary.streak],
    ["Home / away", homeSummary.homeAwayRecord, awaySummary.homeAwayRecord],
  ]

  return (
    <section className="rounded-lg border border-nrl-border bg-nrl-panel/75 p-3 shadow-[0_16px_34px_rgba(0,0,0,0.22)]">
      <div className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-nrl-muted">Season Form Guide</div>
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-sm font-black text-nrl-text">
        <span className="truncate">{teamDisplayName(match.homeTeam, "Home")}</span>
        <span className="text-xs text-nrl-muted">vs</span>
        <span className="truncate">{teamDisplayName(match.awayTeam, "Away")}</span>
      </div>
      <div className="divide-y divide-white/8">
        {rows.map(([label, home, away]) => (
          <div key={label} className="grid grid-cols-[1fr_7.5rem_1fr] items-center gap-2 py-2 text-center text-xs">
            <span className="font-black text-nrl-text">{home}</span>
            <span className="text-[10px] font-black uppercase tracking-wide text-nrl-muted">{label}</span>
            <span className="font-black text-nrl-text">{away}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function formatTryChartPct(value: number): string {
  return `${Math.round(Math.max(0, value) * 100)}%`
}

function TryChartLogo({ logo, label }: { logo: string | null; label: string }) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" aria-hidden="true" className="h-4 w-4 object-contain" loading="lazy" />
    )
  }
  return <span className="grid h-4 w-4 place-items-center rounded bg-white/10 text-[7px] font-black text-nrl-muted">{label.slice(0, 1)}</span>
}

type TryChartLaneSide = "left" | "middle" | "right"

const TRY_CHART_EDGE_ROLE_CONFIG: Record<Exclude<TryChartLaneSide, "middle">, Array<{ label: string; slot: Slot; numbers: number[] }>> = {
  left: [
    { label: "LW", slot: "LW", numbers: [5] },
    { label: "LC", slot: "LC", numbers: [4] },
    { label: "L2R", slot: "L2R", numbers: [11] },
    { label: "FE", slot: "FE", numbers: [6] },
  ],
  right: [
    { label: "HB", slot: "HLF", numbers: [7] },
    { label: "R2R", slot: "R2R", numbers: [12] },
    { label: "RC", slot: "RC", numbers: [3] },
    { label: "RW", slot: "RW", numbers: [2] },
  ],
}

function tryChartPlayers(
  team: LineupTeam | null,
  side: TryChartLaneSide,
  inverted = false
): Array<{ label: string; player: LineupPlayer | null }> {
  const players = team?.players ?? []
  const pitchSlots = buildTeamPitchSlotMap(players)
  const middleProps = players
    .filter((player) => player.isOnField && pitchSlots.get(pitchPlayerKey(player)) === "PR")
    .sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
  const roles: Array<{ label: string; slot: Slot; numbers: number[]; player?: LineupPlayer | null }> = side === "middle"
    ? [
      { label: "PR", slot: "PR", numbers: [8, 10], player: middleProps[0] ?? null },
      { label: "PR", slot: "PR", numbers: [8, 10], player: middleProps[1] ?? null },
      { label: "LK", slot: "LK", numbers: [13] },
      { label: "HK", slot: "HK", numbers: [9] },
    ]
    : inverted
      ? [...TRY_CHART_EDGE_ROLE_CONFIG[side]].reverse()
      : TRY_CHART_EDGE_ROLE_CONFIG[side]

  return roles.map((role) => ({
    label: role.label,
    player:
      role.player ??
      players.find((player) => player.isOnField && pitchSlots.get(pitchPlayerKey(player)) === role.slot) ??
      players.find((player) => player.isOnField && player.side === side && playerSlot(player) === role.slot) ??
      players.find((player) => player.isOnField && player.number != null && role.numbers.includes(player.number)) ??
      null,
  }))
}

function tryChartPlayerDisplayName(player: LineupPlayer | null): string {
  if (!player) return "-"
  const parts = player.player.trim().split(/\s+/).filter(Boolean)
  return parts.at(-1) ?? player.player
}

function TryChartPlayers({
  team,
  side,
  tone = "attack",
  inverted = false,
}: {
  team: LineupTeam | null
  side: TryChartLaneSide
  tone?: "attack" | "defence"
  inverted?: boolean
}) {
  const players = tryChartPlayers(team, side, inverted)
  const toneClass = tone === "defence"
    ? "border-[#fb7185]/45 bg-[#fb7185]/24 shadow-[inset_0_0_18px_rgba(251,113,133,0.12)]"
    : "border-emerald-300/42 bg-emerald-300/24 shadow-[inset_0_0_18px_rgba(110,231,183,0.12)]"

  return (
    <div className={`relative grid min-h-[4.75rem] grid-cols-4 gap-1 overflow-hidden rounded border px-1 pb-1 pt-2 ${toneClass}`}>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 text-3xl font-black leading-none ${
          tone === "defence" ? "text-[#fecdd3]/18" : "text-emerald-100/18"
        }`}
      >
        {tone === "defence" ? "↓" : "↑"}
      </div>
      {players.map(({ label, player }, index) => (
        <div key={`${label}-${index}`} className="relative z-[1] min-w-0 text-center">
          {tone === "defence" ? (
            <>
              <div className="truncate text-[8px] font-semibold leading-tight text-slate-100" title={player?.player ?? undefined}>
                {tryChartPlayerDisplayName(player)}
              </div>
              <div className="mt-0.5 text-[7px] font-black uppercase leading-none tracking-wide text-nrl-muted">{label}</div>
            </>
          ) : null}
          <div className={`mx-auto grid h-7 w-7 place-items-center overflow-hidden rounded-full border border-white/10 bg-nrl-panel text-[7px] font-black text-nrl-muted ${tone === "defence" ? "mt-1" : ""}`}>
            {player ? (
              <ImageWithFallback sources={playerImageSources(player.cachedHeadImage, player.cachedBodyImage, player.headImage, player.bodyImage)} alt={player.player} className="h-full w-full object-cover object-top" />
            ) : (
              label.slice(0, 1)
            )}
          </div>
          {tone !== "defence" ? (
            <>
              <div className="mt-0.5 text-[7px] font-black uppercase leading-none tracking-wide text-nrl-muted">{label}</div>
              <div className="mt-0.5 truncate text-[8px] font-semibold leading-tight text-slate-100" title={player?.player ?? undefined}>
                {tryChartPlayerDisplayName(player)}
              </div>
            </>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function TryChartField({
  chart,
  opponentChart,
  team,
  opponentTeam,
  teamName,
  opponentName,
  teamLogo,
  opponentLogo,
}: {
  chart: StatsinsiderTryChart
  opponentChart: StatsinsiderTryChart
  team: LineupTeam | null
  opponentTeam: LineupTeam | null
  teamName: string
  opponentName: string
  teamLogo: string | null
  opponentLogo: string | null
}) {
  const lanes = [
    { label: "Left", side: "left" as const, defenceSide: "right" as const, scored: chart.leftScored, scoredPct: chart.leftScoredPct, conceded: opponentChart.rightConceded, concededPct: opponentChart.rightConcededPct },
    { label: "Middle", side: "middle" as const, defenceSide: "middle" as const, scored: chart.middleScored, scoredPct: chart.middleScoredPct, conceded: opponentChart.middleConceded, concededPct: opponentChart.middleConcededPct },
    { label: "Right", side: "right" as const, defenceSide: "left" as const, scored: chart.rightScored, scoredPct: chart.rightScoredPct, conceded: opponentChart.leftConceded, concededPct: opponentChart.leftConcededPct },
  ]
  const barRow = (
    type: "conceded" | "scored",
    lane: typeof lanes[number]
  ) => {
    const isConceded = type === "conceded"
    const pct = isConceded ? lane.concededPct : lane.scoredPct
    const count = isConceded ? lane.conceded : lane.scored
    return (
      <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border px-1.5 py-1.5 shadow-[0_6px_14px_rgba(0,0,0,0.18)] ${isConceded ? "border-[#fb7185]/45 bg-[#fb7185]/24 shadow-[inset_0_0_18px_rgba(251,113,133,0.12)]" : "border-emerald-300/42 bg-emerald-300/24 shadow-[inset_0_0_18px_rgba(110,231,183,0.12)]"}`}>
        <div>
          <div className={`h-2 rounded-full ${isConceded ? "bg-[#fb7185]/22" : "bg-emerald-300/20"}`}>
            <div className={`h-full rounded-full shadow-[0_0_10px_currentColor] ${isConceded ? "bg-[#fb7185] text-[#fb7185]" : "bg-emerald-300 text-emerald-300"}`} style={{ width: `${Math.max(8, pct * 100)}%` }} />
          </div>
          <div className={`mt-1 text-center text-[9px] font-black tabular-nums ${isConceded ? "text-[#fecdd3]" : "text-emerald-100"}`}>{formatTryChartPct(pct)}</div>
        </div>
        <div className={`inline-flex min-w-[2.55rem] items-center justify-start gap-1 rounded bg-black/18 px-1 py-0.5 text-[10px] font-black ${isConceded ? "text-[#ffe4e6]" : "text-emerald-100"}`}>
          <TryChartLogo logo={isConceded ? opponentLogo : teamLogo} label={isConceded ? opponentName : teamName} />
          <span>{count}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-md border border-lime-300/20 bg-[linear-gradient(90deg,rgba(68,126,47,0.72),rgba(100,153,55,0.62)),repeating-linear-gradient(0deg,rgba(255,255,255,0.12)_0_1px,transparent_1px_20%)] p-2">
      <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(7.5rem,0.72fr)_minmax(0,1fr)]">
        {lanes.map((lane) => (
          <div key={lane.label} className="relative min-h-28 overflow-hidden rounded border border-white/18 bg-green-950/18 px-1.5 py-2 text-center">
            <div className="pointer-events-none absolute inset-1.5 rounded opacity-55 [background:repeating-linear-gradient(0deg,rgba(255,255,255,0.42)_0_1px,transparent_1px_24px)]" />
            <div className="relative space-y-2">
              <div className="relative">
                {lane.side !== "middle" ? (
                  <>
                    <div className={`pointer-events-none absolute top-0 z-10 h-[2px] w-16 shadow-[0_0_10px_rgba(255,255,255,0.42)] ${
                      lane.side === "left"
                        ? "left-0 bg-gradient-to-r from-white to-white/0"
                        : "right-0 bg-gradient-to-l from-white to-white/0"
                    }`} />
                    <div className={`pointer-events-none absolute top-0 z-10 h-16 w-[2px] shadow-[0_0_10px_rgba(255,255,255,0.42)] ${
                      lane.side === "left"
                        ? "left-0 bg-gradient-to-b from-white to-white/0"
                        : "right-0 bg-gradient-to-b from-white to-white/0"
                    }`} />
                    <div className={`pointer-events-none absolute top-0 z-20 h-4 w-3 ${lane.side === "left" ? "left-0 -translate-x-1/2 -translate-y-1/2" : "right-0 translate-x-1/2 -translate-y-1/2"}`}>
                      <div className="absolute bottom-0 left-1/2 h-4 w-px -translate-x-1/2 bg-white/70" />
                      <div className={`absolute top-0 h-2.5 w-2.5 bg-sky-400 ${lane.side === "left" ? "left-1/2" : "right-1/2"}`} />
                    </div>
                  </>
                ) : null}
                <TryChartPlayers team={opponentTeam} side={lane.defenceSide} tone="defence" inverted={lane.side !== "middle"} />
              </div>
              <TryChartPlayers team={team} side={lane.side} />
              <div className="space-y-1.5">
                {barRow("conceded", lane)}
                {barRow("scored", lane)}
              </div>
              <div className="pt-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-200">{lane.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TryTypeRow({
  label,
  scored,
  scoredPct,
  conceded,
  concededPct,
  teamName,
  opponentName,
  teamLogo,
  opponentLogo,
}: {
  label: string
  scored: number
  scoredPct: number
  conceded: number
  concededPct: number
  teamName: string
  opponentName: string
  teamLogo: string | null
  opponentLogo: string | null
}) {
  return (
    <div className="rounded border border-white/8 bg-nrl-panel/55 px-2 py-1.5">
      <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-nrl-muted">{label}</div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div>
            <div className="relative h-3 rounded-full bg-[#fb7185]/22">
              <div className="h-full rounded-full bg-[#fb7185]" style={{ width: `${Math.max(5, concededPct * 100)}%` }} />
              <div className="absolute inset-0 grid place-items-center text-[8px] font-black leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{formatTryChartPct(concededPct)}</div>
            </div>
          </div>
          <div className="inline-flex min-w-[3.1rem] items-center justify-start gap-1 text-[9px] font-semibold text-[#ffe4e6]">
            <TryChartLogo logo={opponentLogo} label={opponentName} />
            <span>{conceded}</span>
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div>
            <div className="relative h-3 rounded-full bg-emerald-300/20">
              <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.max(5, scoredPct * 100)}%` }} />
              <div className="absolute inset-0 grid place-items-center text-[8px] font-black leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{formatTryChartPct(scoredPct)}</div>
            </div>
          </div>
          <div className="inline-flex min-w-[3.1rem] items-center justify-start gap-1 text-[9px] font-semibold text-emerald-200">
            <TryChartLogo logo={teamLogo} label={teamName} />
            <span>{scored}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TeamTryChartCard({
  team,
  opponentTeam,
  chart,
  opponentChart,
  teamLogos,
}: {
  team: LineupTeam | null
  opponentTeam: LineupTeam | null
  chart: StatsinsiderTryChart
  opponentChart: StatsinsiderTryChart
  teamLogos: Record<string, string>
}) {
  const teamName = shortLineupTeamName(team?.teamName ?? team?.team ?? chart.team)
  const opponentName = shortLineupTeamName(opponentTeam?.teamName ?? opponentTeam?.team ?? opponentChart.team)
  const runScored = chart.runScored + chart.interceptScored
  const runScoredPct = chart.runScoredPct + chart.interceptScoredPct
  const runConceded = opponentChart.runConceded + opponentChart.interceptConceded
  const runConcededPct = opponentChart.runConcededPct + opponentChart.interceptConcededPct
  const teamLogo = resolveLogo(team, teamLogos)
  const opponentLogo = resolveLogo(opponentTeam, teamLogos)

  return (
    <div className="rounded-md border border-white/10 bg-nrl-panel-2/65 p-2 shadow-[0_8px_18px_rgba(0,0,0,0.18)]">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] font-bold uppercase tracking-[0.12em]">
        <span className="text-emerald-200">Green scored</span>
        <span className="text-red-300">Red conceded</span>
      </div>
      <TryChartField chart={chart} opponentChart={opponentChart} team={team} opponentTeam={opponentTeam} teamName={teamName} opponentName={opponentName} teamLogo={teamLogo} opponentLogo={opponentLogo} />
      <div className="mt-2 space-y-1.5">
        <TryTypeRow label="Run" scored={runScored} scoredPct={runScoredPct} conceded={runConceded} concededPct={runConcededPct} teamName={teamName} opponentName={opponentName} teamLogo={teamLogo} opponentLogo={opponentLogo} />
        <TryTypeRow label="Kick" scored={chart.kickScored} scoredPct={chart.kickScoredPct} conceded={opponentChart.kickConceded} concededPct={opponentChart.kickConcededPct} teamName={teamName} opponentName={opponentName} teamLogo={teamLogo} opponentLogo={opponentLogo} />
      </div>
    </div>
  )
}

function MatchupTryCharts({
  homeTeam,
  awayTeam,
  homeChart,
  awayChart,
  teamLogos,
}: {
  homeTeam: LineupTeam | null
  awayTeam: LineupTeam | null
  homeChart: StatsinsiderTryChart | null
  awayChart: StatsinsiderTryChart | null
  teamLogos: Record<string, string>
}) {
  const [selectedTeam, setSelectedTeam] = useState<"home" | "away">("home")
  if (!homeChart && !awayChart) return null
  const cards = [
    homeChart && {
      key: "home" as const,
      label: shortLineupTeamName(homeTeam?.teamName ?? homeTeam?.team ?? homeChart.team),
      logo: resolveLogo(homeTeam, teamLogos),
      card: <TeamTryChartCard team={homeTeam} opponentTeam={awayTeam} chart={homeChart} opponentChart={awayChart ?? homeChart} teamLogos={teamLogos} />,
    },
    awayChart && {
      key: "away" as const,
      label: shortLineupTeamName(awayTeam?.teamName ?? awayTeam?.team ?? awayChart.team),
      logo: resolveLogo(awayTeam, teamLogos),
      card: <TeamTryChartCard team={awayTeam} opponentTeam={homeTeam} chart={awayChart} opponentChart={homeChart ?? awayChart} teamLogos={teamLogos} />,
    },
  ].filter((card): card is NonNullable<typeof card> => Boolean(card))
  const selectedCard = cards.find((card) => card.key === selectedTeam) ?? cards[0]

  return (
    <div className="grid gap-2.5">
      {cards.length > 1 ? (
        <div className="inline-flex w-fit max-w-full items-center gap-2 rounded-md border border-white/10 bg-nrl-panel/70 p-1.5">
          {cards.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => setSelectedTeam(card.key)}
              className={`grid h-8 w-8 place-items-center rounded-full border bg-transparent p-1 transition-colors ${
                selectedCard?.key === card.key
                  ? "border-nrl-accent ring-1 ring-nrl-accent/45"
                  : "border-white/12 opacity-65 hover:border-white/30 hover:opacity-100"
              }`}
              aria-label={`Show ${card.label} try chart`}
              title={card.label}
            >
              <TryChartLogo logo={card.logo} label={card.label} />
            </button>
          ))}
        </div>
      ) : null}
      {selectedCard?.card}
    </div>
  )
}

function MatchupInsightCard({ insight, muted = false }: { insight: MatchupInsight; muted?: boolean }) {
  return (
    <div className={`min-w-0 rounded-md border border-white/10 bg-nrl-panel-2/65 px-1.5 py-1.5 shadow-[0_8px_18px_rgba(0,0,0,0.18)] sm:px-2 sm:py-2 ${muted ? "opacity-75" : ""}`}>
      <div className="min-w-0">
        <div className="text-[9px] leading-snug text-white sm:text-[10px]">{insight.description}</div>
      </div>
    </div>
  )
}

function MatchupInsightsPanel({
  insights,
  homeTeam,
  awayTeam,
  homeTryChart,
  awayTryChart,
  teamLogos,
}: {
  insights: MatchupInsight[]
  homeTeam: LineupTeam | null
  awayTeam: LineupTeam | null
  homeTryChart: StatsinsiderTryChart | null
  awayTryChart: StatsinsiderTryChart | null
  teamLogos: Record<string, string>
}) {
  const hasTryCharts = Boolean(homeTryChart && awayTryChart)
  const visibleInsights = insights.slice(0, 4)

  return (
    <details
      className="group/insights mb-5 overflow-hidden rounded-md border border-transparent shadow-[0_16px_34px_rgba(0,0,0,0.26)]"
      style={BLUE_GRADIENT_BORDER_STYLE}
      open
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2.5 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-nrl-accent">Matchup Insights</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] font-semibold tabular-nums text-nrl-muted">{visibleInsights.length}</span>
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4 text-nrl-muted transition-transform group-open/insights:rotate-180"
            fill="none"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>

      <div className="max-h-[34rem] overflow-y-auto border-t border-nrl-border p-2">
        <div className="grid gap-2.5">
          {visibleInsights.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5">
              {visibleInsights.map((insight, insightIndex) => (
                <MatchupInsightCard key={`${insight.category}-${insight.title}-${insightIndex}`} insight={insight} />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-white/10 bg-nrl-panel-2/55 px-2 py-1.5 text-[10px] text-nrl-muted shadow-[0_8px_18px_rgba(0,0,0,0.18)]">
              No strong matchup signals identified yet.
            </div>
          )}
          {hasTryCharts ? (
            <MatchupTryCharts homeTeam={homeTeam} awayTeam={awayTeam} homeChart={homeTryChart} awayChart={awayTryChart} teamLogos={teamLogos} />
          ) : null}
        </div>
      </div>
    </details>
  )
}

function DisplayModeControl({
  displayMode,
  onDisplayModeChange,
  statsSource,
  onStatsSourceChange,
  selectedCompetition,
  showStatsSourceControl,
  compact = false,
}: {
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
  statsSource: StatsSource
  onStatsSourceChange: (source: StatsSource) => void
  selectedCompetition: LineupCompetition
  showStatsSourceControl: boolean
  compact?: boolean
}) {
  const statsSourceOptions = STATS_SOURCES.filter((source) => source.key !== "nrl2026")
  const displayModes = selectedCompetition === "nrl"
    ? DISPLAY_MODES
    : DISPLAY_MODES.filter((mode) => isAverageDisplayMode(mode.key))

  return (
    <div className={`flex ${showStatsSourceControl ? compact ? "w-[13.5rem] gap-1" : "w-[23rem] max-w-[70vw] gap-2" : compact ? "w-[8.5rem]" : "w-[16rem] max-w-[52vw]"}`}>
      <label className={showStatsSourceControl ? compact ? "block min-w-0 flex-[1.05]" : "block min-w-0 flex-1" : "block min-w-0 flex-1"}>
        <span className="sr-only">Display</span>
        <select
          value={displayMode}
          onChange={(event) => onDisplayModeChange(event.target.value as DisplayMode)}
          className={`${compact ? "text-[10px]" : "text-[11px]"} w-full rounded-md border border-emerald-300/35 bg-nrl-panel/90 px-2 py-1.5 font-semibold text-nrl-text shadow-[0_8px_18px_rgba(0,0,0,0.24)] outline-none backdrop-blur transition-colors hover:border-nrl-accent/50 focus:border-nrl-accent`}
        >
          {displayModes.map((mode) => (
            <option key={mode.key} value={mode.key}>
              {compact ? mode.shortLabel : mode.label}
            </option>
          ))}
        </select>
      </label>
      {showStatsSourceControl ? (
        <label className={compact ? "block min-w-0 flex-1" : "block min-w-0 flex-[0.9]"}>
          <span className="sr-only">Stats source</span>
          <select
            value={statsSource}
            onChange={(event) => onStatsSourceChange(event.target.value as StatsSource)}
            className={`${compact ? "text-[10px]" : "text-[11px]"} w-full rounded-md border border-emerald-300/35 bg-nrl-panel/90 px-2 py-1.5 font-semibold text-nrl-text shadow-[0_8px_18px_rgba(0,0,0,0.24)] outline-none backdrop-blur transition-colors hover:border-nrl-accent/50 focus:border-nrl-accent`}
          >
            {statsSourceOptions.map((source) => (
              <option key={source.key} value={source.key}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  )
}

function LineupCard({
  match,
  liveMatch,
  weatherForecast,
  teamLogos,
  displayMode,
  onDisplayModeChange,
  statsSource,
  onStatsSourceChange,
  selectedCompetition,
  canAccessFantasyProjections,
  matchPrediction,
  detail,
  detailStatus,
  tryChartsByTeam,
  onOpen,
}: {
  match: LineupMatch
  liveMatch: LineupLiveMatch | null
  weatherForecast: LineupWeatherForecast | null
  teamLogos: Record<string, string>
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
  statsSource: StatsSource
  onStatsSourceChange: (source: StatsSource) => void
  selectedCompetition: LineupCompetition
  canAccessFantasyProjections: boolean
  matchPrediction: LineupMatchPrediction | null
  detail: LineupMatchDetailData | null
  detailStatus: "idle" | "loading" | "loaded" | "error"
  tryChartsByTeam: Record<string, StatsinsiderTryChart>
  onOpen: () => void
}) {
  const detailMatch = detail?.match ?? match
  const detailsRef = useRef<HTMLDetailsElement | null>(null)
  const anchorId = lineupsMatchAnchorId(match)
  const shellPlayerCount = (match.homeTeam?.players.length ?? 0) + (match.awayTeam?.players.length ?? 0)
  const matchStats = detail?.matchStats ?? null
  const tryscorerOdds = detail?.tryscorerOdds ?? {}
  const casualtyWardOuts = detail?.casualtyWardOuts ?? {}
  const playerAverages = detail?.playerAverageSources?.[statsSource] ?? detail?.playerAverages ?? {}
  const playerTryHistory = detail?.playerTryHistory ?? {}
  const positionPpmBaselines = detail?.positionPpmBaselines ?? {}
  const historicalData = historicalLiveMatch(detailMatch, matchStats)
  const displayLiveMatch = isLiveDataVisible(liveMatch) ? liveMatch : historicalData
  const completedHomePlayers = applyCompletedPlayerStats(detailMatch.homeTeam?.players ?? [], matchStats, detailMatch.homeTeam)
  const completedAwayPlayers = applyCompletedPlayerStats(detailMatch.awayTeam?.players ?? [], matchStats, detailMatch.awayTeam)
  const homePlayers =
    completedHomePlayers.length > 0 ? completedHomePlayers : historicalPlayersFromStats(matchStats, matchStats?.home, "Home")
  const awayPlayers =
    completedAwayPlayers.length > 0 ? completedAwayPlayers : historicalPlayersFromStats(matchStats, matchStats?.away, "Away")
  const homeTeamForDisplay =
    detailMatch.homeTeam ? { ...detailMatch.homeTeam, players: homePlayers } : historicalTeamFromStats(matchStats, matchStats?.home, "Home", homePlayers)
  const awayTeamForDisplay =
    detailMatch.awayTeam ? { ...detailMatch.awayTeam, players: awayPlayers } : historicalTeamFromStats(matchStats, matchStats?.away, "Away", awayPlayers)
  const hasLineupData = homePlayers.length > 0 || awayPlayers.length > 0
  const isFixtureOnly = detailMatch.matchId.startsWith("draw-2026-") && !hasLineupData && matchStats == null
  const [selectedPlayer, setSelectedPlayer] = useState<LineupPlayer | null>(null)
  const [detailView, setDetailView] = useState<LineupDetailView>("lineup")
  const isLive = hasMatchStarted(displayLiveMatch)
  const hasOpenedHashTargetRef = useRef(false)
  const hasResultScore = detailMatch.homeScore != null || detailMatch.awayScore != null
  const headerScore = matchScore(detailMatch, displayLiveMatch)
  const showSplitScore = headerScore.homeScore != null || headerScore.awayScore != null
  const homeScoreWins = headerScore.homeScore != null && headerScore.awayScore != null && headerScore.homeScore > headerScore.awayScore
  const awayScoreWins = headerScore.homeScore != null && headerScore.awayScore != null && headerScore.awayScore > headerScore.homeScore
  const showLiveCardHeader = isMatchLive(displayLiveMatch)
  const showPregameContent = !isLive && !hasResultScore
  const showStatsSourceControl = selectedCompetition === "origin"
  const availableDetailViews: LineupDetailView[] = showPregameContent
    ? ["lineup", "insights", "stats"]
    : ["lineup", "stats"]
  const activeDetailView = availableDetailViews.includes(detailView) ? detailView : availableDetailViews[0] ?? "stats"
  const showLiveIndicators = isLiveDataVisible(displayLiveMatch)
  const homeTryChart = tryChartsByTeam[statsinsiderTeamCode(detailMatch.homeTeam) ?? ""] ?? null
  const awayTryChart = tryChartsByTeam[statsinsiderTeamCode(detailMatch.awayTeam) ?? ""] ?? null
  const homeLogo = resolveLogo(detailMatch.homeTeam, teamLogos)
  const awayLogo = resolveLogo(detailMatch.awayTeam, teamLogos)
  const homeWatermarkClass = isStormTeam(detailMatch.homeTeam)
    ? "hidden left-6 h-40 w-40 opacity-[0.16] grayscale sm:left-16 sm:block sm:h-48 sm:w-48"
    : isBroncosTeam(detailMatch.homeTeam)
      ? "hidden -left-8 h-44 w-44 opacity-[0.16] grayscale sm:left-4 sm:block sm:h-56 sm:w-56"
    : isRabbitohsTeam(detailMatch.homeTeam)
      ? "hidden -left-8 h-44 w-44 opacity-[0.22] sm:left-4 sm:block sm:h-56 sm:w-56"
    : "hidden -left-8 h-44 w-44 opacity-[0.065] grayscale sm:left-4 sm:block sm:h-56 sm:w-56"
  const awayWatermarkClass = isStormTeam(detailMatch.awayTeam)
    ? "hidden right-6 h-40 w-40 opacity-[0.16] grayscale sm:right-16 sm:block sm:h-48 sm:w-48"
    : isBroncosTeam(detailMatch.awayTeam)
      ? "hidden -right-8 h-44 w-44 opacity-[0.16] grayscale sm:right-4 sm:block sm:h-56 sm:w-56"
    : isRabbitohsTeam(detailMatch.awayTeam)
      ? "hidden -right-8 h-44 w-44 opacity-[0.22] sm:right-4 sm:block sm:h-56 sm:w-56"
    : "hidden -right-8 h-44 w-44 opacity-[0.065] grayscale sm:right-4 sm:block sm:h-56 sm:w-56"
  const selectedPlayerStats: PlayerStatsSelection | null = selectedPlayer
    ? (() => {
        const history = playerTryHistory[normaliseKey(selectedPlayer.player)] ?? []
        const opponentTeam =
          selectedPlayer.teamType === "Home"
            ? detailMatch.awayTeam?.teamName ?? detailMatch.awayTeam?.team ?? null
            : selectedPlayer.teamType === "Away"
              ? detailMatch.homeTeam?.teamName ?? detailMatch.homeTeam?.team ?? null
              : null
        const opponentKey = normaliseKey(opponentTeam)
        return {
          player: selectedPlayer,
          liveState: isMatchLive(displayLiveMatch) ? getLivePlayerState(displayLiveMatch, selectedPlayer) : null,
          liveStats: getLivePlayerStats(displayLiveMatch, selectedPlayer),
          showPregameMetrics: showPregameContent,
          baselinePpm: positionBaselineForPlayer(selectedPlayer, positionPpmBaselines).value,
          baselineLabel: positionBaselineForPlayer(selectedPlayer, positionPpmBaselines).label,
          averages: playerAverages[normaliseKey(selectedPlayer.player)] ?? null,
          tryHistory: history,
          opponent: opponentTeam,
          opponentTryHistory: opponentKey
            ? history.filter((entry) => normaliseKey(entry.opponent).includes(opponentKey)).slice(0, 5)
            : [],
          tryscorerOdds: tryscorerOdds[normaliseKey(selectedPlayer.player)] ?? null,
        }
      })()
    : null
  const insights = isLive
    ? []
    : generateMatchupInsights({
        match: detailMatch,
        tryscorerOdds,
        playerAverages,
        playerTryHistory,
      })
  const homeSummary = buildTeamFormSummary(
    teamDisplayName(detailMatch.homeTeam, "Home"),
    detailMatch.homeRecentResults ?? [],
    "home"
  )
  const awaySummary = buildTeamFormSummary(
    teamDisplayName(detailMatch.awayTeam, "Away"),
    detailMatch.awayRecentResults ?? [],
    "away"
  )
  const matchDrivers = buildMatchDrivers(detailMatch, homeSummary, awaySummary, matchPrediction)

  useEffect(() => {
    if (window.location.hash !== `#${anchorId}`) return
    if (hasOpenedHashTargetRef.current) return
    hasOpenedHashTargetRef.current = true
    if (detailsRef.current) detailsRef.current.open = true
    onOpen()
    window.requestAnimationFrame(() => {
      detailsRef.current?.scrollIntoView({ behavior: "auto", block: "start" })
    })
  }, [anchorId, onOpen])

  useEffect(() => {
    if (detailStatus !== "loaded" || window.location.hash !== `#${anchorId}`) return
    window.requestAnimationFrame(() => {
      detailsRef.current?.scrollIntoView({ behavior: "auto", block: "start" })
    })
  }, [anchorId, detailStatus])

  return (
    <details
      ref={detailsRef}
      id={anchorId}
      className="group relative origin-top overflow-hidden rounded-lg border border-transparent shadow-[0_24px_54px_rgba(0,0,0,0.48)] transform-gpu [transform:perspective(1100px)_rotateX(3.2deg)_scaleY(0.965)]"
      style={BLUE_GRADIENT_BORDER_STYLE}
      onToggle={(event) => {
        if (event.currentTarget.open) onOpen()
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-px rounded-[calc(0.5rem-1px)] opacity-70 transition-opacity group-open:opacity-0"
        style={MATCH_CARD_TEXTURE_STYLE}
      />
      <summary className="relative z-[1] cursor-pointer list-none px-3 pb-8 pt-3 marker:hidden sm:px-5 sm:pb-9 sm:pt-4 [&::-webkit-details-marker]:hidden">
        {homeLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={homeLogo}
            alt=""
            aria-hidden="true"
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 object-contain ${homeWatermarkClass}`}
            loading="lazy"
          />
        ) : null}
        {awayLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={awayLogo}
            alt=""
            aria-hidden="true"
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 object-contain ${awayWatermarkClass}`}
            loading="lazy"
          />
        ) : null}
        <div className="relative z-[1] pb-2 text-center">
          {detailMatch.venue || weatherForecast ? (
            <div className="mx-auto flex max-w-[18rem] items-center justify-center gap-1.5 truncate text-[9px] font-bold uppercase tracking-[0.12em] text-nrl-muted/85 sm:max-w-md sm:text-[10px]">
              {detailMatch.venue ? <span className="min-w-0 truncate">{detailMatch.venue}</span> : null}
              {weatherForecast ? (
                <span className="flex-none text-xs leading-none sm:text-sm" aria-hidden="true">
                  {weatherConditionEmoji(weatherForecast.condition)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div
          className={`relative z-[1] mx-auto grid w-full items-center ${
            showSplitScore
              ? "max-w-5xl grid-cols-[minmax(4rem,1fr)_10.4rem_minmax(4rem,1fr)] gap-x-1 sm:grid-cols-[minmax(6rem,1fr)_4.5rem_minmax(6.75rem,auto)_4.5rem_minmax(6rem,1fr)] sm:gap-5 lg:gap-10"
              : "max-w-4xl grid-cols-[minmax(0,1fr)_minmax(7.25rem,auto)_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)_minmax(0,1fr)] sm:gap-5"
          }`}
        >
          <div className="min-w-0 justify-self-center">
            <TeamBadge team={detailMatch.homeTeam} teamLogos={teamLogos} />
          </div>
          {showSplitScore ? (
            <div className="relative col-start-2 h-[5rem] sm:contents">
              <div className={`absolute left-1/2 top-1/2 grid w-max -translate-x-1/2 grid-cols-[2.35rem_4.7rem_2.35rem] items-center justify-center gap-x-2 sm:static sm:contents sm:translate-x-0 ${showLiveCardHeader ? "-translate-y-[62%] sm:-translate-y-0" : "-translate-y-1/2 sm:translate-y-0"}`}>
                <ScoreNumber value={headerScore.homeScore} align="right" isWinner={homeScoreWins} lift={showLiveCardHeader} />
                <LiveScoreHeader match={detailMatch} liveMatch={displayLiveMatch} splitScore lift={showLiveCardHeader} />
                <ScoreNumber value={headerScore.awayScore} align="left" isWinner={awayScoreWins} lift={showLiveCardHeader} />
              </div>
            </div>
          ) : (
            <LiveScoreHeader match={detailMatch} liveMatch={displayLiveMatch} />
          )}
          <div className="min-w-0 justify-self-center">
            <TeamBadge team={detailMatch.awayTeam} teamLogos={teamLogos} />
          </div>
        </div>
        <span className="absolute bottom-1 left-1/2 z-10 inline-grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full border border-nrl-border bg-nrl-panel text-nrl-muted shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition-colors group-hover:text-nrl-text sm:bottom-1.5">
          <span className="sr-only">Toggle match details</span>
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4 transition-transform group-open:rotate-180"
            fill="none"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>

      <div className="relative z-[1] border-t border-blue-300/30 px-2 pb-3 sm:px-3">
        <div className="pt-5" />
        {detailStatus === "loading" && !detail && shellPlayerCount === 0 ? (
          <div className="flex items-center justify-center px-4 py-5">
            <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-emerald-300/25 border-t-emerald-300" aria-label="Loading match details" />
          </div>
        ) : detailStatus === "error" ? (
          <div className="rounded-lg border border-red-300/30 bg-red-500/10 px-4 py-5 text-sm text-red-100">
            Unable to load match details.
          </div>
        ) : (
          <>
        <LiveTryScorersStrip match={detailMatch} liveMatch={displayLiveMatch} />
        {availableDetailViews.length > 0 ? (
          <div className="mb-3 flex w-full justify-center">
            <div className="inline-flex max-w-full items-center overflow-x-auto rounded-lg border border-nrl-border bg-nrl-panel/80 p-1 text-[10px] font-black uppercase tracking-wide text-nrl-muted">
              {availableDetailViews.map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setDetailView(view)}
                  className={`shrink-0 rounded-md px-3 py-1.5 transition-colors ${
                    activeDetailView === view ? "bg-nrl-accent text-nrl-bg" : "hover:text-nrl-text"
                  }`}
                >
                  {view === "lineup" ? "Lineup" : view === "stats" ? "Match stats" : "Insights"}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {activeDetailView === "stats" ? (
          <div className="space-y-3">
            <MatchStatsPanel match={detailMatch} liveMatch={displayLiveMatch} stats={matchStats} teamLogos={teamLogos} />
            <SeasonFormGuide match={detailMatch} homeSummary={homeSummary} awaySummary={awaySummary} />
          </div>
        ) : activeDetailView === "insights" ? (
          <div className="space-y-3">
            <DrivingPickPanel
              match={detailMatch}
              drivers={matchDrivers}
              teamLogos={teamLogos}
              canAccessFantasyProjections={canAccessFantasyProjections}
            />
            <MatchupInsightsPanel
              insights={insights}
              homeTeam={detailMatch.homeTeam}
              awayTeam={detailMatch.awayTeam}
              homeTryChart={homeTryChart}
              awayTryChart={awayTryChart}
              teamLogos={teamLogos}
            />
          </div>
        ) : hasLineupData ? (
          <>
            <Pitch
              homePlayers={homePlayers}
              awayPlayers={awayPlayers}
              orientation="portrait"
              displayMode={displayMode}
              onDisplayModeChange={onDisplayModeChange}
              statsSource={statsSource}
              onStatsSourceChange={onStatsSourceChange}
              selectedCompetition={selectedCompetition}
              tryscorerOdds={tryscorerOdds}
              playerAverages={playerAverages}
              canAccessFantasyProjections={canAccessFantasyProjections}
              liveMatch={displayLiveMatch}
              positionPpmBaselines={positionPpmBaselines}
              showLiveIndicators={showLiveIndicators}
              showPregameMetrics={showPregameContent}
              showStatsSourceControl={showStatsSourceControl}
              onPlayerSelect={setSelectedPlayer}
            />
            <Pitch
              homePlayers={homePlayers}
              awayPlayers={awayPlayers}
              orientation="landscape"
              displayMode={displayMode}
              onDisplayModeChange={onDisplayModeChange}
              statsSource={statsSource}
              onStatsSourceChange={onStatsSourceChange}
              selectedCompetition={selectedCompetition}
              tryscorerOdds={tryscorerOdds}
              playerAverages={playerAverages}
              canAccessFantasyProjections={canAccessFantasyProjections}
              liveMatch={displayLiveMatch}
              positionPpmBaselines={positionPpmBaselines}
              showLiveIndicators={showLiveIndicators}
              showPregameMetrics={showPregameContent}
              showStatsSourceControl={showStatsSourceControl}
              onPlayerSelect={setSelectedPlayer}
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <TeamBench
                team={homeTeamForDisplay}
                liveMatch={displayLiveMatch}
                positionPpmBaselines={positionPpmBaselines}
                showLiveIndicators={showLiveIndicators}
                onPlayerSelect={setSelectedPlayer}
              />
              <TeamBench
                team={awayTeamForDisplay}
                liveMatch={displayLiveMatch}
                positionPpmBaselines={positionPpmBaselines}
                showLiveIndicators={showLiveIndicators}
                onPlayerSelect={setSelectedPlayer}
              />
            </div>
            <NotableOuts
              homeTeam={homeTeamForDisplay}
              awayTeam={awayTeamForDisplay}
              casualtyWardOuts={casualtyWardOuts}
            />
          </>
        ) : (
          isFixtureOnly ? <FixtureOnlyPanel /> : (
            <div className="rounded-lg border border-nrl-border bg-nrl-panel/70 px-4 py-5 text-sm text-nrl-muted">
              No lineup data available for this game.
            </div>
          )
        )}
          </>
        )}
      </div>
      <PlayerStatsDialog selection={selectedPlayerStats} onClose={() => setSelectedPlayer(null)} />
    </details>
  )
}

function LineupSelectors({
  yearOptions,
  selectedYear,
  selectedCompetition,
}: {
  yearOptions: LineupYearOption[]
  selectedYear: number
  selectedCompetition: LineupCompetition
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <label className="block w-36 sm:w-40">
        <span className="sr-only">Select competition</span>
        <select
          value={selectedCompetition}
          onChange={(event) => {
            const params = new URLSearchParams({ year: String(selectedYear) })
            if (event.target.value === "origin") params.set("competition", "origin")
            window.location.href = `/dashboard/lineups${params.toString() ? `?${params.toString()}` : ""}`
          }}
          className="w-full rounded-full border border-blue-300/35 bg-nrl-panel/90 px-4 py-2 text-xs font-black uppercase tracking-wide text-nrl-text shadow-[0_14px_30px_rgba(0,0,0,0.24)] outline-none transition-colors hover:border-nrl-accent/60 focus:border-nrl-accent"
        >
          <option value="nrl">NRL</option>
          <option value="origin">Origin</option>
        </select>
      </label>
      {yearOptions.length > 0 ? (
        <label className="block w-40 sm:w-48">
          <span className="sr-only">Select year</span>
          <select
            value={String(selectedYear)}
            onChange={(event) => {
              const params = new URLSearchParams({ year: event.target.value })
              if (selectedCompetition === "origin") params.set("competition", "origin")
              window.location.href = `/dashboard/lineups?${params.toString()}`
            }}
            className="w-full rounded-full border border-blue-300/35 bg-nrl-panel/90 px-4 py-2 text-xs font-black uppercase tracking-wide text-nrl-text shadow-[0_14px_30px_rgba(0,0,0,0.24)] outline-none transition-colors hover:border-nrl-accent/60 focus:border-nrl-accent"
          >
            {yearOptions.map((year) => (
              <option key={year.value} value={year.value}>
                {year.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  )
}

export function LineupsDashboard({
  matches,
  year,
  liveMatches: initialLiveMatches,
  weatherForecasts: initialWeatherForecasts,
  yearOptions,
  selectedRound,
  selectedYear,
  selectedCompetition,
  teamLogos,
  matchPredictions = {},
  tryChartsByTeam,
  canAccessFantasyProjections,
  summaryDiagnostic,
}: LineupsDashboardProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("Line Breaks")
  const [statsSource, setStatsSource] = useState<StatsSource>(selectedCompetition === "origin" ? "origin2026" : "nrl2026")
  const [matchDetails, setMatchDetails] = useState<Record<string, { status: "loading" | "loaded" | "error"; detail: LineupMatchDetailData | null }>>({})
  const [supplementalData, setSupplementalData] = useState<{
    key: string
    liveMatches: Record<string, LineupLiveMatch>
    weatherForecasts: Record<string, LineupWeatherForecast>
  } | null>(null)
  const supplementalFetchKey = useMemo(
    () => matches.map((match) => [match.matchId, match.venue ?? "", match.kickoffUtc ?? ""].join(":")).join("|"),
    [matches]
  )
  const activeSupplementalData = supplementalData?.key === supplementalFetchKey ? supplementalData : null
  const liveMatches = activeSupplementalData ? { ...initialLiveMatches, ...activeSupplementalData.liveMatches } : initialLiveMatches
  const weatherForecasts = activeSupplementalData
    ? { ...initialWeatherForecasts, ...activeSupplementalData.weatherForecasts }
    : initialWeatherForecasts

  function loadMatchDetail(match: LineupMatch) {
    const current = matchDetails[match.matchId]
    if (current?.status === "loading" || current?.status === "loaded") return

    setMatchDetails((details) => ({
      ...details,
      [match.matchId]: { status: "loading", detail: null },
    }))

    fetch("/api/lineups/match-detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: match.matchId, round: match.round || selectedRound, year, match, competition: selectedCompetition }),
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { detail?: LineupMatchDetailData | null } | null) => {
        const detail = data?.detail ?? fallbackLineupMatchDetail(match)
        setMatchDetails((details) => ({
          ...details,
          [match.matchId]: { status: "loaded", detail },
        }))
      })
      .catch((error) => {
        console.warn("Unable to load lineup match details.", error)
        const detail = fallbackLineupMatchDetail(match)
        setMatchDetails((details) => ({
          ...details,
          [match.matchId]: { status: "loaded", detail },
        }))
      })
  }

  useEffect(() => {
    if (matches.length === 0) return

    const payload = {
      matches: matches.map((match) => ({
        matchId: match.matchId,
        venue: match.venue,
        kickoffUtc: match.kickoffUtc,
      })),
    }
    const controllers = new Set<AbortController>()
    let stopped = false

    const fetchSupplemental = () => {
      const controller = new AbortController()
      controllers.add(controller)

      fetch("/api/lineups/supplemental", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => response.ok ? response.json() : null)
        .then((data: { liveMatches?: Record<string, LineupLiveMatch>; weatherForecasts?: Record<string, LineupWeatherForecast> } | null) => {
          if (!data || controller.signal.aborted || stopped) return
          setSupplementalData({
            key: supplementalFetchKey,
            liveMatches: data.liveMatches ?? {},
            weatherForecasts: data.weatherForecasts ?? {},
          })
        })
        .catch((error) => {
          if (!controller.signal.aborted && !stopped) console.warn("Unable to load lineup supplemental data.", error)
        })
        .finally(() => {
          controllers.delete(controller)
        })
    }

    fetchSupplemental()
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return
      if (shouldPollLiveSupplemental(matches)) fetchSupplemental()
    }, LIVE_SUPPLEMENTAL_POLL_MS)

    return () => {
      stopped = true
      window.clearInterval(intervalId)
      controllers.forEach((controller) => controller.abort())
      controllers.clear()
    }
  }, [matches, supplementalFetchKey])

  const matchDateGroups = matches.reduce<Array<{ dateKey: string; matches: LineupMatch[] }>>(
    (groups, match) => {
      const dateKey = matchDateKey(match)
      const currentGroup = groups.at(-1)
      if (currentGroup?.dateKey === dateKey) {
        currentGroup.matches.push(match)
      } else {
        groups.push({ dateKey, matches: [match] })
      }
      return groups
    },
    []
  )
  return (
    <div className="space-y-3">
      {summaryDiagnostic ? (
        <div className="rounded-lg border border-amber-300/50 bg-amber-300/12 px-4 py-3 text-xs font-semibold text-amber-100">
          {summaryDiagnostic}
        </div>
      ) : null}
      <LineupSelectors yearOptions={yearOptions} selectedYear={selectedYear} selectedCompetition={selectedCompetition} />
      {matches.length > 0 ? (
        <div className="space-y-11">
          {matchDateGroups.map((group) => (
            <section key={group.dateKey} className="space-y-10 sm:space-y-9">
              <div className="px-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
                {formatMatchDateHeader(group.dateKey)}
              </div>
              {group.matches.map((match) => (
                <LineupCard
                  key={match.matchId}
                  match={match}
                  liveMatch={liveMatches[match.matchId] ?? null}
                  weatherForecast={weatherForecasts[match.matchId] ?? null}
                  teamLogos={teamLogos}
                  displayMode={displayMode}
                  onDisplayModeChange={setDisplayMode}
                  statsSource={statsSource}
                  onStatsSourceChange={setStatsSource}
                  selectedCompetition={selectedCompetition}
                  canAccessFantasyProjections={canAccessFantasyProjections}
                  matchPrediction={matchPredictions[match.matchId] ?? null}
                  detail={matchDetails[match.matchId]?.detail ?? null}
                  detailStatus={matchDetails[match.matchId]?.status ?? "idle"}
                  tryChartsByTeam={tryChartsByTeam}
                  onOpen={() => loadMatchDetail(match)}
                />
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-nrl-border bg-nrl-panel/70 px-4 py-6 text-sm text-nrl-muted">
          No lineups are available for this round yet.
        </div>
      )}
    </div>
  )
}
