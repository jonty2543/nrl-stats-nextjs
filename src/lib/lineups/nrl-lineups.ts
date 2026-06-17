import { createServerSupabaseClient } from "@/lib/supabase/client"
import { loadDraw2026Data } from "@/lib/draw/load-draw-2026"
import type { Draw2026Row } from "@/lib/draw/types"

export type LineupSide = "left" | "right" | "middle" | "spine" | "bench" | "unknown"
export type LineupCompetition = "nrl" | "origin"

export interface LineupPlayer {
  matchId: string
  team: string
  teamName: string
  teamId: number | null
  teamType: "Home" | "Away" | string
  number: number | null
  position: string
  player: string
  playerId: number | null
  isCaptain: boolean
  isOnField: boolean
  headImage: string | null
  bodyImage: string | null
  fantasyProjection: number | null
  side: LineupSide
  sideSource: "override" | "nominal" | "unknown"
}

export interface LineupTeam {
  team: string
  teamName: string
  teamId: number | null
  teamType: string
  players: LineupPlayer[]
}

export interface LineupMatch {
  matchId: string
  matchDate: string
  kickoffUtc: string | null
  round: string
  venue: string | null
  match: string
  matchUrl: string | null
  homeTeam: LineupTeam | null
  awayTeam: LineupTeam | null
  homeScore?: number | null
  awayScore?: number | null
  recentHeadToHead?: LineupRecentResult[]
  homeRecentResults?: LineupRecentResult[]
  awayRecentResults?: LineupRecentResult[]
}

export interface LineupRecentResult {
  matchDate: string
  round: string | null
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
}

export interface LineupRoundOption {
  value: string
  label: string
  roundNumber: number
  startDate: string
  endDate: string
}

export interface LineupYearOption {
  value: string
  label: string
  year: number
}

export interface LineupTeamMatchStats {
  team: string
  score: number | null
  possessionPct: number | null
  completionRate: number | null
  fantasyPoints: number | null
  tries: number | null
  allRunMetres: number | null
  postContactMetres: number | null
  lineBreaks: number | null
  tackleBreaks: number | null
  tacklesMade: number | null
  missedTackles: number | null
  errors: number | null
  offloads: number | null
}

export interface LineupMatchStats {
  matchId: string
  homeTeam: string
  awayTeam: string
  home: LineupTeamMatchStats
  away: LineupTeamMatchStats
  scoringEvents: LineupLiveScoringEvent[]
  playerStats: Record<string, LineupLivePlayerStats>
}

export interface LineupRoundMatchesResult {
  matches: LineupMatch[]
  matchStats: Record<string, LineupMatchStats>
}

export interface LineupTryscorerOdds {
  player: string
  bestBookie: string | null
  bestPrice: number | null
}

export interface LineupSportsbetOdds {
  team: string
  matchDate: string
  match: string
  price: number
}

export interface LineupCasualtyOut {
  team: string
  player: string
  injury: string | null
  returnDate: string | null
}

export interface LineupLiveMatchState {
  matchId: string
  matchState: string
  matchMode: string | null
  gameSeconds: number | null
  liveSeconds: number | null
  homeTeamId: number | null
  homeTeam: string | null
  homeScore: number | null
  awayTeamId: number | null
  awayTeam: string | null
  awayScore: number | null
  updatedAt: string | null
}

export interface LineupLiveScoringEvent {
  matchId: string
  eventKey: string
  timelineIndex: number | null
  scoringType: string
  teamId: number | null
  team: string | null
  playerId: number | null
  player: string | null
  gameSeconds: number | null
  matchMinute: number | null
  homeScore: number | null
  awayScore: number | null
}

export interface LineupLivePlayerState {
  matchId: string
  teamId: number | null
  team: string | null
  playerId: number | null
  player: string | null
  number: number | null
  position: string | null
  isOnField: boolean
  updatedAt: string | null
}

export interface LineupLivePlayerStats {
  matchId: string
  teamId: number | null
  team: string | null
  playerId: number | null
  player: string | null
  number: number | null
  position: string | null
  stats: Record<string, unknown>
  minutesPlayed: number | null
  fantasyPointsTotal: number | null
  points: number | null
  tries: number | null
  tryAssists: number | null
  lineBreaks: number | null
  lineBreakAssists: number | null
  tackleBreaks: number | null
  allRuns: number | null
  allRunMetres: number | null
  postContactMetres: number | null
  tacklesMade: number | null
  missedTackles: number | null
  ineffectiveTackles: number | null
  offloads: number | null
  errors: number | null
  penalties: number | null
  kicks: number | null
  kickMetres: number | null
  receipts: number | null
  passes: number | null
  updatedAt: string | null
}

export interface LineupLiveMatch {
  state: LineupLiveMatchState | null
  scoringEvents: LineupLiveScoringEvent[]
  playerStates: Record<string, LineupLivePlayerState>
  playerStats: Record<string, LineupLivePlayerStats>
}

type RawRow = Record<string, unknown>

const PAGE_SIZE = 1000
const LINEUPS_FETCH_TIMEOUT_MS = 2000
const LINEUP_COMPETITION_TABLES: Record<LineupCompetition, { lineups: string; matches: string; playerStats: string }> = {
  nrl: { lineups: "lineups", matches: "matches", playerStats: "player_stats" },
  origin: { lineups: "origin_lineups", matches: "origin_matches", playerStats: "origin_player_stats" },
}
const LINEUP_SELECT_BASE = [
  "match_id",
  "match_date",
  "kickoff_utc",
  "round",
  "venue",
  "match",
  "match_url",
  "team",
  "team_name",
  "team_id",
  "team_type",
  "number",
  "position",
  "player",
  "player_id",
  "is_captain",
  "is_on_field",
  "head_image",
  "body_image",
] as const

