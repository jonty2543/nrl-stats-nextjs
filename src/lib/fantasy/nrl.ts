import { createServerSupabaseClient } from "@/lib/supabase/client";

export const FANTASY_POSITION_MAP: Record<number, string> = {
  1: "HOK",
  2: "MID",
  3: "EDG",
  4: "HLF",
  5: "CTR",
  6: "WFB",
}

export interface FantasyPlayerSnapshot {
  id: number
  firstName: string
  lastName: string
  name: string
  squadId: number | null
  cost: number | null
  status: string | null
  positions: number[]
  positionLabels: string[]
  positionLabel: string
  ownedBy: number | null
  selections: number | null
  avgPoints: number | null
  projectedAvg: number | null
  gamesPlayed: number | null
  totalPoints: number | null
  tog: number | null
  be: number | null
  pricedAt: number | null
  isBye: boolean
  locked: boolean
  priceHistory: Record<string, number>
  scoreHistory: Record<string, number>
}

export interface FantasyCoachPlayerSnapshot {
  id: number
  projectedScore: number | null
  projectedScores: Record<string, number>
  breakEven: number | null
  breakEvens: Record<string, number>
}

export interface FantasyCoachRoundMetrics {
  round: number | null
  projection: number | null
  breakEven: number | null
}

type FantasyMetricOffsetType = "projection" | "breakEven"

export interface FantasyOwnershipBaselinePoint {
  playerId: number
  name: string
  ownedBy: number | null
}

export interface FantasyOwnershipBaselineSnapshot {
  capturedAt: string
  snapshotWeekBrisbane: string
  points: FantasyOwnershipBaselinePoint[]
}

export interface CasualtyWardRecord {
  team: string | null
  player: string
  injury: string | null
  returnDate: string | null
  sourceUrl: string | null
  scrapedAt: string | null
}

interface FantasyPlayerRaw {
  id?: unknown
  first_name?: unknown
  last_name?: unknown
  squad_id?: unknown
  cost?: unknown
  status?: unknown
  positions?: unknown
  is_bye?: unknown
  locked?: unknown
  stats?: {
    owned_by?: unknown
    selections?: unknown
    avg_points?: unknown
    proj_avg?: unknown
    games_played?: unknown
    total_points?: unknown
    tog?: unknown
    be?: unknown
    break_even?: unknown
    breakeven?: unknown
    prices?: unknown
    scores?: unknown
  } | null
}

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function toInt(value: unknown): number | null {
  const n = toNum(value)
  return n === null ? null : Math.trunc(n)
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true"
  return false
}

function extractPriceHistory(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(input)) {
    const n = toInt(v)
    if (n !== null) out[k] = n
  }
  return out
}

function extractScoreHistory(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(input)) {
    const n = toNum(v)
    if (n !== null) out[k] = n
  }
  return out
}

function extractIntHistory(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(input)) {
    const n = toInt(v)
    if (n !== null) out[k] = n
  }
  return out
}

function getLatestPrice(cost: number | null, priceHistory: Record<string, number>): number | null {
  const entries = Object.entries(priceHistory)
    .map(([round, price]) => ({ round: Number.parseInt(round, 10), price }))
    .filter((row) => Number.isFinite(row.round))
    .sort((a, b) => b.round - a.round)

  if (entries.length > 0) return entries[0].price
  return cost
}

function getNextHistoryValue(history: Record<string, number>): number | null {
  const entries = Object.entries(history)
    .map(([round, value]) => ({ round: Number.parseInt(round, 10), value }))
    .filter((row) => Number.isFinite(row.round))
    .sort((a, b) => a.round - b.round)

  return entries[0]?.value ?? null
}

