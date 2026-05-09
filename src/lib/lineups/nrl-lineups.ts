import { createServerSupabaseClient } from "@/lib/supabase/client"

export type LineupSide = "left" | "right" | "middle" | "spine" | "bench" | "unknown"

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
  if (typeof value === "string") return value.toLowerCase() === "true"
  return false
}

function recordValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
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

async function fetchAllLineupRows(fromDate: string, includeFantasyProjections: boolean): Promise<RawRow[]> {
  const supabase = createServerSupabaseClient("nrl")
  const rows: RawRow[] = []
  let start = 0
  const selectColumns = includeFantasyProjections
    ? [...LINEUP_SELECT_BASE, "fantasy_projection"].join(",")
    : LINEUP_SELECT_BASE.join(",")

  while (true) {
    const end = start + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from("lineups")
      .select(selectColumns)
      .gte("match_date", fromDate)
      .order("match_date", { ascending: true })
      .order("kickoff_utc", { ascending: true })
      .order("match_id", { ascending: true })
      .order("team_type", { ascending: true })
      .order("number", { ascending: true })
      .range(start, end)

    if (error) throw new Error(`Supabase fetch nrl.lineups: ${error.message}`)
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

function buildPlayer(row: RawRow, overrides: Map<string, LineupSide>, includeFantasyProjection: boolean): LineupPlayer {
  const matchId = text(row.match_id)
  const team = text(row.team)
  const number = numberOrNull(row.number)
  const playerId = numberOrNull(row.player_id)
  const isOnField = booleanValue(row.is_on_field)
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
    fantasyProjection: includeFantasyProjection ? numberOrNull(row.fantasy_projection) : null,
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

function livePlayerKey(playerId: number | null, team: string | null, player: string | null): string | null {
  if (playerId != null) return String(playerId)
  const teamKey = normaliseKey(team)
  const playerKey = normaliseKey(player)
  return teamKey && playerKey ? `${teamKey}|${playerKey}` : null
}

export async function fetchUpcomingLineups(options: FetchUpcomingLineupsOptions = {}): Promise<LineupMatch[]> {
  try {
    const fromDate = getLineupWindowStartInBrisbane()
    const includeFantasyProjections = options.includeFantasyProjections === true
    const [rows, overrides] = await Promise.all([
      fetchAllLineupRows(fromDate, includeFantasyProjections),
      fetchSideOverrides().catch(() => new Map<string, LineupSide>()),
    ])

    const matches = new Map<string, { base: RawRow; players: LineupPlayer[] }>()
    for (const row of rows) {
      const matchId = text(row.match_id)
      if (!matchId) continue
      const group = matches.get(matchId) ?? { base: row, players: [] }
      group.players.push(buildPlayer(row, overrides, includeFantasyProjections))
      matches.set(matchId, group)
    }

    return [...matches.values()].map(({ base, players }) => {
      const homePlayers = players.filter((player) => player.teamType.toLowerCase() === "home")
      const awayPlayers = players.filter((player) => player.teamType.toLowerCase() === "away")
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
  } catch (error) {
    console.warn("Unable to fetch upcoming lineups; using empty lineups list.", error)
    return []
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
