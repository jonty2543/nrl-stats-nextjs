"use client"

import { useState } from "react"
import { BillingPageLink } from "@/components/billing/billing-page-link"
import { generateMatchupInsights, type MatchupInsight } from "@/lib/lineups/matchup-insights"
import type {
  LineupCasualtyOut,
  LineupLiveMatch,
  LineupLivePlayerState,
  LineupLivePlayerStats,
  LineupMatch,
  LineupPlayer,
  LineupSportsbetOdds,
  LineupTeam,
  LineupTryscorerOdds,
} from "@/lib/lineups/nrl-lineups"

interface LineupsDashboardProps {
  matches: LineupMatch[]
  liveMatches: Record<string, LineupLiveMatch>
  teamLogos: Record<string, string>
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  sportsbetOdds: Record<string, LineupSportsbetOdds>
  canAccessFantasyProjections: boolean
  casualtyWardOuts: Record<string, LineupCasualtyOut[]>
  playerAverages: Record<string, Record<AverageStatKey, number>>
  positionPpmBaselines: Record<string, number>
}

type Slot = "FB" | "LW" | "LC" | "RW" | "RC" | "FE" | "HLF" | "LK" | "L2R" | "R2R" | "HK" | "PR"
type Orientation = "landscape" | "portrait"
type DisplayMode = "fantasy" | "odds" | AverageStatKey
type PlayerStatsSelection = {
  player: LineupPlayer
  liveState: LineupLivePlayerState | null
  liveStats: LineupLivePlayerStats | null
  baselinePpm: number | null
  baselineLabel: string | null
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
  | "Tackles Made"
  | "Line Breaks"
  | "Line Break Assists"
  | "Errors"
  | "Missed Tackles"
  | "Receipts"
  | "Tackle Breaks"
  | "Offloads"

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

const DISPLAY_MODES: { key: DisplayMode; label: string; shortLabel: string }[] = [
  { key: "fantasy", label: "Fantasy Projection", shortLabel: "Proj" },
  { key: "odds", label: "Best Odds", shortLabel: "Odds" },
  { key: "Tries", label: "Try Scoring Avg", shortLabel: "Tries" },
  { key: "Try Assists", label: "Try Assists Avg", shortLabel: "TA" },
  { key: "All Run Metres", label: "Run Metres Avg", shortLabel: "RM" },
  { key: "Tackles Made", label: "Tackles Avg", shortLabel: "TK" },
  { key: "Line Breaks", label: "Linebreaks Avg", shortLabel: "LB" },
  { key: "Line Break Assists", label: "Linebreak Assists Avg", shortLabel: "LBA" },
  { key: "Errors", label: "Errors Avg", shortLabel: "ERR" },
  { key: "Missed Tackles", label: "Missed Tackles Avg", shortLabel: "MT" },
  { key: "Receipts", label: "Receipts Avg", shortLabel: "REC" },
  { key: "Tackle Breaks", label: "Tackle Breaks Avg", shortLabel: "TB" },
  { key: "Offloads", label: "Offloads Avg", shortLabel: "OFF" },
]

function isProDisplayMode(mode: DisplayMode): boolean {
  return mode !== "odds"
}

const INSIGHT_CATEGORY_CLASSES: Record<MatchupInsight["category"], string> = {
  Matchup: "border-nrl-accent/20 bg-nrl-accent/10 text-nrl-accent",
  Fantasy: "border-sky-300/25 bg-sky-400/10 text-sky-100",
  Betting: "border-amber-300/25 bg-amber-400/10 text-amber-100",
  Stats: "border-violet-300/25 bg-violet-400/10 text-violet-100",
  "Team News": "border-red-300/25 bg-red-400/10 text-red-100",
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
]

function teamAliases(value: string | null | undefined): string[] {
  const key = normaliseKey(value)
  if (!key) return []
  const aliases = new Set([key])
  for (const group of TEAM_ALIAS_GROUPS) {
    if (group.includes(key)) group.forEach((alias) => aliases.add(alias))
  }
  return [...aliases]
}

function livePlayerKey(player: LineupPlayer): string {
  return player.playerId != null ? String(player.playerId) : `${normaliseKey(player.team)}|${normaliseKey(player.player)}`
}

function getLivePlayerState(liveMatch: LineupLiveMatch | null | undefined, player: LineupPlayer): LineupLivePlayerState | null {
  return liveMatch?.playerStates[livePlayerKey(player)] ?? null
}

function getLivePlayerStats(liveMatch: LineupLiveMatch | null | undefined, player: LineupPlayer): LineupLivePlayerStats | null {
  return liveMatch?.playerStats[livePlayerKey(player)] ?? null
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
  if (spaced.toLowerCase() === "second half") return "2nd half"
  if (spaced.toLowerCase() === "first half") return "1st half"
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

function resolveLogo(team: LineupTeam | null, teamLogos: Record<string, string>): string | null {
  if (!team) return null
  const candidates = [team.team, team.teamName, team.teamName.replace(/^North Queensland /, ""), team.teamName.replace(/^Gold Coast /, "")]
  for (const candidate of candidates) {
    const logo = teamLogos[normaliseKey(candidate)]
    if (logo) return logo
  }
  return null
}

function sportsbetOddsForTeam(
  match: LineupMatch,
  team: LineupTeam | null,
  sportsbetOdds: Record<string, LineupSportsbetOdds>
): LineupSportsbetOdds | null {
  if (!team) return null
  const dateKey = matchDateKey(match).slice(0, 10)
  const matchKey = normaliseKey(match.match)
  const teamKeys = [...new Set([team.team, team.teamName].flatMap(teamAliases))]
  const candidates = teamKeys.flatMap((teamKey) => [
    `${dateKey}|${matchKey}|${teamKey}`,
    `${dateKey}|${teamKey}`,
    teamKey,
  ])

  for (const candidate of candidates) {
    const odds = sportsbetOdds[candidate]
    if (odds) return odds
  }
  for (const odds of Object.values(sportsbetOdds)) {
    if (odds.matchDate.slice(0, 10) !== dateKey) continue
    const oddsTeamKeys = teamAliases(odds.team)
    if (teamKeys.some((teamKey) => oddsTeamKeys.includes(teamKey))) return odds
  }
  return null
}

function formatKickoff(value: string | null): string {
  if (!value) return "TBC"
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Brisbane",
  }).format(new Date(value))
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function displayName(player: LineupPlayer): string {
  const parts = player.player.split(/\s+/).filter(Boolean)
  const last = parts.at(-1) ?? player.player
  return `${player.isCaptain ? "(C) " : ""}${last}`
}

function formatAverage(value: number | null | undefined, mode: AverageStatKey): string {
  if (value == null) return "-"
  if (mode === "All Run Metres" || mode === "Receipts") return value.toFixed(0)
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

  return (
    <div className={`${textClass} font-semibold leading-tight text-emerald-100/90`}>
      {formatAverage(playerAverages[playerKey]?.[displayMode], displayMode)} avg
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

function LiveScoreHeader({ match, liveMatch }: { match: LineupMatch; liveMatch: LineupLiveMatch | null }) {
  const state = liveMatch?.state
  const clock = formatGameClock(state?.gameSeconds ?? state?.liveSeconds)
  const score = liveScore(liveMatch)
  const showLiveBadge = isMatchLive(liveMatch)
  const matchStateLabel = isStaleUnfinishedMatch(liveMatch) ? "Full time" : formatMatchState(state?.matchState)

  const hasScore = score.homeScore != null || score.awayScore != null

  return (
    <div className="flex min-w-[8.5rem] flex-col justify-center px-2 py-1 text-center sm:min-w-[12rem] sm:px-6">
      {hasScore ? (
        <>
          {showLiveBadge ? (
            <div className="mb-2 inline-flex self-center items-center gap-1 rounded-full border border-red-300/30 bg-red-500/15 px-1.5 py-px text-[8px] font-black uppercase tracking-[0.14em] text-red-100">
              <span className="h-1 w-1 rounded-full bg-red-300 shadow-[0_0_8px_rgba(252,165,165,0.85)]" aria-hidden="true" />
              Live
            </div>
          ) : null}
          <div className="text-3xl font-black leading-none tabular-nums text-nrl-text sm:text-4xl">
            {score.homeScore ?? "-"} - {score.awayScore ?? "-"}
          </div>
          <div className="mt-4 text-[11px] font-bold uppercase tracking-wide text-emerald-300 sm:text-xs">
            {matchStateLabel}{clock && showLiveBadge ? ` · ${clock}` : ""}
          </div>
        </>
      ) : (
        <div className="mx-auto inline-flex rounded-full border border-nrl-border bg-nrl-panel px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-nrl-accent">
          vs
        </div>
      )}
      <div className="mt-7 text-[10px] font-bold uppercase tracking-wide text-nrl-accent">{match.round}</div>
      <div className="mx-auto mt-1.5 max-w-[40vw] truncate text-[11px] text-nrl-muted sm:max-w-[360px]">
        {formatKickoff(match.kickoffUtc)}{match.venue ? ` · ${match.venue}` : ""}
      </div>
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
    <div className="mb-3 rounded-md border border-nrl-border bg-nrl-panel/60 px-3 py-3">
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
    <div className="min-w-0 rounded-md bg-nrl-panel px-3 py-2">
      <div className="truncate text-[9px] font-bold uppercase tracking-wide text-nrl-muted">{item.label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums text-nrl-text">{item.value}</div>
    </div>
  )
}

function PlayerStatGroup({ group }: { group: PlayerStatDisplayGroup }) {
  return (
    <section className="rounded-md border border-nrl-border bg-nrl-panel-2/70 p-2">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-nrl-muted">{group.title}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {group.items.map((item) => (
          <PlayerStatTile key={`${group.title}-${item.label}`} item={item} />
        ))}
      </div>
    </section>
  )
}

function PlayerStatsDialog({ selection, onClose }: { selection: PlayerStatsSelection | null; onClose: () => void }) {
  if (!selection) return null
  const { player, liveState, liveStats } = selection
  const fantasyPpm = fantasyPointsPerMinute(liveStats)
  const groups: PlayerStatDisplayGroup[] = [
    {
      title: "Summary",
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

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-lg border border-nrl-border bg-nrl-panel-2 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-nrl-border px-4 py-3">
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
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-lg font-bold leading-none text-nrl-muted transition-colors hover:text-nrl-text"
            aria-label="Close player stats"
          >
            ×
          </button>
        </div>

        {liveStats ? (
          <div className="max-h-[calc(88vh-5.5rem)] space-y-3 overflow-y-auto p-3">
            {groups.map((group) => (
              <PlayerStatGroup key={group.title} group={group} />
            ))}
          </div>
        ) : (
          <div className="px-4 py-5 text-sm text-nrl-muted">No live stat summary available yet.</div>
        )}
      </div>
    </div>
  )
}

function playerSlot(player: LineupPlayer): Slot | null {
  const position = player.position.toLowerCase()
  if (player.number === 1 || position.includes("fullback")) return "FB"
  if (player.number === 6) return player.side === "right" ? "HLF" : "FE"
  if (player.number === 7) return player.side === "left" ? "FE" : "HLF"
  if (player.number === 8 || player.number === 10) return "PR"
  if (player.number === 9) return "HK"
  if (player.number === 11 || player.number === 12) return player.side === "right" ? "R2R" : "L2R"
  if (player.number === 13) return "LK"
  if (player.number != null && player.number >= 14) return null
  if (position.includes("interchange") || position.includes("reserve")) return null
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
  return []
}

function buildTeamPitchSlotMap(players: LineupPlayer[]): Map<string, Slot> {
  const slots = new Map<string, Slot>()
  const occupied = new Set<Slot>()

  for (const player of players) {
    const slot = playerSlot(player)
    if (!slot) continue
    slots.set(pitchPlayerKey(player), slot)
    occupied.add(slot)
  }

  for (const player of players) {
    const key = pitchPlayerKey(player)
    if (slots.has(key)) continue
    const slot = replacementCandidateSlots(player).find((candidate) => !occupied.has(candidate))
    if (!slot) continue
    slots.set(key, slot)
    occupied.add(slot)
  }

  return slots
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
  orientation: Orientation
): { left: string; top: string } {
  const depthMap = orientation === "portrait" ? PORTRAIT_DEPTH_X : DEPTH_X
  const laneMap = orientation === "portrait" ? PORTRAIT_LANE_Y : LANE_Y
  const propLane = orientation === "portrait" ? 82 : 79
  const depth = depthMap[slot]
  const lane = slot === "PR" && player.number === 10 ? propLane : laneMap[slot]

  if (orientation === "portrait") {
    const top = side === "home" ? depth : 100 - depth
    const left = side === "home" ? 100 - lane : lane
    return { left: `${left}%`, top: `${top}%` }
  }

  const left = side === "home" ? depth : 100 - depth
  const top = side === "home" ? lane : 100 - lane
  return { left: `${left}%`, top: `${top}%` }
}

function SportsbetOddsPill({ odds }: { odds: LineupSportsbetOdds }) {
  return (
    <div className="mt-1.5 flex justify-center">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-nrl-panel/75 px-2 py-1 text-[11px] font-bold tabular-nums text-nrl-text sm:text-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BOOKIE_LOGOS.Sportsbet} alt="Sportsbet" className="h-3 w-auto object-contain sm:h-3.5" loading="lazy" />
        <span>{odds.price.toFixed(2)}</span>
      </span>
    </div>
  )
}

function TeamBadge({
  team,
  teamLogos,
  sportsbetOdds,
}: {
  team: LineupTeam | null
  teamLogos: Record<string, string>
  sportsbetOdds: LineupSportsbetOdds | null
}) {
  const logo = resolveLogo(team, teamLogos)
  const shortName = team?.team ?? team?.teamName ?? "TBC"
  const fullName = team?.teamName ?? team?.team ?? "TBC"

  return (
    <div className="flex min-h-[9.25rem] w-[7.5rem] min-w-0 max-w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-md border border-nrl-border bg-nrl-panel px-2.5 py-4 text-center shadow-[0_10px_24px_rgba(0,0,0,0.18)] sm:min-h-[10rem] sm:w-[9rem] sm:px-3 sm:py-5">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-12 w-12 object-contain sm:h-14 sm:w-14" loading="lazy" />
      ) : null}
      <div className="w-full min-w-0">
        <div className="truncate text-sm font-bold text-nrl-text sm:hidden">{shortName}</div>
        <div className="hidden truncate text-base font-bold text-nrl-text sm:block">{fullName}</div>
        {sportsbetOdds ? <SportsbetOddsPill odds={sportsbetOdds} /> : null}
      </div>
    </div>
  )
}