function normaliseOne(raw: FantasyPlayerRaw): FantasyPlayerSnapshot | null {
  const id = toInt(raw.id)
  if (id === null) return null

  const firstName = typeof raw.first_name === "string" ? raw.first_name.trim() : ""
  const lastName = typeof raw.last_name === "string" ? raw.last_name.trim() : ""
  const name = `${firstName} ${lastName}`.trim() || `Player ${id}`

  const positions = Array.isArray(raw.positions)
    ? raw.positions.map((value) => toInt(value)).filter((v): v is number => v !== null)
    : []
  const positionLabels = positions.map((code) => FANTASY_POSITION_MAP[code] ?? `POS ${code}`)
  const positionLabel = positionLabels.join("/") || "N/A"

  const priceHistory = extractPriceHistory(raw.stats?.prices)
  const scoreHistory = extractScoreHistory(raw.stats?.scores)
  const cost = toInt(raw.cost)
  const latestPrice = getLatestPrice(cost, priceHistory)
  const be =
    toInt(raw.stats?.be) ??
    toInt(raw.stats?.break_even) ??
    toInt(raw.stats?.breakeven)

  return {
    id,
    firstName,
    lastName,
    name,
    squadId: toInt(raw.squad_id),
    cost: latestPrice,
    status: typeof raw.status === "string" ? raw.status : null,
    positions,
    positionLabels,
    positionLabel,
    ownedBy: toNum(raw.stats?.owned_by),
    selections: toInt(raw.stats?.selections),
    avgPoints: toNum(raw.stats?.avg_points),
    projectedAvg: toNum(raw.stats?.proj_avg),
    gamesPlayed: toInt(raw.stats?.games_played),
    totalPoints: toInt(raw.stats?.total_points),
    tog: toNum(raw.stats?.tog),
    be,
    pricedAt: latestPrice !== null ? latestPrice / 12725 : null,
    isBye: toBool(raw.is_bye),
    locked: toBool(raw.locked),
    priceHistory,
    scoreHistory,
  }
}

export async function fetchFantasyPlayersSnapshot(): Promise<FantasyPlayerSnapshot[]> {
  try {
    const res = await fetch("https://fantasy.nrl.com/data/nrl/players.json", {
      next: { revalidate: 300 },
      headers: {
        accept: "application/json",
      },
    })

    if (!res.ok) {
      throw new Error(`Fantasy players fetch failed: ${res.status} ${res.statusText}`)
    }

    const raw = (await res.json()) as unknown
    if (!Array.isArray(raw)) return []

    return raw
      .map((row) => normaliseOne(row as FantasyPlayerRaw))
      .filter((row): row is FantasyPlayerSnapshot => row !== null)
      .sort((a, b) => {
        const ownA = a.ownedBy ?? -1
        const ownB = b.ownedBy ?? -1
        if (ownA !== ownB) return ownB - ownA
        return a.name.localeCompare(b.name)
      })
  } catch (error) {
    console.warn("Unable to fetch fantasy players snapshot; using empty list.", error)
    return []
  }
}

interface FantasyCoachPlayerRaw {
  proj_score?: unknown
  proj_scores?: unknown
  break_even?: unknown
  break_evens?: unknown
}

function normaliseCoachOne(id: string, raw: FantasyCoachPlayerRaw): FantasyCoachPlayerSnapshot | null {
  const parsedId = toInt(id)
  if (parsedId === null) return null
  const projectedScores = extractScoreHistory(raw.proj_scores)
  const breakEvens = extractIntHistory(raw.break_evens)

  return {
    id: parsedId,
    projectedScore: toNum(raw.proj_score) ?? getNextHistoryValue(projectedScores),
    projectedScores: {},
    breakEven: toInt(raw.break_even) ?? getNextHistoryValue(breakEvens),
    breakEvens: {},
  }
}

export async function fetchFantasyCoachPlayersSnapshot(): Promise<FantasyCoachPlayerSnapshot[]> {
  try {
    const res = await fetch("https://fantasy.nrl.com/data/nrl/coach/players.json", {
      next: { revalidate: 300 },
      headers: {
        accept: "application/json",
        "user-agent": "shortside/1.0",
      },
    })

    if (!res.ok) {
      throw new Error(`Fantasy coach players fetch failed: ${res.status} ${res.statusText}`)
    }

    const raw = (await res.json()) as unknown
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return []

    return Object.entries(raw as Record<string, FantasyCoachPlayerRaw>)
      .map(([id, row]) => normaliseCoachOne(id, row))
      .filter((row): row is FantasyCoachPlayerSnapshot => row !== null)
  } catch (error) {
    console.warn("Unable to fetch fantasy coach players snapshot; using empty list.", error)
    return []
  }
}