interface FetchUpcomingLineupsOptions {
  includeFantasyProjections?: boolean
  competition?: LineupCompetition
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function nullableText(value: unknown): string | null {
  const parsed = text(value)
  return parsed || null
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1
  if (typeof value === "string") return value.toLowerCase() === "true"
  return false
}

function recordValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function withTimeout<T>(promise: PromiseLike<T>, fallback: T, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<T>((resolve) => {
    timeout = setTimeout(() => {
      console.warn(`${label} timed out; using fallback.`)
      resolve(fallback)
    }, timeoutMs)
  })

  return Promise.race([
    Promise.resolve(promise).catch((error) => {
      console.warn(`${label} failed; using fallback.`, error)
      return fallback
    }),
    timeoutPromise,
  ]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

function normaliseSide(value: unknown): LineupSide | null {
  const side = text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ")
  if (!side) return null
  if (side === "left" || side === "l" || side === "left edge") return "left"
  if (side === "right" || side === "r" || side === "right edge") return "right"
  if (side === "middle" || side === "mid") return "middle"
  if (side === "spine") return "spine"
  if (side === "bench" || side === "interchange") return "bench"
  return null
}

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

function canonicalTeamKey(value: string | null | undefined): string {
  const key = normaliseKey(value)
  if (!key) return ""
  for (const group of TEAM_ALIAS_GROUPS) {
    if (group.includes(key)) return group[0]
  }
  return key
}

function rowDateKey(value: unknown): string {
  const raw = text(value)
  return raw ? raw.slice(0, 10) : ""
}

function getTodayInBrisbane(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value
  return `${year}-${month}-${day}`
}

function getCurrentYearInBrisbane(): number {
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
  }).format(new Date())
  return Number(year)
}

function roundSort(value: string | null | undefined): number {
  const parsed = Number(String(value ?? "").match(/\d+/)?.[0] ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function matchMergeKey(matchDate: string, homeTeam: string, awayTeam: string): string {
  return [matchDate.slice(0, 10), canonicalTeamKey(homeTeam), canonicalTeamKey(awayTeam)].join("|")
}

function resultIncludesTeam(result: LineupRecentResult, team: string): boolean {
  const teamKeys = new Set(teamAliases(team))
  return teamKeys.has(canonicalTeamKey(result.homeTeam)) || teamKeys.has(canonicalTeamKey(result.awayTeam))
}

function resultIncludesMatchup(result: LineupRecentResult, homeTeam: string, awayTeam: string): boolean {
  return resultIncludesTeam(result, homeTeam) && resultIncludesTeam(result, awayTeam)
}

function resultBeforeMatch(result: LineupRecentResult, matchDate: string): boolean {
  const resultDate = result.matchDate.slice(0, 10)
  const currentDate = matchDate.slice(0, 10)
  return Boolean(resultDate && currentDate && resultDate < currentDate)
}

function addRecentResults(match: LineupMatch, results: LineupRecentResult[]): LineupMatch {
  const homeTeam = match.homeTeam?.team ?? match.match.split(/\s+vs\s+/i)[0]?.trim()
  const awayTeam = match.awayTeam?.team ?? match.match.split(/\s+vs\s+/i)[1]?.trim()
  if (!homeTeam || !awayTeam) return match

  const previousResults = results.filter((result) => resultBeforeMatch(result, match.matchDate))
  return {
    ...match,
    recentHeadToHead: previousResults.filter((result) => resultIncludesMatchup(result, homeTeam, awayTeam)).slice(0, 30),
    homeRecentResults: previousResults.filter((result) => resultIncludesTeam(result, homeTeam)).slice(0, 30),
    awayRecentResults: previousResults.filter((result) => resultIncludesTeam(result, awayTeam)).slice(0, 30),
  }
}

function drawRowsForRound(rows: Draw2026Row[], round: string): Draw2026Row[] {
  const roundNumber = roundSort(round)
  if (!roundNumber) return []
  return rows.filter((row) => row.round === roundNumber)
}

function drawMatchId(row: Draw2026Row): string {
  return `draw-2026-${row.round}-${canonicalTeamKey(row.home)}-${canonicalTeamKey(row.away)}`
}

function matchFromDrawRow(row: Draw2026Row): LineupMatch {
  const matchDate = row.kickoff.slice(0, 10)
  return {
    matchId: drawMatchId(row),
    matchDate,
    kickoffUtc: row.kickoff || null,
    round: `Round ${row.round}`,
    venue: null,
    match: `${row.home} vs ${row.away}`,
    matchUrl: row.matchCentreUrl || null,
    homeTeam: emptyTeam(row.home, "Home"),
    awayTeam: emptyTeam(row.away, "Away"),
    homeScore: null,
    awayScore: null,
  }
}

function addRoundOption(options: Map<string, LineupRoundOption>, round: string, roundNumber: number, matchDate: string) {
  if (!round || !matchDate) return
  const existing = options.get(round)
  options.set(
    round,
    existing
      ? {
          ...existing,
          startDate: matchDate < existing.startDate ? matchDate : existing.startDate,
          endDate: matchDate > existing.endDate ? matchDate : existing.endDate,
        }
      : {
          value: round,
          label: round,
          roundNumber,
          startDate: matchDate,
          endDate: matchDate,
        }
  )
}

function addYearOption(options: Map<number, LineupYearOption>, matchDate: string) {
  const year = Number(matchDate.slice(0, 4))
  if (!Number.isFinite(year)) return
  options.set(year, { value: String(year), label: String(year), year })
}

function getBrisbaneWeekdayIndex(): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
  }).format(new Date())
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday as "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"] ?? 0
}

function addDaysToBrisbaneDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00+10:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function getLineupWindowStartInBrisbane(): string {
  const today = getTodayInBrisbane()
  const weekday = getBrisbaneWeekdayIndex()
  const daysSinceTuesday = weekday >= 2 ? weekday - 2 : weekday + 5
  return addDaysToBrisbaneDateKey(today, -daysSinceTuesday)
}

function nominalSide(number: number | null): LineupSide {
  if (number === 5 || number === 4 || number === 11 || number === 6) return "left"
  if (number === 2 || number === 3 || number === 12 || number === 7) return "right"
  if (number === 9 || number === 1) return "spine"
  if (number === 8 || number === 10 || number === 13) return "middle"
  return "unknown"
}

function overrideKey(matchId: string, team: string, playerId: number | null, number: number | null): string[] {
  const keys = [`${matchId}|${team.toLowerCase()}|player:${playerId ?? ""}`]
  if (number != null) keys.push(`${matchId}|${team.toLowerCase()}|number:${number}`)
  return keys
}

function projectionOverrideKey(matchId: string, playerId: number | null): string {
  return `${matchId}|${playerId ?? ""}`
}

async function fetchAllLineupRows(fromDate: string, includeFantasyProjections: boolean, competition: LineupCompetition): Promise<RawRow[]> {
  const supabase = createServerSupabaseClient("nrl")
  const table = LINEUP_COMPETITION_TABLES[competition].lineups
  const rows: RawRow[] = []
  let start = 0
  const selectColumns = competition === "origin"
    ? "*"
    : includeFantasyProjections
    ? [...LINEUP_SELECT_BASE, "model_projection"].join(",")
    : LINEUP_SELECT_BASE.join(",")

  while (true) {
    const end = start + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from(table)
      .select(selectColumns)
      .gte("match_date", fromDate)
      .order("match_date", { ascending: true })
      .order("kickoff_utc", { ascending: true })
      .order("match_id", { ascending: true })
      .order("team_type", { ascending: true })
      .order("number", { ascending: true })
      .range(start, end)

    if (error) throw new Error(`Supabase fetch nrl.${table}: ${error.message}`)
    const page = (data ?? []) as unknown as RawRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    start += PAGE_SIZE
  }

  return rows
}

