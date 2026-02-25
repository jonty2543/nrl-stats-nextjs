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
  }
}

export async function fetchFantasyPlayersSnapshot(): Promise<FantasyPlayerSnapshot[]> {
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
}
