import type { Draw2026Data } from "@/lib/draw/types"

const MAJOR_BYE_ROUNDS = [12, 15, 18] as const
const TRADE_RATING_COMPONENT_COUNT = 7

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

interface TradeRatingPopulation {
  weeklyChanges: number[]
  valueEdges: number[]
  formEdges: number[]
  breakevenEdges: number[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function roundScore(value: number): number {
  return Math.round(clamp(value, 0, 100))
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function percentileRank(value: number | null, population: number[], fallback = 50): number {
  if (value === null || population.length === 0) return fallback
  const sorted = [...population].sort((a, b) => a - b)
  const below = sorted.filter((candidate) => candidate < value).length
  const equal = sorted.filter((candidate) => candidate === value).length
  return ((below + equal * 0.5) / sorted.length) * 100
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
  if (projection === null) return 50
  if (projection >= 60) return 100
  if (projection >= 55) return 90
  if (projection >= 50) return 78
  if (projection >= 45) return 64
  if (projection >= 40) return 48
  if (projection >= 35) return 32
  if (projection >= 30) return 20
  return 10
}

function returnRound(returnDate: string | null): number | null {
  if (!returnDate) return null
  const match = returnDate.match(/\b(?:round|rd)\s*(\d+)\b/i) ?? returnDate.match(/\bR(\d+)\b/i)
  if (!match?.[1]) return null
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) ? parsed : null
}

function roleSecurityScore(relevantOuts: TradeRatingCasualtyWardRecord[], currentRound: number): number {
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

  return roundScore(100 - clamp(penalty, 0, 35))
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
  if (!team) return 50

  let played = 0
  for (let offset = 0; offset < 6; offset += 1) {
    const round = currentRound + offset
    const plays = teamPlaysInRound(draw, round, team)
    if (plays === true && !(originChance && MAJOR_BYE_ROUNDS.includes(round as typeof MAJOR_BYE_ROUNDS[number]))) {
      played += 1
    }
  }

  return roundScore((played / 6) * 100)
}

export function buildTradeRatingPopulation(inputs: TradeRatingInput[]): TradeRatingPopulation {
  return inputs.reduce<TradeRatingPopulation>(
    (population, input) => {
      const weeklyChange = finiteNumber(input.weeklyChange)
      const valueEdge = valueEdgeForInput(input)
      const formEdge = formEdgeForInput(input)
      const breakevenEdge = breakevenEdgeForInput(input)

      if (weeklyChange !== null) population.weeklyChanges.push(weeklyChange)
      if (valueEdge !== null) population.valueEdges.push(valueEdge)
      if (formEdge !== null) population.formEdges.push(formEdge)
      if (breakevenEdge !== null) population.breakevenEdges.push(breakevenEdge)

      return population
    },
    { weeklyChanges: [], valueEdges: [], formEdges: [], breakevenEdges: [] }
  )
}

export function calculateTradeRating({
  input,
  population,
  draw,
  currentRound,
}: {
  input: TradeRatingInput
  population: TradeRatingPopulation
  draw: Draw2026Data | null | undefined
  currentRound: number
}): TradeRatingScores {
  const projection = finiteNumber(input.projection)
  const valueEdge = valueEdgeForInput(input)
  const formEdge = formEdgeForInput(input)
  const breakevenEdge = breakevenEdgeForInput(input)
  const keeperScore = keeperScoreForProjection(projection)
  const valueEdgeScore = percentileRank(valueEdge, population.valueEdges)
  const scores = {
    weeklyDelta: roundScore(percentileRank(finiteNumber(input.weeklyChange), population.weeklyChanges)),
    value: roundScore(valueEdgeScore),
    keeperScore: roundScore(keeperScore),
    roleSecurityScore: roleSecurityScore(input.relevantOuts, currentRound),
    form: roundScore(percentileRank(formEdge, population.formEdges)),
    breakeven: roundScore(percentileRank(breakevenEdge, population.breakevenEdges)),
    availability: availabilityScore({ draw, currentRound, team: input.team, originChance: input.originChance }),
  }
  const total =
    scores.weeklyDelta +
    scores.value +
    scores.keeperScore +
    scores.roleSecurityScore +
    scores.form +
    scores.breakeven +
    scores.availability

  return {
    ...scores,
    overall: Number(((total / TRADE_RATING_COMPONENT_COUNT) / 10).toFixed(1)),
  }
}