async function fetchLineupRowsForRound(round: string, year: number, includeFantasyProjections: boolean, competition: LineupCompetition): Promise<RawRow[]> {
  const supabase = createServerSupabaseClient("nrl")
  const table = LINEUP_COMPETITION_TABLES[competition].lineups
  const rows: RawRow[] = []
  const selectColumns = competition === "origin"
    ? "*"
    : includeFantasyProjections
    ? [...LINEUP_SELECT_BASE, "model_projection"].join(",")
    : LINEUP_SELECT_BASE.join(",")
  let start = 0

  while (true) {
    const end = start + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from(table)
      .select(selectColumns)
      .eq("round", round)
      .gte("match_date", `${year}-01-01`)
      .lt("match_date", `${year + 1}-01-01`)
      .order("match_date", { ascending: true })
      .order("kickoff_utc", { ascending: true })
      .order("match_id", { ascending: true })
      .order("team_type", { ascending: true })
      .order("number", { ascending: true })
      .range(start, end)

    if (error) throw new Error(`Supabase fetch nrl.${table} round ${round}: ${error.message}`)
    const page = (data ?? []) as unknown as RawRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    start += PAGE_SIZE
  }

  return rows
}

async function fetchSideOverrides(): Promise<Map<string, LineupSide>> {
  const supabase = createServerSupabaseClient("nrl")
  const { data, error } = await supabase.from("lineup_side_overrides").select("*")
  if (error || !data) return new Map()

  const overrides = new Map<string, LineupSide>()
  for (const row of data as unknown as RawRow[]) {
    const matchId = text(row.match_id)
    const team = text(row.team)
    const playerId = numberOrNull(row.player_id)
    const number = numberOrNull(row.number ?? row.jersey_number)
    const side = normaliseSide(row.side ?? row.lineup_side ?? row.player_side)
    if (!matchId || !team || !side) continue
    for (const key of overrideKey(matchId, team, playerId, number)) {
      overrides.set(key, side)
    }
  }

  return overrides
}

async function fetchProjectionOverrides(): Promise<Map<string, number>> {
  const supabase = createServerSupabaseClient("nrl")
  const { data, error } = await supabase
    .from("fantasy_projection_overrides")
    .select("match_id, player_id, projection_override_points")
  if (error || !data) return new Map()

  const overrides = new Map<string, number>()
  for (const row of data as unknown as RawRow[]) {
    const matchId = text(row.match_id)
    const playerId = numberOrNull(row.player_id)
    const delta = numberOrNull(row.projection_override_points)
    if (!matchId || playerId == null || delta == null) continue
    overrides.set(projectionOverrideKey(matchId, playerId), delta)
  }
  return overrides
}

function buildPlayer(
  row: RawRow,
  overrides: Map<string, LineupSide>,
  projectionOverrides: Map<string, number>,
  includeFantasyProjection: boolean,
): LineupPlayer {
  const matchId = text(row.match_id)
  const team = text(row.team)
  const number = numberOrNull(row.number)
  const playerId = numberOrNull(row.player_id)
  const isOnField = booleanValue(row.is_on_field)
  const modelProjection = numberOrNull(row.model_projection)
  const projectionDelta = projectionOverrides.get(projectionOverrideKey(matchId, playerId)) ?? 0
  const override = overrideKey(matchId, team, playerId, number)
    .map((key) => overrides.get(key))
    .find((side): side is LineupSide => Boolean(side))
  const side = override ?? nominalSide(number)

  return {
    matchId,
    team,
    teamName: text(row.team_name) || team,
    teamId: numberOrNull(row.team_id),
    teamType: text(row.team_type),
    number,
    position: text(row.position),
    player: text(row.player),
    playerId,
    isCaptain: booleanValue(row.is_captain),
    isOnField,
    headImage: nullableText(row.head_image),
    bodyImage: nullableText(row.body_image),
    fantasyProjection: includeFantasyProjection
      ? modelProjection == null ? null : modelProjection + projectionDelta
      : null,
    side,
    sideSource: override ? "override" : side === "unknown" ? "unknown" : "nominal",
  }
}

function teamFromPlayers(players: LineupPlayer[], teamType: string): LineupTeam | null {
  if (players.length === 0) return null
  return {
    team: players[0].team,
    teamName: players[0].teamName,
    teamId: players[0].teamId,
    teamType,
    players: [...players].sort((a, b) => (a.number ?? 99) - (b.number ?? 99)),
  }
}

function teamMatchesName(team: string, name: string | undefined): boolean {
  return Boolean(name && canonicalTeamKey(team) === canonicalTeamKey(name))
}

function emptyTeam(team: string, teamType: "Home" | "Away"): LineupTeam {
  return {
    team,
    teamName: team,
    teamId: null,
    teamType,
    players: [],
  }
}

function buildMatchesFromLineupRows(
  rows: RawRow[],
  overrides: Map<string, LineupSide>,
  projectionOverrides: Map<string, number>,
  includeFantasyProjections: boolean,
): LineupMatch[] {
  const matches = new Map<string, { base: RawRow; players: LineupPlayer[] }>()
  for (const row of rows) {
    const matchId = text(row.match_id)
    if (!matchId) continue
    const group = matches.get(matchId) ?? { base: row, players: [] }
    group.players.push(buildPlayer(row, overrides, projectionOverrides, includeFantasyProjections))
    matches.set(matchId, group)
  }

  return [...matches.values()].map(({ base, players }) => {
    const [homeName, awayName] = text(base.match).split(/\s+vs\s+/i).map((part) => part.trim())
    const fallbackTeams = [...new Map(players.map((player) => [canonicalTeamKey(player.team), player.team])).values()]
    const resolvedHome = homeName || fallbackTeams[0]
    const resolvedAway = awayName || fallbackTeams.find((team) => !teamMatchesName(team, resolvedHome))
    const homePlayers = players.filter((player) =>
      player.teamType.toLowerCase() === "home" ||
      (!player.teamType && teamMatchesName(player.team, resolvedHome))
    )
    const awayPlayers = players.filter((player) =>
      player.teamType.toLowerCase() === "away" ||
      (!player.teamType && teamMatchesName(player.team, resolvedAway))
    )
    return {
      matchId: text(base.match_id),
      matchDate: text(base.match_date),
      kickoffUtc: nullableText(base.kickoff_utc),
      round: text(base.round),
      venue: nullableText(base.venue),
      match: text(base.match),
      matchUrl: nullableText(base.match_url),
      homeTeam: teamFromPlayers(homePlayers, "Home"),
      awayTeam: teamFromPlayers(awayPlayers, "Away"),
    }
  })
}

function livePlayerKey(playerId: number | null, team: string | null, player: string | null): string | null {
  if (playerId != null) return String(playerId)
  const teamKey = normaliseKey(team)
  const playerKey = normaliseKey(player)
  return teamKey && playerKey ? `${teamKey}|${playerKey}` : null
}

