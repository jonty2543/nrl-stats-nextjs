import type { Draw2026Data } from "@/lib/draw/types"

const MAJOR_BYE_ROUNDS = [12, 15, 18] as const
const TRADE_RATING_COMPONENT_WEIGHTS = {
  weeklyDelta: 5,
  value: 5,
  keeperScore: 5,
  roleSecurityScore: 3,
  form: 3,
  breakeven: 3,
  availability: 3,
} as const
const TRADE_RATING_TOTAL_WEIGHT = Object.values(TRADE_RATING_COMPONENT_WEIGHTS).reduce((sum, weight) => sum + weight, 0)

export interface TradeRatingCasualtyWardRecord {
  player: string
  team: string | null
  position: string | null
  injury: string | null
  returnDate: string | null
  games: number | null
  averageFantasy: number | null
}

export interface TradeRatingInput {
  weeklyChange: number | null
  last3: number | null
  projection: number | null
  pricedAt: number | null
  value: number | null
  breakeven: number | null
  team: string | null
  originChance: boolean
  relevantOuts: TradeRatingCasualtyWardRecord[]
}

export interface TradeRatingScores {
  weeklyDelta: number
  value: number
  keeperScore: number
  roleSecurityScore: number
  form: number
  breakeven: number
  availability: number
  overall: number
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function scoreAtLeast(value: number | null, bands: ReadonlyArray<readonly [number, number]>, fallback = 50): number {
  if (value === null) return fallback
  for (const [threshold, score] of bands) {
    if (value >= threshold) return score
  }
  return 10
}

function scoreAtMost(value: number, bands: ReadonlyArray<readonly [number, number]>): number {
  for (const [threshold, score] of bands) {
    if (value <= threshold) return score
  }
  return 10
}

function normaliseTeamKey(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function valueEdgeForInput(input: TradeRatingInput): number | null {
  const explicitValue = finiteNumber(input.value)
  if (explicitValue !== null) return explicitValue

  const projection = finiteNumber(input.projection)
  const pricedAt = finiteNumber(input.pricedAt)
  if (projection === null || pricedAt === null) return null
  return Math.round(projection) - Math.round(pricedAt)
}

function formEdgeForInput(input: TradeRatingInput): number | null {
  const last3 = finiteNumber(input.last3)
  const pricedAt = finiteNumber(input.pricedAt)
  if (last3 === null || pricedAt === null) return null
  return last3 - pricedAt
}

function breakevenEdgeForInput(input: TradeRatingInput): number | null {
  const pricedAt = finiteNumber(input.pricedAt)
  const breakeven = finiteNumber(input.breakeven)
  if (pricedAt === null || breakeven === null) return null
  return pricedAt - breakeven
}

function keeperScoreForProjection(projection: number | null): number {
  return scoreAtLeast(projection, [
    [65, 100],
    [60, 90],
    [55, 80],
    [50, 70],
    [45, 60],
    [40, 50],
    [35, 40],
    [30, 30],
    [25, 20],
  ])
}

function popularityScore(weeklyChange: number | null): number {
  return scoreAtLeast(weeklyChange, [
    [5, 100],
    [3, 90],
    [2, 80],
    [1, 70],
    [0.25, 60],
    [-0.25, 50],
    [-1, 40],
    [-2, 30],
    [-4, 20],
  ])
}

function pointEdgeScore(edge: number | null): number {
  return scoreAtLeast(edge, [
    [12, 100],
    [9, 90],
    [6, 80],
    [4, 70],
    [2, 60],
    [-2, 50],
    [-4, 40],
    [-7, 30],
    [-10, 20],
  ])
}

function breakevenScore(edge: number | null): number {
  return scoreAtLeast(edge, [
    [18, 100],
    [14, 90],
    [10, 80],
    [7, 70],
    [4, 60],
    [0, 50],
    [-4, 40],
    [-8, 30],
    [-12, 20],
  ])
}

function returnRound(returnDate: string | null): number | null {
  if (!returnDate) return null
  const match = returnDate.match(/\b(?:round|rd)\s*(\d+)\b/i) ?? returnDate.match(/\bR(\d+)\b/i)
  if (!match?.[1]) return null
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) ? parsed : null
}

function roleSecurityPenalty(relevantOuts: TradeRatingCasualtyWardRecord[], currentRound: number): number {
  let penalty = 0

  for (const row of relevantOuts) {
    const round = returnRound(row.returnDate)
    const roundsAway = round === null ? null : round - currentRound
    let rowPenalty = 0

    if (roundsAway === null) rowPenalty = 4
    else if (roundsAway <= 1) rowPenalty = 18
    else if (roundsAway <= 2) rowPenalty = 14
    else if (roundsAway <= 3) rowPenalty = 9
    else if (roundsAway <= 5) rowPenalty = 5

    const averageFantasy = finiteNumber(row.averageFantasy)
    const games = finiteNumber(row.games)
    if (averageFantasy !== null && averageFantasy >= 50) rowPenalty *= 1.25
    else if (averageFantasy !== null && averageFantasy >= 40) rowPenalty *= 1.1
    if (games !== null && games >= 10) rowPenalty *= 1.1

    penalty += rowPenalty
  }

  return penalty
}

function roleSecurityScore(relevantOuts: TradeRatingCasualtyWardRecord[], currentRound: number): number {
  return scoreAtMost(roleSecurityPenalty(relevantOuts, currentRound), [
    [0, 100],
    [4, 90],
    [8, 80],
    [12, 70],
    [16, 60],
    [20, 50],
    [24, 40],
    [28, 30],
    [32, 20],
  ])
}

function teamPlaysInRound(draw: Draw2026Data | null | undefined, round: number, team: string | null): boolean | null {
  if (!draw?.rows?.length || !team) return null
  const teamKey = normaliseTeamKey(team)
  if (!teamKey) return null
  return draw.rows.some((row) => (
    row.round === round &&
    (normaliseTeamKey(row.home) === teamKey || normaliseTeamKey(row.away) === teamKey)
  ))
}

function availabilityScore({
  draw,
  currentRound,
  team,
  originChance,
}: {
  draw: Draw2026Data | null | undefined
  currentRound: number
  team: string | null
  originChance: boolean
}): number {
  if (!team) return 30
  if (!draw?.rows?.length) return 50

  let played = 0
  let knownRounds = 0
  for (let offset = 0; offset < 6; offset += 1) {
    const round = currentRound + offset
    const plays = teamPlaysInRound(draw, round, team)
    if (plays !== null) knownRounds += 1
    if (plays === true && !(originChance && MAJOR_BYE_ROUNDS.includes(round as typeof MAJOR_BYE_ROUNDS[number]))) {
      played += 1
    }
  }

  if (knownRounds === 0) return 50
  if (played >= 6) return 100
  if (played === 5) return 90
  if (played === 4) return 80
  if (played === 3) return 70
  if (played === 2) return 60
  if (played === 1) return 50
  return 40
}

export function calculateTradeRating({
  input,
  draw,
  currentRound,
}: {
  input: TradeRatingInput
  draw: Draw2026Data | null | undefined
  currentRound: number
}): TradeRatingScores {
  const projection = finiteNumber(input.projection)
  const valueEdge = valueEdgeForInput(input)
  const formEdge = formEdgeForInput(input)
  const breakevenEdge = breakevenEdgeForInput(input)
  const keeperScore = keeperScoreForProjection(projection)
  const scores = {
    weeklyDelta: popularityScore(finiteNumber(input.weeklyChange)),
    value: pointEdgeScore(valueEdge),
    keeperScore,
    roleSecurityScore: roleSecurityScore(input.relevantOuts, currentRound),
    form: pointEdgeScore(formEdge),
    breakeven: breakevenScore(breakevenEdge),
    availability: availabilityScore({ draw, currentRound, team: input.team, originChance: input.originChance }),
  }
  const total =
    scores.weeklyDelta * TRADE_RATING_COMPONENT_WEIGHTS.weeklyDelta +
    scores.value * TRADE_RATING_COMPONENT_WEIGHTS.value +
    scores.keeperScore * TRADE_RATING_COMPONENT_WEIGHTS.keeperScore +
    scores.roleSecurityScore * TRADE_RATING_COMPONENT_WEIGHTS.roleSecurityScore +
    scores.form * TRADE_RATING_COMPONENT_WEIGHTS.form +
    scores.breakeven * TRADE_RATING_COMPONENT_WEIGHTS.breakeven +
    scores.availability * TRADE_RATING_COMPONENT_WEIGHTS.availability

  return {
    ...scores,
    overall: Number(((total / TRADE_RATING_TOTAL_WEIGHT) / 10).toFixed(1)),
  }
}