export function getFantasyCoachRoundMetrics(player: FantasyCoachPlayerSnapshot | null | undefined): FantasyCoachRoundMetrics {
  if (!player) {
    return { round: null, projection: null, breakEven: null }
  }

  const rounds = [...new Set([
    ...Object.keys(player.projectedScores ?? {}),
    ...Object.keys(player.breakEvens ?? {}),
  ])]
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  const round = rounds[0] ?? null

  return {
    round,
    projection: round != null
      ? (player.projectedScores[String(round)] ?? player.projectedScore ?? null)
      : (player.projectedScore ?? null),
    breakEven: round != null
      ? (player.breakEvens[String(round)] ?? player.breakEven ?? null)
      : (player.breakEven ?? null),
  }
}

function stableMetricOffset(playerId: number, round: number | null, metric: FantasyMetricOffsetType): number {
  const input = `${playerId}:${round ?? 0}:${metric}`
  let hash = 0

  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash * 31) + input.charCodeAt(index)) | 0
  }

  return (Math.abs(hash) % 7) - 3
}

function applyFantasyMetricOffset(
  value: number | null,
  playerId: number | null,
  round: number | null,
  metric: FantasyMetricOffsetType,
): number | null {
  if (value == null || playerId == null) return value
  return Math.round(value + stableMetricOffset(playerId, round, metric))
}

export function buildFantasyOwnershipDeltaByPlayerId(
  fantasyPlayers: FantasyPlayerSnapshot[],
  ownershipBaselineSnapshot: FantasyOwnershipBaselineSnapshot | null | undefined,
): Map<number, number | null> {
  const baselineByPlayerId = new Map<number, number | null>()
  for (const point of ownershipBaselineSnapshot?.points ?? []) {
    baselineByPlayerId.set(point.playerId, point.ownedBy)
  }

  const deltaByPlayerId = new Map<number, number | null>()
  for (const player of fantasyPlayers) {
    const baseline = baselineByPlayerId.get(player.id)
    deltaByPlayerId.set(
      player.id,
      baseline == null || player.ownedBy == null ? null : player.ownedBy - baseline,
    )
  }

  return deltaByPlayerId
}

export function getTopFantasyOwnershipRise(deltaByPlayerId: Map<number, number | null>): number | null {
  let topRise: number | null = null
  for (const delta of deltaByPlayerId.values()) {
    if (delta == null || delta <= 0) continue
    if (topRise == null || delta > topRise) topRise = delta
  }
  return topRise
}

export function applyFantasyProjectionOffset(
  value: number | null,
  weeklyDelta: number | null,
  topRise: number | null,
): number | null {
  void weeklyDelta
  void topRise
  return value
}

export function applyFantasyBreakEvenOffset(
  value: number | null,
  playerId: number | null,
  round: number | null,
): number | null {
  return applyFantasyMetricOffset(value, playerId, round, "breakEven")
}

interface FantasyOwnershipSnapshotRow {
  captured_at: string
  snapshot_week_brisbane: string
  snapshot_data: unknown
}

function normaliseOwnershipBaselinePoints(value: unknown): FantasyOwnershipBaselinePoint[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((row) => {
    if (typeof row !== "object" || row == null || Array.isArray(row)) return []
    const point = row as Record<string, unknown>
    const playerId = point.playerId
    const name = point.name
    const ownedByRaw = point.ownedBy
    if (typeof playerId !== "number" || !Number.isFinite(playerId) || typeof name !== "string") return []
    const ownedBy = typeof ownedByRaw === "number" && Number.isFinite(ownedByRaw) ? ownedByRaw : null
    return [{ playerId: Math.trunc(playerId), name, ownedBy }]
  })
}