export async function fetchUpcomingLineups(options: FetchUpcomingLineupsOptions = {}): Promise<LineupMatch[]> {
  try {
    const fromDate = getLineupWindowStartInBrisbane()
    const competition = options.competition ?? "nrl"
    const includeFantasyProjections = options.includeFantasyProjections === true
    const [rows, overrides, projectionOverrides] = await Promise.all([
      fetchAllLineupRows(fromDate, includeFantasyProjections, competition),
      fetchSideOverrides().catch(() => new Map<string, LineupSide>()),
      includeFantasyProjections
        ? fetchProjectionOverrides().catch(() => new Map<string, number>())
        : Promise.resolve(new Map<string, number>()),
    ])

    return buildMatchesFromLineupRows(rows, overrides, projectionOverrides, includeFantasyProjections)
  } catch (error) {
    console.warn("Unable to fetch upcoming lineups; using empty lineups list.", error)
    return []
  }
}

export async function fetchLineupRoundOptions(year = getCurrentYearInBrisbane(), competition: LineupCompetition = "nrl"): Promise<LineupRoundOption[]> {
  try {
    const supabase = createServerSupabaseClient("nrl")
    const tables = LINEUP_COMPETITION_TABLES[competition]
    const draw2026DataPromise = competition === "nrl" && year === 2026 ? loadDraw2026Data().catch(() => ({ rows: [], teamLogos: {} })) : Promise.resolve({ rows: [], teamLogos: {} })
    const [{ data, error }, { data: lineupData, error: lineupError }] = await Promise.all([
      withTimeout<{ data: RawRow[] | null; error: unknown | null }>(
        supabase
          .from(tables.matches)
          .select(competition === "origin" ? "*" : "round,round_number,match_date")
          .gte("match_date", `${year}-01-01`)
          .lt("match_date", `${year + 1}-01-01`)
          .order("match_date", { ascending: true }) as unknown as PromiseLike<{ data: RawRow[] | null; error: unknown | null }>,
        { data: null, error: null },
        LINEUPS_FETCH_TIMEOUT_MS,
        `Supabase fetch nrl.${tables.matches} round options for ${year}`
      ),
      withTimeout<{ data: RawRow[] | null; error: unknown | null }>(
        supabase
          .from(tables.lineups)
          .select("round,match_date")
          .gte("match_date", `${year}-01-01`)
          .lt("match_date", `${year + 1}-01-01`)
          .order("match_date", { ascending: true }) as unknown as PromiseLike<{ data: RawRow[] | null; error: unknown | null }>,
        { data: null, error: null },
        LINEUPS_FETCH_TIMEOUT_MS,
        `Supabase fetch nrl.${tables.lineups} round options for ${year}`
      ),
    ])
    const draw2026Data = await draw2026DataPromise

    if (error) console.warn(`Unable to fetch nrl.${tables.matches} round options for ${year}; using local draw fallback where available.`, error)
    if (lineupError) console.warn(`Unable to fetch nrl.${tables.lineups} round options for ${year}.`, lineupError)

    const options = new Map<string, LineupRoundOption>()
    for (const row of [...((data ?? []) as unknown as RawRow[]), ...((lineupData ?? []) as unknown as RawRow[])]) {
      const round = text(row.round)
      const matchDate = text(row.match_date).slice(0, 10)
      if (!round || !matchDate) continue
      const roundNumber = numberOrNull(row.round_number) ?? roundSort(round)
      addRoundOption(options, round, roundNumber, matchDate)
    }

    for (const row of draw2026Data.rows) {
      addRoundOption(options, `Round ${row.round}`, row.round, row.kickoff.slice(0, 10))
    }

    return [...options.values()].sort((a, b) => a.roundNumber - b.roundNumber || a.label.localeCompare(b.label))
  } catch (error) {
    console.warn("Unable to fetch lineup round options.", error)
    return []
  }
}

export async function fetchLineupYearOptions(competition: LineupCompetition = "nrl"): Promise<LineupYearOption[]> {
  try {
    const supabase = createServerSupabaseClient("nrl")
    const tables = LINEUP_COMPETITION_TABLES[competition]
    const [{ data, error }, { data: lineupData, error: lineupError }] = await Promise.all([
      withTimeout<{ data: RawRow[] | null; error: unknown | null }>(
        supabase
          .from(tables.matches)
          .select("match_date")
          .order("match_date", { ascending: false })
          .limit(2000) as unknown as PromiseLike<{ data: RawRow[] | null; error: unknown | null }>,
        { data: null, error: null },
        LINEUPS_FETCH_TIMEOUT_MS,
        `Supabase fetch nrl.${tables.matches} year options`
      ),
      withTimeout<{ data: RawRow[] | null; error: unknown | null }>(
        supabase
          .from(tables.lineups)
          .select("match_date")
          .order("match_date", { ascending: false })
          .limit(2000) as unknown as PromiseLike<{ data: RawRow[] | null; error: unknown | null }>,
        { data: null, error: null },
        LINEUPS_FETCH_TIMEOUT_MS,
        `Supabase fetch nrl.${tables.lineups} year options`
      ),
    ])

    if (error) console.warn(`Unable to fetch nrl.${tables.matches} year options.`, error)
    if (lineupError) console.warn(`Unable to fetch nrl.${tables.lineups} year options.`, lineupError)

    const options = new Map<number, LineupYearOption>()
    for (const row of [...((data ?? []) as unknown as RawRow[]), ...((lineupData ?? []) as unknown as RawRow[])]) {
      addYearOption(options, text(row.match_date))
    }
    if (competition === "nrl") addYearOption(options, `${getCurrentYearInBrisbane()}-01-01`)
    return [...options.values()].sort((a, b) => b.year - a.year)
  } catch (error) {
    console.warn("Unable to fetch lineup year options.", error)
    return []
  }
}

function teamStatsFromMatchRow(row: RawRow, fantasyPoints: number | null): LineupTeamMatchStats {
  return {
    team: text(row.team),
    score: numberOrNull(row.score),
    possessionPct: numberOrNull(row.possession_pct),
    completionRate: numberOrNull(row.completion_rate),
    fantasyPoints,
    tries: numberOrNull(row.tries),
    allRunMetres: numberOrNull(row.all_run_metres),
    postContactMetres: numberOrNull(row.post_contact_metres),
    lineBreaks: numberOrNull(row.line_breaks),
    tackleBreaks: numberOrNull(row.tackle_breaks),
    tacklesMade: numberOrNull(row.tackles_made),
    missedTackles: numberOrNull(row.missed_tackles),
    errors: numberOrNull(row.errors),
    offloads: numberOrNull(row.offloads),
  }
}

