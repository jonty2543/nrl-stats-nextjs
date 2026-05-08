import { createServerSupabaseClient } from "@/lib/supabase/client"

export type LineupSide = "left" | "right" | "middle" | "spine" | "bench" | "unknown"

export interface LineupPlayer {
  matchId: string
  team: string
  teamName: string
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

export interface LineupCasualtyOut {
  team: string
  player: string
  injury: string | null
  returnDate: string | null
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
const LINEUP_EXPIRY_MS = 2 * 60 * 60 * 1000

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function nullableText(value: unknown): string | null {
  const parsed = text(value)
  return parsed || null
}

function parseUtcDate(value: string | null): Date | null {
  if (!value) return null
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value)
  const timestamp = Date.parse(hasTimezone ? value : `${value}Z`)
  return Number.isFinite(timestamp) ? new Date(timestamp) : null
}

function isLineupExpired(kickoffUtc: string | null, now = new Date()): boolean {
  const kickoff = parseUtcDate(kickoffUtc)
  if (!kickoff) return false
  return kickoff.getTime() + LINEUP_EXPIRY_MS <= now.getTime()
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

async function fetchAllLineupRows(today: string, includeFantasyProjections: boolean): Promise<RawRow[]> {
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
      .gte("match_date", today)
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
  for (const row of data as RawRow[]) {
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
    teamType,
    players: [...players].sort((a, b) => (a.number ?? 99) - (b.number ?? 99)),
  }
}

export async function fetchUpcomingLineups(options: FetchUpcomingLineupsOptions = {}): Promise<LineupMatch[]> {
  try {
    const today = getTodayInBrisbane()
    const includeFantasyProjections = options.includeFantasyProjections === true
    const [rows, overrides] = await Promise.all([
      fetchAllLineupRows(today, includeFantasyProjections),
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
    }).filter((match) => !isLineupExpired(match.kickoffUtc))
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
    for (const row of data as RawRow[]) {
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