export async function fetchLatestFantasyOwnershipBaselineSnapshot(): Promise<FantasyOwnershipBaselineSnapshot | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .schema("shortside")
    .from("fantasy_ownership_snapshots")
    .select("captured_at, snapshot_week_brisbane, snapshot_data")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("Unable to fetch fantasy ownership baseline snapshot.", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as FantasyOwnershipSnapshotRow;
  return {
    capturedAt: row.captured_at,
    snapshotWeekBrisbane: row.snapshot_week_brisbane,
    points: normaliseOwnershipBaselinePoints(row.snapshot_data),
  };
}

export async function fetchCasualtyWardSnapshot(): Promise<CasualtyWardRecord[]> {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .schema("nrl")
      .from("casualty_ward")
      .select("team, player, injury, return_date, source_url, scraped_at")
      .order("team", { ascending: true })
      .order("player", { ascending: true })

    if (error || !data) {
      if (error) console.warn("Unable to fetch casualty ward.", error.message)
      return []
    }

    return data
      .map((row) => {
        const player = typeof row.player === "string" ? row.player.trim() : ""
        if (!player) return null
        return {
          team: typeof row.team === "string" ? row.team : null,
          player,
          injury: typeof row.injury === "string" ? row.injury : null,
          returnDate: typeof row.return_date === "string" ? row.return_date : null,
          sourceUrl: typeof row.source_url === "string" ? row.source_url : null,
          scrapedAt: typeof row.scraped_at === "string" ? row.scraped_at : null,
        }
      })
      .filter((row): row is CasualtyWardRecord => row !== null)
  } catch (error) {
    console.warn("Unable to fetch casualty ward.", error)
    return []
  }
}

// ---------------------------------------------------------------------------
// Lineups-based fantasy projections
// ---------------------------------------------------------------------------

export interface LineupsPlayerRole {
  position: string | null
  team: string | null
  number: number | null
  isOnField: boolean
}

export type FantasyProjectionSource = "lineups" | "lineup_unaware" | "none"

export interface FantasyProjectionSigma {
  position: string
  fallbackPosition: string | null
  projection: string | null
  residualSigma: number | null
  normalLow95Delta: number | null
  normalHigh95Delta: number | null
}

export interface LineupsProjectionSnapshot {
  /** Parsed integer round number, e.g. 9. Null when lineups table is empty. */
  round: number | null
  source: FantasyProjectionSource
  lineupsAvailable: boolean
  /** Maps NRL player_id → model projection. */
  projectionByPlayerId: Map<number, number>
  /** Maps normalised player name → model projection fallback. */
  projectionByPlayerName: Map<string, number>
  /** Maps NRL player_id → named lineup role for the selected lineups round. */
  roleByPlayerId: Map<number, LineupsPlayerRole>
  /** Maps normalised player name → assumed pre-lineups role. */
  roleByPlayerName: Map<string, LineupsPlayerRole>
}

function emptyLineupsProjectionSnapshot(source: FantasyProjectionSource = "none"): LineupsProjectionSnapshot {
  return {
    round: null,
    source,
    lineupsAvailable: source === "lineups",
    projectionByPlayerId: new Map(),
    projectionByPlayerName: new Map(),
    roleByPlayerId: new Map(),
    roleByPlayerName: new Map(),
  }
}

export async function fetchFantasyProjectionSigmas(): Promise<FantasyProjectionSigma[]> {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .schema("nrl")
      .from("fantasy_projection_sigmas")
      .select("position, fallback_position, projection, residual_sigma, normal_low_95_delta, normal_high_95_delta")
      .eq("calibration_key", "final_post_opponent_position_v1")

    if (error || !data) return []

    return data
      .map((row) => {
        const position = typeof row.position === "string" ? row.position : null
        if (!position) return null

        return {
          position,
          fallbackPosition: typeof row.fallback_position === "string" ? row.fallback_position : null,
          projection: typeof row.projection === "string" ? row.projection : null,
          residualSigma: toFiniteProjectionNumber(row.residual_sigma),
          normalLow95Delta: toFiniteProjectionNumber(row.normal_low_95_delta),
          normalHigh95Delta: toFiniteProjectionNumber(row.normal_high_95_delta),
        }
      })
      .filter((row): row is FantasyProjectionSigma => row !== null)
  } catch (error) {
    console.warn("Unable to fetch fantasy projection sigmas.", error)
    return []
  }
}