function recentResultFromRow(row: RawRow): LineupRecentResult | null {
  const matchDate = text(row.match_date)
  const team = text(row.team)
  const opponentTeam = text(row.opponent_team)
  const score = numberOrNull(row.score)
  const opponentScore = numberOrNull(row.opponent_score)
  if (!matchDate || !team || !opponentTeam || score == null || opponentScore == null) return null
  const isHome = booleanValue(row.is_home)
  const homeTeam = isHome ? team : opponentTeam
  const awayTeam = isHome ? opponentTeam : team
  const homeScore = isHome ? score : opponentScore
  const awayScore = isHome ? opponentScore : score
  return {
    matchDate,
    round: nullableText(row.round),
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
  }
}

function recentResultKey(result: LineupRecentResult): string {
  const teams = [canonicalTeamKey(result.homeTeam), canonicalTeamKey(result.awayTeam)].sort()
  return [result.matchDate.slice(0, 10), ...teams].join("|")
}

async function fetchRecentMatchResults(year: number, competition: LineupCompetition): Promise<LineupRecentResult[]> {
  try {
    const supabase = createServerSupabaseClient("nrl")
    const table = LINEUP_COMPETITION_TABLES[competition].matches
    const rows: RawRow[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(table)
        .select("match_date,round,team,opponent_team,score,opponent_score,is_home")
        .lt("match_date", `${year + 1}-01-01`)
        .not("score", "is", null)
        .not("opponent_score", "is", null)
        .order("match_date", { ascending: false })
        .range(from, from + PAGE_SIZE - 1)

      if (error || !data) return []
      rows.push(...((data as unknown as RawRow[]) ?? []))
      if (data.length < PAGE_SIZE) break
    }

    const results = new Map<string, LineupRecentResult>()
    for (const row of rows) {
      const result = recentResultFromRow(row)
      if (!result) continue
      results.set(recentResultKey(result), result)
    }
    return [...results.values()]
  } catch {
    return []
  }
}

interface HistoricalRoundPlayerStats {
  fantasyTotals: Map<string, number>
  playerStatsByMatchKey: Map<string, Record<string, LineupLivePlayerStats>>
}

async function fetchHistoricalPlayerStatsForRound(round: string, year: number, competition: LineupCompetition): Promise<HistoricalRoundPlayerStats> {
  const supabase = createServerSupabaseClient("nrl")
  const table = LINEUP_COMPETITION_TABLES[competition].playerStats
  const { data, error } = await supabase
    .from(table)
    .select(
      competition === "origin"
        ? "*"
        : [
        "match_date",
        "match",
        "round",
        "team",
        "player",
        "number",
        "position",
        "mins_played",
        "points",
        "tries",
        "try_assists",
        "line_breaks",
        "line_break_assists",
        "tackle_breaks",
        "all_runs",
        "all_run_metres",
        "post_contact_metres",
        "tackles_made",
        "missed_tackles",
        "ineffective_tackles",
        "offloads",
        "errors",
        "penalties",
        "kicks",
        "kicking_metres",
        "receipts",
        "passes",
        "total_points",
      ].join(",")
    )
    .eq("round", round)
    .gte("match_date", `${year}-01-01`)
    .lt("match_date", `${year + 1}-01-01`)

  const empty = { fantasyTotals: new Map<string, number>(), playerStatsByMatchKey: new Map<string, Record<string, LineupLivePlayerStats>>() }
  if (error || !data) return empty

  const totals = new Map<string, number>()
  const playerStatsByMatchKey = new Map<string, Record<string, LineupLivePlayerStats>>()
  for (const row of data as unknown as RawRow[]) {
    const matchDate = text(row.match_date)
    const matchName = text(row.match)
    const [homeTeam, awayTeam] = matchName.split(/\s+vs\s+/i).map((part) => part.trim())
    const team = text(row.team)
    const player = text(row.player)
    const points = numberOrNull(row.total_points)
    if (!matchDate || !homeTeam || !awayTeam || !team || !player) continue

    const matchKey = matchMergeKey(matchDate, homeTeam, awayTeam)
    if (points != null) {
      const totalKey = `${matchKey}|${normaliseKey(team)}`
      totals.set(totalKey, (totals.get(totalKey) ?? 0) + points)
    }

    const bucket = playerStatsByMatchKey.get(matchKey) ?? {}
    const stats: LineupLivePlayerStats = {
      matchId: matchKey,
      teamId: null,
      team,
      playerId: null,
      player,
      number: numberOrNull(row.number),
      position: nullableText(row.position),
      stats: row,
      minutesPlayed: numberOrNull(row.mins_played),
      fantasyPointsTotal: points,
      points: numberOrNull(row.points),
      tries: numberOrNull(row.tries),
      tryAssists: numberOrNull(row.try_assists),
      lineBreaks: numberOrNull(row.line_breaks),
      lineBreakAssists: numberOrNull(row.line_break_assists),
      tackleBreaks: numberOrNull(row.tackle_breaks),
      allRuns: numberOrNull(row.all_runs),
      allRunMetres: numberOrNull(row.all_run_metres),
      postContactMetres: numberOrNull(row.post_contact_metres),
      tacklesMade: numberOrNull(row.tackles_made),
      missedTackles: numberOrNull(row.missed_tackles),
      ineffectiveTackles: numberOrNull(row.ineffective_tackles),
      offloads: numberOrNull(row.offloads),
      errors: numberOrNull(row.errors),
      penalties: numberOrNull(row.penalties),
      kicks: numberOrNull(row.kicks),
      kickMetres: numberOrNull(row.kicking_metres),
      receipts: numberOrNull(row.receipts),
      passes: numberOrNull(row.passes),
      updatedAt: null,
    }
    const playerKey = livePlayerKey(null, team, player)
    if (playerKey) bucket[playerKey] = stats
    playerStatsByMatchKey.set(matchKey, bucket)
  }
  return { fantasyTotals: totals, playerStatsByMatchKey }
}