function PitchPlayer({
  player,
  slot,
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
  const imageUrl = normaliseImageUrl(player.headImage ?? player.bodyImage)
  const position = slotPosition(slot, player, side, orientation)
  const compact = orientation === "portrait"
  const liveState = getLivePlayerState(liveMatch, player)
  const liveStats = getLivePlayerStats(liveMatch, player)
  const baseline = positionBaselineForPlayer(player, positionPpmBaselines)
  const isOffFieldStarter = showLiveIndicators && liveState?.isOnField === false

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
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
          ) : (
            <span className="text-[10px] font-bold text-nrl-muted">{initials(player.player)}</span>
          )}
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
      <div className={`${compact ? "max-w-[3.45rem] text-[9px]" : "text-[11px]"} mx-auto mt-1 truncate font-bold leading-tight text-white drop-shadow`} title={player.player}>
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
      <FantasyBaselineBar
        stats={liveStats}
        baselinePpm={baseline.value}
        baselineLabel={baseline.label}
        compact={compact}
        className="mx-auto mt-1"
      />
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
  canAccessFantasyProjections,
  tryscorerOdds,
  playerAverages,
  liveMatch,
  positionPpmBaselines,
  showLiveIndicators,
  onPlayerSelect,
}: {
  homePlayers: LineupPlayer[]
  awayPlayers: LineupPlayer[]
  orientation: Orientation
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
  canAccessFantasyProjections: boolean
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  playerAverages: Record<string, Record<AverageStatKey, number>>
  liveMatch: LineupLiveMatch | null
  positionPpmBaselines: Record<string, number>
  showLiveIndicators: boolean
  onPlayerSelect: (player: LineupPlayer) => void
}) {
  const sizeClass =
    orientation === "portrait"
      ? "mx-auto h-[840px] w-full max-w-[460px] md:hidden"
      : "hidden h-[520px] w-full md:block"
  const isLive = hasMatchStarted(liveMatch)
  const homePitchSlots = buildTeamPitchSlotMap(homePlayers)
  const awayPitchSlots = buildTeamPitchSlotMap(awayPlayers)

  return (
    <div className={`${sizeClass} relative overflow-hidden rounded-lg border-2 border-emerald-300/45 bg-[radial-gradient(circle_at_50%_50%,rgba(0,245,138,0.16),transparent_30%),linear-gradient(90deg,rgba(8,26,33,0.98),rgba(15,112,73,0.92)_50%,rgba(8,26,33,0.98))]`}>
      <FieldLines orientation={orientation} />
      {!isLive ? (
        <div className={orientation === "portrait" ? "absolute left-2 top-2 z-[4]" : "absolute left-1/2 top-3 z-[4] -translate-x-1/2"}>
          <DisplayModeControl
            displayMode={displayMode}
            onDisplayModeChange={onDisplayModeChange}
            canAccessFantasyProjections={canAccessFantasyProjections}
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
            side="home"
            orientation={orientation}
            displayMode={displayMode}
            tryscorerOdds={tryscorerOdds}
            playerAverages={playerAverages}
            canAccessFantasyProjections={canAccessFantasyProjections}
            showPlayerMetric={!isLive}
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
            side="away"
            orientation={orientation}
            displayMode={displayMode}
            tryscorerOdds={tryscorerOdds}
            playerAverages={playerAverages}
            canAccessFantasyProjections={canAccessFantasyProjections}
            showPlayerMetric={!isLive}
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
  return (
    <div className="min-w-0 rounded-md border border-nrl-border bg-nrl-panel/70 p-2">
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
                  <FantasyBaselineBar
                    stats={liveStats}
                    baselinePpm={baseline.value}
                    baselineLabel={baseline.label}
                    compact
                    className="mt-1"
                  />
                </span>
                {showLiveIndicators && liveState?.isOnField ? <LiveStatusIcon type="on" compact /> : null}
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
    <div className="min-w-0 rounded-md bg-nrl-panel/55 p-2">
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
    <details className="group/notable mt-3 overflow-hidden rounded-md border border-nrl-border bg-nrl-panel/70">
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

function MatchupInsightsPanel({
  insights,
  canAccessFullInsights,
}: {
  insights: MatchupInsight[]
  canAccessFullInsights: boolean
}) {
  const visibleInsights = canAccessFullInsights ? insights : insights.slice(0, 1)
  const lockedPreviewInsights = canAccessFullInsights ? [] : insights.slice(1)
  const lockedInsightCount = canAccessFullInsights ? 0 : Math.max(0, insights.length - visibleInsights.length)

  return (
    <details className="group/insights mb-5 overflow-hidden rounded-md border border-nrl-border bg-nrl-panel/75" open>
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

      <div className="max-h-44 overflow-y-auto border-t border-nrl-border p-2">
        {visibleInsights.length > 0 ? (
          <div className="grid gap-2.5">
            {visibleInsights.map((insight, insightIndex) => (
              <div
                key={`${insight.category}-${insight.title}-${insightIndex}`}
                className="min-w-0 rounded-md border border-white/10 bg-nrl-panel-2/65 px-2 py-2"
              >
                <div className="flex min-w-0 items-start gap-1.5">
                  <span className={`${INSIGHT_CATEGORY_CLASSES[insight.category]} shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide`}>
                    {insight.category}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold leading-snug text-nrl-text">{insight.title}</div>
                    <div className="mt-0.5 text-[9px] leading-snug text-nrl-muted">{insight.description}</div>
                  </div>
                </div>
              </div>
            ))}
            {lockedInsightCount > 0 ? (
              <div className="relative min-h-24 overflow-hidden rounded-md border border-nrl-border bg-nrl-panel-2/65">
                <div className="grid gap-2 p-2 blur-[3px] select-none">
                  {(lockedPreviewInsights.length > 0 ? lockedPreviewInsights : visibleInsights).map((insight, insightIndex) => (
                    <div
                      key={`locked-${insight.category}-${insight.title}-${insightIndex}`}
                      className="min-w-0 rounded-md border border-white/10 bg-nrl-panel/70 px-2 py-2 opacity-75"
                    >
                      <div className="flex min-w-0 items-start gap-1.5">
                        <span className={`${INSIGHT_CATEGORY_CLASSES[insight.category]} shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide`}>
                          {insight.category}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold leading-snug text-nrl-text">{insight.title}</div>
                          <div className="mt-0.5 text-[9px] leading-snug text-nrl-muted">{insight.description}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-[#080d1f]/35 px-3 backdrop-blur-[2px]">
                  <BillingPageLink className="block rounded-[1rem] bg-[linear-gradient(135deg,rgba(141,99,255,0.95),rgba(0,245,138,0.95))] p-[1px] shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition-transform hover:scale-[1.01]">
                    <div className="rounded-[calc(1rem-1px)] bg-slate-950/80 px-4 py-3 text-center">
                      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-100">
                        Sign Up To Pro
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        Unlock {lockedInsightCount} more matchup {lockedInsightCount === 1 ? "insight" : "insights"}.
                      </div>
                    </div>
                  </BillingPageLink>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-white/10 bg-nrl-panel-2/55 px-2 py-1.5 text-[10px] text-nrl-muted">
            No strong matchup signals identified yet.
          </div>
        )}
      </div>
    </details>
  )
}

function DisplayModeControl({
  displayMode,
  onDisplayModeChange,
  canAccessFantasyProjections,
  compact = false,
}: {
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
  canAccessFantasyProjections: boolean
  compact?: boolean
}) {
  return (
    <label className={compact ? "block w-24" : "block w-[174px] max-w-[44vw]"}>
      <span className="sr-only">Display</span>
      <select
        value={displayMode}
        onChange={(event) => {
          const nextMode = event.target.value as DisplayMode
          if (!canAccessFantasyProjections && isProDisplayMode(nextMode)) return
          onDisplayModeChange(nextMode)
        }}
        className={`${compact ? "text-[10px]" : "text-[11px]"} w-full rounded-md border border-emerald-300/35 bg-nrl-panel/90 px-2 py-1.5 font-semibold text-nrl-text shadow-[0_8px_18px_rgba(0,0,0,0.24)] outline-none backdrop-blur transition-colors hover:border-nrl-accent/50 focus:border-nrl-accent`}
      >
        {DISPLAY_MODES.map((mode) => {
          const isLocked = !canAccessFantasyProjections && isProDisplayMode(mode.key)
          return (
            <option key={mode.key} value={mode.key} disabled={isLocked}>
              {compact ? `${mode.shortLabel}${isLocked ? " Pro" : ""}` : `${mode.label}${isLocked ? " (Pro)" : ""}`}
            </option>
          )
        })}
      </select>
    </label>
  )
}

function LineupCard({
  match,
  liveMatch,
  index,
  teamLogos,
  displayMode,
  onDisplayModeChange,
  tryscorerOdds,
  sportsbetOdds,
  canAccessFantasyProjections,
  casualtyWardOuts,
  playerAverages,
  positionPpmBaselines,
}: {
  match: LineupMatch
  liveMatch: LineupLiveMatch | null
  index: number
  teamLogos: Record<string, string>
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
  tryscorerOdds: Record<string, LineupTryscorerOdds>
  sportsbetOdds: Record<string, LineupSportsbetOdds>
  canAccessFantasyProjections: boolean
  casualtyWardOuts: Record<string, LineupCasualtyOut[]>
  playerAverages: Record<string, Record<AverageStatKey, number>>
  positionPpmBaselines: Record<string, number>
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<LineupPlayer | null>(null)
  const homePlayers = match.homeTeam?.players ?? []
  const awayPlayers = match.awayTeam?.players ?? []
  const isLive = hasMatchStarted(liveMatch)
  const showLiveIndicators = isMatchLive(liveMatch)
  const homeSportsbetOdds = isLive ? null : sportsbetOddsForTeam(match, match.homeTeam, sportsbetOdds)
  const awaySportsbetOdds = isLive ? null : sportsbetOddsForTeam(match, match.awayTeam, sportsbetOdds)
  const selectedPlayerStats: PlayerStatsSelection | null = selectedPlayer
    ? {
        player: selectedPlayer,
        liveState: getLivePlayerState(liveMatch, selectedPlayer),
        liveStats: getLivePlayerStats(liveMatch, selectedPlayer),
        baselinePpm: positionBaselineForPlayer(selectedPlayer, positionPpmBaselines).value,
        baselineLabel: positionBaselineForPlayer(selectedPlayer, positionPpmBaselines).label,
      }
    : null
  const insights = isLive
    ? []
    : generateMatchupInsights({
        match,
        tryscorerOdds,
        casualtyWardOuts,
        playerAverages,
      })

  return (
    <details className="group rounded-lg border border-nrl-border bg-nrl-panel-2" open={index === 0}>
      <summary className="relative cursor-pointer list-none px-3 py-5 marker:hidden sm:px-5 sm:py-7 [&::-webkit-details-marker]:hidden">
        <div className="mx-auto grid max-w-4xl grid-cols-[minmax(0,1fr)_minmax(8.5rem,auto)_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)_minmax(0,1fr)] sm:gap-8">
          <div className="min-w-0 justify-self-center">
            <TeamBadge team={match.homeTeam} teamLogos={teamLogos} sportsbetOdds={homeSportsbetOdds} />
          </div>
          <LiveScoreHeader match={match} liveMatch={liveMatch} />
          <div className="min-w-0 justify-self-center">
            <TeamBadge team={match.awayTeam} teamLogos={teamLogos} sportsbetOdds={awaySportsbetOdds} />
          </div>
        </div>
        <span className="absolute bottom-0 left-1/2 z-10 inline-grid h-9 w-9 -translate-x-1/2 translate-y-1/2 place-items-center rounded-full border border-nrl-border bg-nrl-panel text-nrl-muted transition-colors group-hover:text-nrl-text">
          <span className="sr-only">Toggle lineups</span>
          <svg
            viewBox="0 0 16 16"
            className="h-5 w-5 transition-transform group-open:rotate-180"
            fill="none"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>

      <div className="border-t border-nrl-border px-2 pb-3 sm:px-3">
        <div className="pt-5" />
        <LiveTryScorersStrip match={match} liveMatch={liveMatch} />
        {!isLive ? <MatchupInsightsPanel insights={insights} canAccessFullInsights={canAccessFantasyProjections} /> : null}
        <Pitch
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          orientation="portrait"
          displayMode={displayMode}
          onDisplayModeChange={onDisplayModeChange}
          canAccessFantasyProjections={canAccessFantasyProjections}
          tryscorerOdds={tryscorerOdds}
          playerAverages={playerAverages}
          liveMatch={liveMatch}
          positionPpmBaselines={positionPpmBaselines}
          showLiveIndicators={showLiveIndicators}
          onPlayerSelect={setSelectedPlayer}
        />
        <Pitch
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          orientation="landscape"
          displayMode={displayMode}
          onDisplayModeChange={onDisplayModeChange}
          canAccessFantasyProjections={canAccessFantasyProjections}
          tryscorerOdds={tryscorerOdds}
          playerAverages={playerAverages}
          liveMatch={liveMatch}
          positionPpmBaselines={positionPpmBaselines}
          showLiveIndicators={showLiveIndicators}
          onPlayerSelect={setSelectedPlayer}
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <TeamBench
            team={match.homeTeam}
            liveMatch={liveMatch}
            positionPpmBaselines={positionPpmBaselines}
            showLiveIndicators={showLiveIndicators}
            onPlayerSelect={setSelectedPlayer}
          />
          <TeamBench
            team={match.awayTeam}
            liveMatch={liveMatch}
            positionPpmBaselines={positionPpmBaselines}
            showLiveIndicators={showLiveIndicators}
            onPlayerSelect={setSelectedPlayer}
          />
        </div>
        <NotableOuts
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          casualtyWardOuts={casualtyWardOuts}
        />
      </div>
      <PlayerStatsDialog selection={selectedPlayerStats} onClose={() => setSelectedPlayer(null)} />
    </details>
  )
}

export function LineupsDashboard({
  matches,
  liveMatches,
  teamLogos,
  tryscorerOdds,
  sportsbetOdds,
  canAccessFantasyProjections,
  casualtyWardOuts,
  playerAverages,
  positionPpmBaselines,
}: LineupsDashboardProps) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("odds")
  const matchDateGroups = matches.reduce<Array<{ dateKey: string; matches: Array<{ match: LineupMatch; index: number }> }>>(
    (groups, match, index) => {
      const dateKey = matchDateKey(match)
      const currentGroup = groups.at(-1)
      if (currentGroup?.dateKey === dateKey) {
        currentGroup.matches.push({ match, index })
      } else {
        groups.push({ dateKey, matches: [{ match, index }] })
      }
      return groups
    },
    []
  )

  return (
    <div className="space-y-3">
      {matches.length > 0 ? (
        <div className="space-y-11">
          {matchDateGroups.map((group) => (
            <section key={group.dateKey} className="space-y-6">
              <div className="px-1 text-xs font-bold uppercase tracking-[0.18em] text-nrl-accent/90">
                {formatMatchDateHeader(group.dateKey)}
              </div>
              {group.matches.map(({ match, index }) => (
                <LineupCard
                  key={match.matchId}
                  match={match}
                  liveMatch={liveMatches[match.matchId] ?? null}
                  index={index}
                  teamLogos={teamLogos}
                  displayMode={displayMode}
                  onDisplayModeChange={setDisplayMode}
                  tryscorerOdds={tryscorerOdds}
                  sportsbetOdds={sportsbetOdds}
                  canAccessFantasyProjections={canAccessFantasyProjections}
                  casualtyWardOuts={casualtyWardOuts}
                  playerAverages={playerAverages}
                  positionPpmBaselines={positionPpmBaselines}
                />
              ))}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  )
}
