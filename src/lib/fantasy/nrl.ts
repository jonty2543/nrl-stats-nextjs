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

  return {
    id: parsedId,
    projectedScore: toNum(raw.proj_score),
    projectedScores: extractScoreHistory(raw.proj_scores),
    breakEven: toInt(raw.break_even),
    breakEvens: extractIntHistory(raw.break_evens),
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

export function getProjectionWeeklyChangeOffset(weeklyDelta: number | null, topRise: number | null): number {
  if (weeklyDelta == null || topRise == null || topRise <= 0) return 0
  const ratio = weeklyDelta / topRise
  if (ratio >= 0.66) return 3
  if (ratio >= 0.33) return 2
  if (ratio > 0) return 1
  if (ratio >= -0.33) return -1
  if (ratio >= -0.66) return -2
  return -3
}

export function applyFantasyProjectionOffset(
  value: number | null,
  weeklyDelta: number | null,
  topRise: number | null,
): number | null {
  if (value == null) return value
  if (value === 0) return 0
  return Math.round(value + getProjectionWeeklyChangeOffset(weeklyDelta, topRise))
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
    .eq("snapshot_type", "weekly_sunday_11pm_brisbane")
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