function historicalTryEvents(matchId: string, team: string, summary: string | null | undefined, prefix: string): LineupLiveScoringEvent[] {
  return String(summary ?? "")
    .split(/\n+/)
    .map((line, index): LineupLiveScoringEvent | null => {
      const match = line.trim().match(/^(.+?)\s+(\d+)'$/)
      if (!match) return null
      const player = match[1]?.trim()
      const minute = numberOrNull(match[2])
      if (!player || minute == null) return null
      return {
        matchId,
        eventKey: `${matchId}|${prefix}|try|${index}|${player}|${minute}`,
        timelineIndex: minute,
        scoringType: "try",
        teamId: null,
        team,
        playerId: null,
        player,
        gameSeconds: minute * 60,
        matchMinute: minute,
        homeScore: null,
        awayScore: null,
      }
    })
    .filter((event): event is LineupLiveScoringEvent => Boolean(event))
}

export async function fetchLineupsForRound({
  round,
  year = getCurrentYearInBrisbane(),
  includeFantasyProjections = false,
  competition = "nrl",
}: {
  round: string
  year?: number
  includeFantasyProjections?: boolean
  competition?: LineupCompetition
}): Promise<LineupRoundMatchesResult> {
  try {
    const supabase = createServerSupabaseClient("nrl")
    const table = LINEUP_COMPETITION_TABLES[competition].matches
    const [{ data, error }, lineupRows, overrides, projectionOverrides, historicalPlayerStats, recentResults, draw2026Data] = await Promise.all([
      withTimeout<{ data: RawRow[] | null; error: unknown | null }>(
        supabase
        .from(table)
        .select(
          competition === "origin"
            ? "*"
            : [
            "url",
            "match_date",
            "round",
            "round_number",
            "team",
            "opponent_team",
            "is_home",
            "score",
            "opponent_score",
            "tries_summary",
            "opponent_tries_summary",
            "possession_pct",
            "opponent_possession_pct",
            "completion_rate",
            "opponent_completion_rate",
            "tries",
            "opponent_tries",
            "all_run_metres",
            "opponent_all_run_metres",
            "post_contact_metres",
            "opponent_post_contact_metres",
            "line_breaks",
            "opponent_line_breaks",
            "tackle_breaks",
            "opponent_tackle_breaks",
            "tackles_made",
            "opponent_tackles_made",
            "missed_tackles",
            "opponent_missed_tackles",
            "errors",
            "opponent_errors",
            "offloads",
            "opponent_offloads",
          ].join(",")
        )
        .eq("round", round)
        .gte("match_date", `${year}-01-01`)
        .lt("match_date", `${year + 1}-01-01`)
        .order("match_date", { ascending: true }) as unknown as PromiseLike<{ data: RawRow[] | null; error: unknown | null }>,
        { data: null, error: null },
        LINEUPS_FETCH_TIMEOUT_MS,
        `Supabase fetch nrl.${table} round ${round}`
      ),
      withTimeout(fetchLineupRowsForRound(round, year, includeFantasyProjections, competition), [], LINEUPS_FETCH_TIMEOUT_MS, `Supabase fetch nrl.${LINEUP_COMPETITION_TABLES[competition].lineups} round ${round}`),
      withTimeout(fetchSideOverrides(), new Map<string, LineupSide>(), LINEUPS_FETCH_TIMEOUT_MS, "Supabase fetch lineup side overrides"),
      includeFantasyProjections
        ? withTimeout(fetchProjectionOverrides(), new Map<string, number>(), LINEUPS_FETCH_TIMEOUT_MS, "Supabase fetch lineup projection overrides")
        : Promise.resolve(new Map<string, number>()),
      withTimeout(
        fetchHistoricalPlayerStatsForRound(round, year, competition),
        {
          fantasyTotals: new Map<string, number>(),
          playerStatsByMatchKey: new Map<string, Record<string, LineupLivePlayerStats>>(),
        },
        LINEUPS_FETCH_TIMEOUT_MS,
        `Supabase fetch historical player stats for ${round}`
      ),
      withTimeout(fetchRecentMatchResults(year, competition), [], LINEUPS_FETCH_TIMEOUT_MS, `Supabase fetch recent match results for ${year}`),
      competition === "nrl" && year === 2026 ? loadDraw2026Data().catch(() => ({ rows: [], teamLogos: {} })) : Promise.resolve({ rows: [], teamLogos: {} }),
    ])

    if (error) console.warn(`Unable to fetch nrl.${table} round ${round}; using lineup/draw fallback where available.`, error)

    const lineupMatches = buildMatchesFromLineupRows(lineupRows, overrides, projectionOverrides, includeFantasyProjections)
    const lineupsByKey = new Map<string, LineupMatch>()
    for (const match of lineupMatches) {
      const home = match.homeTeam?.team ?? match.match.split(/\s+vs\s+/i)[0]?.trim()
      const away = match.awayTeam?.team ?? match.match.split(/\s+vs\s+/i)[1]?.trim()
      if (!home || !away) continue
      lineupsByKey.set(matchMergeKey(match.matchDate, home, away), match)
    }

    const matches: LineupMatch[] = []
    const statsById: Record<string, LineupMatchStats> = {}
    const seenKeys = new Set<string>()

    for (const row of (data ?? []) as unknown as RawRow[]) {
      if (!booleanValue(row.is_home)) continue
      const matchDate = text(row.match_date)
      const homeTeam = text(row.team)
      const awayTeam = text(row.opponent_team)
      if (!matchDate || !homeTeam || !awayTeam) continue

      const key = matchMergeKey(matchDate, homeTeam, awayTeam)
      const lineupMatch = lineupsByKey.get(key)
      const matchId = lineupMatch?.matchId ?? key
      const homeFantasy = historicalPlayerStats.fantasyTotals.get(`${key}|${normaliseKey(homeTeam)}`) ?? null
      const awayFantasy = historicalPlayerStats.fantasyTotals.get(`${key}|${normaliseKey(awayTeam)}`) ?? null

      matches.push({
        matchId,
        matchDate,
        kickoffUtc: lineupMatch?.kickoffUtc ?? null,
        round: text(row.round) || round,
        venue: lineupMatch?.venue ?? null,
        match: `${homeTeam} vs ${awayTeam}`,
        matchUrl: nullableText(row.url) ?? lineupMatch?.matchUrl ?? null,
        homeTeam: lineupMatch?.homeTeam ?? emptyTeam(homeTeam, "Home"),
        awayTeam: lineupMatch?.awayTeam ?? emptyTeam(awayTeam, "Away"),
        homeScore: numberOrNull(row.score),
        awayScore: numberOrNull(row.opponent_score),
      })

      statsById[matchId] = {
        matchId,
        homeTeam,
        awayTeam,
        scoringEvents: [
          ...historicalTryEvents(matchId, homeTeam, nullableText(row.tries_summary), "home"),
          ...historicalTryEvents(matchId, awayTeam, nullableText(row.opponent_tries_summary), "away"),
        ].sort((a, b) => (a.matchMinute ?? 9999) - (b.matchMinute ?? 9999)),
        playerStats: historicalPlayerStats.playerStatsByMatchKey.get(key) ?? {},
        home: teamStatsFromMatchRow(row, homeFantasy),
        away: {
          ...teamStatsFromMatchRow(row, awayFantasy),
          team: awayTeam,
          score: numberOrNull(row.opponent_score),
          possessionPct: numberOrNull(row.opponent_possession_pct),
          completionRate: numberOrNull(row.opponent_completion_rate),
          fantasyPoints: awayFantasy,
          tries: numberOrNull(row.opponent_tries),
          allRunMetres: numberOrNull(row.opponent_all_run_metres),
          postContactMetres: numberOrNull(row.opponent_post_contact_metres),
          lineBreaks: numberOrNull(row.opponent_line_breaks),
          tackleBreaks: numberOrNull(row.opponent_tackle_breaks),
          tacklesMade: numberOrNull(row.opponent_tackles_made),
          missedTackles: numberOrNull(row.opponent_missed_tackles),
          errors: numberOrNull(row.opponent_errors),
          offloads: numberOrNull(row.opponent_offloads),
        },
      }
      seenKeys.add(key)
    }

    for (const lineupMatch of lineupMatches) {
      const home = lineupMatch.homeTeam?.team ?? lineupMatch.match.split(/\s+vs\s+/i)[0]?.trim()
      const away = lineupMatch.awayTeam?.team ?? lineupMatch.match.split(/\s+vs\s+/i)[1]?.trim()
      if (!home || !away) continue
      const key = matchMergeKey(lineupMatch.matchDate, home, away)
      if (!seenKeys.has(key)) {
        matches.push(lineupMatch)
        seenKeys.add(key)
      }
    }

    for (const drawRow of drawRowsForRound(draw2026Data.rows, round)) {
      const key = matchMergeKey(drawRow.kickoff, drawRow.home, drawRow.away)
      if (!seenKeys.has(key)) {
        matches.push(matchFromDrawRow(drawRow))
        seenKeys.add(key)
      }
    }

    matches.sort((a, b) => a.matchDate.localeCompare(b.matchDate) || (a.kickoffUtc ?? "").localeCompare(b.kickoffUtc ?? ""))
    return { matches: matches.map((match) => addRecentResults(match, recentResults)), matchStats: statsById }
  } catch (error) {
    console.warn(`Unable to fetch lineups for ${round}; using empty result.`, error)
    return { matches: [], matchStats: {} }
  }
}

export async function fetchUpcomingTryscorerOdds(): Promise<Record<string, LineupTryscorerOdds>> {
  try {
    const today = getTodayInBrisbane()
    const supabase = createServerSupabaseClient("public")
    const { data, error } = await supabase
      .from("NRL Tryscorers")
      .select("*")
      .gte("Date", today)
      .eq("Value", 1)

    if (error || !data) return {}

    const odds = new Map<string, LineupTryscorerOdds>()
    for (const row of data as unknown as RawRow[]) {
      const player = text(row.Result)
      const bestPrice = numberOrNull(row["Best Price"])
      if (!player || bestPrice == null) continue

      const key = normaliseKey(player)
      const current = odds.get(key)
      if (current?.bestPrice != null && current.bestPrice >= bestPrice) continue

      odds.set(key, {
        player,
        bestBookie: nullableText(row["Best Bookie"]),
        bestPrice,
      })
    }

    return Object.fromEntries(odds)
  } catch (error) {
    console.warn("Unable to fetch upcoming tryscorer odds; using empty odds map.", error)
    return {}
  }
}

export async function fetchUpcomingSportsbetH2HOdds(): Promise<Record<string, LineupSportsbetOdds>> {
  try {
    const today = getTodayInBrisbane()
    const supabase = createServerSupabaseClient("public")
    const { data, error } = await supabase
      .from("NRL Odds")
      .select("*")
      .gte("Date", today)
      .order("Date", { ascending: true })

    if (error || !data) return {}

    const odds = new Map<string, LineupSportsbetOdds>()
    for (const row of data as unknown as RawRow[]) {
      const market = text(row.Market).toLowerCase()
      if (market && market !== "h2h") continue

      const team = text(row.Result)
      const price = numberOrNull(row.Sportsbet ?? row.SportsBet ?? row.sportsbet ?? row.Sportsbet_odds ?? row.sportsbet_odds)
      const matchDate = rowDateKey(row.Date)
      const match = text(row.Match)
      if (!team || price == null || price <= 1 || !matchDate) continue

      const entry = { team, matchDate, match, price }
      const teamKeys = teamAliases(team)
      const matchKey = normaliseKey(match)
      const keys = teamKeys.flatMap((teamKey) => [
        `${matchDate}|${matchKey}|${teamKey}`,
        `${matchDate}|${teamKey}`,
        teamKey,
      ])

      for (const key of keys) {
        if (key && !odds.has(key)) odds.set(key, entry)
      }
    }

    return Object.fromEntries(odds)
  } catch (error) {
    console.warn("Unable to fetch upcoming Sportsbet H2H odds; using empty odds map.", error)
    return {}
  }
}

export async function fetchCasualtyWardOuts(): Promise<Record<string, LineupCasualtyOut[]>> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) return {}

    const endpoint = new URL("/rest/v1/casualty_ward", supabaseUrl)
    endpoint.searchParams.set("select", "team,player,injury,return_date")
    endpoint.searchParams.set("competition_id", "eq.111")
    endpoint.searchParams.set("order", "team.asc,player.asc")

    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Accept-Profile": "nrl",
      },
    })
    if (!response.ok) return {}
    const data = (await response.json()) as RawRow[]

    const byTeam = new Map<string, LineupCasualtyOut[]>()
    for (const row of data) {
      const team = text(row.team)
      const player = text(row.player)
      const key = normaliseKey(team)
      if (!team || !player || !key) continue

      const outs = byTeam.get(key) ?? []
      outs.push({
        team,
        player,
        injury: nullableText(row.injury),
        returnDate: nullableText(row.return_date),
      })
      byTeam.set(key, outs)
    }

    return Object.fromEntries(byTeam)
  } catch (error) {
    console.warn("Unable to fetch casualty ward outs; using empty notable outs map.", error)
    return {}
  }
}