const BRISBANE_TIME_ZONE = "Australia/Brisbane"
const BRISBANE_UTC_OFFSET = "+10:00"
const ONE_DAY_MS = 24 * 60 * 60 * 1000

function getBrisbaneDateParts(date: Date): { dateKey: string; weekday: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRISBANE_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)

  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[value("weekday") as "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"] ?? 0
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    weekday,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  }
}

function addDaysToBrisbaneDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00${BRISBANE_UTC_OFFSET}`)
  date.setUTCDate(date.getUTCDate() + days)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BRISBANE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function isPreTeamListWindowInBrisbane(now = new Date()): boolean {
  const brisbane = getBrisbaneDateParts(now)
  if (brisbane.weekday === 1) {
    return brisbane.hour >= 10
  }
  if (brisbane.weekday === 2) {
    return brisbane.hour < 16
  }
  return false
}

function getTuesdayTeamListReleaseUtc(now = new Date()): string {
  const brisbane = getBrisbaneDateParts(now)
  const daysUntilTuesday = brisbane.weekday <= 2 ? 2 - brisbane.weekday : 9 - brisbane.weekday
  const tuesdayDateKey = addDaysToBrisbaneDateKey(brisbane.dateKey, daysUntilTuesday)
  return new Date(`${tuesdayDateKey}T16:00:00${BRISBANE_UTC_OFFSET}`).toISOString()
}

function getProjectionFixtureCutoffUtc(now = new Date()): string {
  if (isPreTeamListWindowInBrisbane(now)) {
    return getTuesdayTeamListReleaseUtc(now)
  }
  return new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
}

function normaliseProjectionPlayerName(value: unknown): string {
  const key = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  if (key === "api koroisau") return "apisai koroisau"
  return key
}

function isZeroProjectionLineupPosition(value: unknown): boolean {
  const position = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  return position === "reserve" || position === "replacement"
}

function toFiniteProjectionNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseRoundNumber(value: unknown): number | null {
  const match = String(value ?? "").match(/\d+/)
  if (!match) return null
  const round = Number.parseInt(match[0], 10)
  return Number.isFinite(round) ? round : null
}

async function fetchLineupUnawareProjectionSnapshot(cutoffUtc: string): Promise<LineupsProjectionSnapshot> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .schema("nrl")
    .from("lineup_unaware_fantasy_projections")
    .select("round, player, team, assumed_jersey, assumed_position, projection, model_projection, kickoff_utc")
    .gte("kickoff_utc", cutoffUtc)
    .order("kickoff_utc", { ascending: true })

  if (error || !data) return emptyLineupsProjectionSnapshot("lineup_unaware")

  const snapshot = emptyLineupsProjectionSnapshot("lineup_unaware")
  const firstKickoffMs = data
    .map((row) => Date.parse(String(row.kickoff_utc ?? "")))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0]
  const roundRows = firstKickoffMs == null
    ? data
    : data.filter((row) => {
        const kickoffMs = Date.parse(String(row.kickoff_utc ?? ""))
        return Number.isFinite(kickoffMs) && kickoffMs >= firstKickoffMs && kickoffMs < firstKickoffMs + 6 * ONE_DAY_MS
      })
  snapshot.round = parseRoundNumber(roundRows[0]?.round)

  for (const row of roundRows) {
    const nameKey = normaliseProjectionPlayerName(row.player)
    if (!nameKey) continue

    const projection =
      toFiniteProjectionNumber(row.projection) ??
      toFiniteProjectionNumber(row.model_projection)
    if (projection != null) {
      snapshot.projectionByPlayerName.set(nameKey, projection)
    }

    snapshot.roleByPlayerName.set(nameKey, {
      position: typeof row.assumed_position === "string" ? row.assumed_position : null,
      team: typeof row.team === "string" ? row.team : null,
      number: row.assumed_jersey == null ? null : Number(row.assumed_jersey),
      isOnField: true,
    })
  }

  return snapshot
}

export async function fetchLineupsProjectionsByPlayerId(): Promise<LineupsProjectionSnapshot> {
  try {
    const supabase = createServerSupabaseClient()
    const lineupCutoffUtc = getProjectionFixtureCutoffUtc()

    // Prefer actual upcoming lineups whenever they exist. If team lists have not
    // been released yet, fall back to the lineup-unaware model.
    let roundLabel: string | null = null

    const { data: upcoming } = await supabase
      .schema("nrl")
      .from("lineups")
      .select("round")
      .gte("match_date", lineupCutoffUtc)
      .order("match_date", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (upcoming?.round) {
      roundLabel = upcoming.round as string
    } else {
      return fetchLineupUnawareProjectionSnapshot(lineupCutoffUtc)
    }

    if (!roundLabel) return fetchLineupUnawareProjectionSnapshot(lineupCutoffUtc)

    const round = parseRoundNumber(roundLabel)

    const { data, error } = await supabase
      .schema("nrl")
      .from("lineups")
      .select("match_id, player, player_id, model_projection, position, team, number, is_on_field")
      .eq("round", roundLabel)

    if (error || !data) return fetchLineupUnawareProjectionSnapshot(lineupCutoffUtc)

    const matchIds = Array.from(new Set(data.map((row) => String(row.match_id ?? "")).filter(Boolean)))
    const playerIds = Array.from(new Set(data.map((row) => String(row.player_id ?? "")).filter(Boolean)))
    const overrideByKey = new Map<string, number>()
    if (matchIds.length > 0 && playerIds.length > 0) {
      const { data: overrides } = await supabase
        .schema("nrl")
        .from("fantasy_projection_overrides")
        .select("match_id, player_id, projection_override_points")
        .in("match_id", matchIds)
        .in("player_id", playerIds)
      for (const row of overrides ?? []) {
        const delta = toFiniteProjectionNumber(row.projection_override_points)
        if (delta == null) continue
        overrideByKey.set(`${row.match_id ?? ""}:${row.player_id ?? ""}`, delta)
      }
    }

    const projectionByPlayerId = new Map<number, number>()
    const projectionByPlayerName = new Map<string, number>()
    const roleByPlayerId = new Map<number, LineupsPlayerRole>()
    const roleByPlayerName = new Map<string, LineupsPlayerRole>()
    for (const row of data) {
      const playerNameKey = normaliseProjectionPlayerName(row.player)
      const modelProjection = toFiniteProjectionNumber(row.model_projection)
      const manualDelta = overrideByKey.get(`${row.match_id ?? ""}:${row.player_id ?? ""}`) ?? 0
      const projection = isZeroProjectionLineupPosition(row.position)
        ? 0
        : modelProjection == null
          ? null
          : modelProjection + manualDelta
      if (projection != null) {
        if (row.player_id != null) {
          projectionByPlayerId.set(Number(row.player_id), projection)
        }
        if (playerNameKey) projectionByPlayerName.set(playerNameKey, projection)
      }
      const role = {
        position: typeof row.position === "string" ? row.position : null,
        team: typeof row.team === "string" ? row.team : null,
        number: row.number == null ? null : Number(row.number),
        isOnField: Boolean(row.is_on_field),
      }
      if (row.player_id != null) {
        roleByPlayerId.set(Number(row.player_id), role)
      }
      if (playerNameKey) roleByPlayerName.set(playerNameKey, role)
    }

    return {
      round,
      source: "lineups",
      lineupsAvailable: true,
      projectionByPlayerId,
      projectionByPlayerName,
      roleByPlayerId,
      roleByPlayerName,
    }
  } catch (err) {
    console.warn("Unable to fetch lineups projections.", err)
    return emptyLineupsProjectionSnapshot()
  }
}