async function fetchLiveRowsViaRest(table: string, matchIds: string[]): Promise<RawRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey || matchIds.length === 0) return []

  const endpoint = new URL(`/rest/v1/${table}`, supabaseUrl)
  endpoint.searchParams.set("select", "*")
  endpoint.searchParams.set("match_id", `in.(${matchIds.join(",")})`)

  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Accept-Profile": "nrl",
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Supabase REST fetch nrl.${table}: ${response.status} ${body}`)
  }

  return (await response.json()) as RawRow[]
}

async function fetchLiveRows(table: string, matchIds: string[]): Promise<RawRow[]> {
  if (matchIds.length === 0) return []
  try {
    const supabase = createServerSupabaseClient("nrl")
    const { data, error } = await supabase.from(table).select("*").in("match_id", matchIds)
    if (error) throw new Error(`Supabase fetch nrl.${table}: ${error.message}`)
    const rows = (data ?? []) as unknown as RawRow[]
    if (rows.length > 0 || (table !== "live_match_state" && table !== "live_scoring_events")) return rows
  } catch (error) {
    console.warn(`Supabase client fetch failed for nrl.${table}; trying REST fallback.`, error)
  }

  return fetchLiveRowsViaRest(table, matchIds)
}

function emptyLiveMatch(): LineupLiveMatch {
  return {
    state: null,
    scoringEvents: [],
    playerStates: {},
    playerStats: {},
  }
}

function getLiveMatch(bucket: Map<string, LineupLiveMatch>, matchId: string): LineupLiveMatch {
  const existing = bucket.get(matchId)
  if (existing) return existing
  const created = emptyLiveMatch()
  bucket.set(matchId, created)
  return created
}

export async function fetchLiveLineupData(matchIds: string[]): Promise<Record<string, LineupLiveMatch>> {
  const uniqueMatchIds = [...new Set(matchIds.map((matchId) => matchId.trim()).filter(Boolean))]
  if (uniqueMatchIds.length === 0) return {}

  try {
    const [stateRows, scoringRows, playerStateRows, playerStatsRows] = await Promise.all([
      fetchLiveRows("live_match_state", uniqueMatchIds).catch((error) => {
        console.warn("Unable to fetch live match state.", error)
        return []
      }),
      fetchLiveRows("live_scoring_events", uniqueMatchIds).catch((error) => {
        console.warn("Unable to fetch live scoring events.", error)
        return []
      }),
      fetchLiveRows("live_player_state", uniqueMatchIds).catch((error) => {
        console.warn("Unable to fetch live player state.", error)
        return []
      }),
      fetchLiveRows("live_player_stats", uniqueMatchIds).catch((error) => {
        console.warn("Unable to fetch live player stats.", error)
        return []
      }),
    ])

    const liveMatches = new Map<string, LineupLiveMatch>()

    for (const row of stateRows) {
      const matchId = text(row.match_id)
      if (!matchId) continue
      getLiveMatch(liveMatches, matchId).state = {
        matchId,
        matchState: text(row.match_state),
        matchMode: nullableText(row.match_mode),
        gameSeconds: numberOrNull(row.game_seconds),
        liveSeconds: numberOrNull(row.live_seconds),
        homeTeamId: numberOrNull(row.home_team_id),
        homeTeam: nullableText(row.home_team),
        homeScore: numberOrNull(row.home_score),
        awayTeamId: numberOrNull(row.away_team_id),
        awayTeam: nullableText(row.away_team),
        awayScore: numberOrNull(row.away_score),
        updatedAt: nullableText(row.updated_at),
      }
    }

    for (const row of scoringRows) {
      const matchId = text(row.match_id)
      if (!matchId) continue
      const event: LineupLiveScoringEvent = {
        matchId,
        eventKey: text(row.event_key),
        timelineIndex: numberOrNull(row.timeline_index),
        scoringType: text(row.scoring_type),
        teamId: numberOrNull(row.team_id),
        team: nullableText(row.team),
        playerId: numberOrNull(row.player_id),
        player: nullableText(row.player),
        gameSeconds: numberOrNull(row.game_seconds),
        matchMinute: numberOrNull(row.match_minute),
        homeScore: numberOrNull(row.home_score),
        awayScore: numberOrNull(row.away_score),
      }
      const liveMatch = getLiveMatch(liveMatches, matchId)
      const dedupeKey = [
        event.scoringType,
        event.teamId ?? "",
        event.playerId ?? normaliseKey(event.player),
        event.matchMinute ?? "",
        event.homeScore ?? "",
        event.awayScore ?? "",
      ].join("|")
      if (!liveMatch.scoringEvents.some((existing) => [
        existing.scoringType,
        existing.teamId ?? "",
        existing.playerId ?? normaliseKey(existing.player),
        existing.matchMinute ?? "",
        existing.homeScore ?? "",
        existing.awayScore ?? "",
      ].join("|") === dedupeKey)) {
        liveMatch.scoringEvents.push(event)
      }
    }

    for (const row of playerStateRows) {
      const matchId = text(row.match_id)
      if (!matchId) continue
      const playerId = numberOrNull(row.player_id)
      const state: LineupLivePlayerState = {
        matchId,
        teamId: numberOrNull(row.team_id),
        team: nullableText(row.team),
        playerId,
        player: nullableText(row.player),
        number: numberOrNull(row.number),
        position: nullableText(row.position),
        isOnField: booleanValue(row.is_on_field),
        updatedAt: nullableText(row.updated_at),
      }
      const key = livePlayerKey(playerId, state.team, state.player)
      if (key) getLiveMatch(liveMatches, matchId).playerStates[key] = state
    }

    for (const row of playerStatsRows) {
      const matchId = text(row.match_id)
      if (!matchId) continue
      const playerId = numberOrNull(row.player_id)
      const stats: LineupLivePlayerStats = {
        matchId,
        teamId: numberOrNull(row.team_id),
        team: nullableText(row.team),
        playerId,
        player: nullableText(row.player),
        number: numberOrNull(row.number),
        position: nullableText(row.position),
        stats: recordValue(row.stats),
        minutesPlayed: numberOrNull(row.minutes_played),
        fantasyPointsTotal: numberOrNull(row.fantasy_points_total),
        points: numberOrNull(row.points),
        tries: numberOrNull(row.tries),
        tryAssists: numberOrNull(row.try_assists),
        lineBreaks: numberOrNull(row.line_breaks),
        lineBreakAssists: numberOrNull(row.line_break_assists),
        tackleBreaks: numberOrNull(row.tackle_breaks),
        allRuns: numberOrNull(row.all_runs),
        allRunMetres: numberOrNull(row.all_run_metres),
        postContactMetres: numberOrNull(row.post_contact_metres),
        tacklesMade: numberOrNull(row.tackles_made),
        missedTackles: numberOrNull(row.missed_tackles),
        ineffectiveTackles: numberOrNull(row.ineffective_tackles),
        offloads: numberOrNull(row.offloads),
        errors: numberOrNull(row.errors),
        penalties: numberOrNull(row.penalties),
        kicks: numberOrNull(row.kicks),
        kickMetres: numberOrNull(row.kick_metres),
        receipts: numberOrNull(row.receipts),
        passes: numberOrNull(row.passes),
        updatedAt: nullableText(row.updated_at),
      }
      const key = livePlayerKey(playerId, stats.team, stats.player)
      if (key) getLiveMatch(liveMatches, matchId).playerStats[key] = stats
    }

    for (const liveMatch of liveMatches.values()) {
      liveMatch.scoringEvents.sort(
        (a, b) => (a.timelineIndex ?? 9999) - (b.timelineIndex ?? 9999) || (a.gameSeconds ?? 0) - (b.gameSeconds ?? 0)
      )
    }

    return Object.fromEntries(liveMatches)
  } catch (error) {
    console.warn("Unable to fetch live lineup data; using empty live data map.", error)
    return {}
  }
}
