import { BETTING_BOOKIE_COLUMNS } from "./types";

const BET_SCORE_ZERO_EDGE = 0.3;
const BET_SCORE_POSITIVE_EDGE_RANGE = 0.58;
const BET_SCORE_EDGE_CURVE_STEEPNESS_PP = 2.2;
const BET_SCORE_NEGATIVE_EDGE_CURVE_STEEPNESS_PP = 3.4;
const BET_SCORE_EFFICIENT_MARKET_DECAY_PROTECTION_MIN = 0.72;
const BET_SCORE_EFFICIENT_MARKET_DECAY_PROTECTION_MAX = 1;
const BET_SCORE_EFFICIENT_MARKET_MAX_DECAY_REDUCTION = 0.35;
const BET_SCORE_SUSPICIOUS_EDGE_DECAY_RANGE_PP = 10;
const BET_SCORE_CONTEXT_ADJUSTMENT_RANGE = 0.35;
const BET_RATING_FULL_DISPARITY_SCORE_PP = 4;
const BET_RATING_TIMING_MIN_SCORE = 0.3;
const BET_RATING_TIMING_HALF_LIFE_HOURS = 3;
const BET_RATING_TIMING_THREE_HOUR_DECAY = 5 / 7;

export const BET_SCORE_SUSPICIOUS_EDGE_THRESHOLD_PP = 8;

export const BET_RATING_WEIGHTS = {
  efficiency: 0.225,
  disagreement: 0.225,
  timing: 0.3,
  teamLists: 0.25,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function eventTimeMs(eventTime: string): number | null {
  const value = eventTime.includes("T")
    ? Date.parse(eventTime)
    : Date.parse(`${eventTime}T23:59:59+10:00`);
  return Number.isFinite(value) ? value : null;
}

export function todayIsoInBrisbane(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function eventProximityScore(eventTime: string, nowMs = Date.now()): number {
  const kickoffMs = eventTimeMs(eventTime);
  if (kickoffMs == null || !Number.isFinite(nowMs)) return 0.5;
  const hoursUntil = Math.max(0, (kickoffMs - nowMs) / (60 * 60 * 1000));
  return clamp(
    BET_RATING_TIMING_MIN_SCORE + ((1 - BET_RATING_TIMING_MIN_SCORE) * (
      1 - Math.pow(BET_RATING_TIMING_THREE_HOUR_DECAY, hoursUntil / BET_RATING_TIMING_HALF_LIFE_HOURS)
    )),
    BET_RATING_TIMING_MIN_SCORE,
    1
  );
}

export function earlyMarketTimingScore(eventDate: string, todayIso: string): number {
  const fromMs = Date.parse(`${todayIso}T00:00:00`);
  const toMs = Date.parse(`${eventDate}T00:00:00`);
  const daysUntil = Number.isFinite(fromMs) && Number.isFinite(toMs)
    ? Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000))
    : null;
  if (daysUntil == null) return 0.72;
  if (daysUntil <= 0) return 0.3;
  if (daysUntil === 1) return 0.5;
  if (daysUntil === 2) return 0.68;
  if (daysUntil === 3) return 0.84;
  return 1;
}

export function buildBetRatingMarketSignals({
  prices,
  bestPrice,
  marketEfficiencyPct = null,
}: {
  prices: number[];
  bestPrice: number | null;
  marketEfficiencyPct?: number | null;
}) {
  const validPrices = prices.filter((price) => Number.isFinite(price) && price > 1);
  const highestPrice = bestPrice != null && bestPrice > 1
    ? bestPrice
    : validPrices.length > 0 ? Math.max(...validPrices) : null;
  const lowestPrice = validPrices.length > 1 ? Math.min(...validPrices) : null;
  const marketDisparityPp = highestPrice != null && lowestPrice != null
    ? ((1 / lowestPrice) - (1 / highestPrice)) * 100
    : null;
  const liquidityScore = clamp(validPrices.length / BETTING_BOOKIE_COLUMNS.length, 0, 1);
  const efficiencyScore = marketEfficiencyPct != null
    ? clamp(0.5 + ((100 - marketEfficiencyPct) / 8), 0, 1)
    : 0.5;
  const disagreementScore = clamp(
    (marketDisparityPp ?? 0) / BET_RATING_FULL_DISPARITY_SCORE_PP,
    0,
    1
  );

  return {
    marketDisparityPp,
    liquidityScore,
    efficiencyScore,
    disagreementScore,
  };
}

export function calculateBetRatingScore({
  edgePp,
  eventDate,
  eventKickoff,
  nowMs,
  todayIso,
  efficiencyScore,
  disagreementScore,
  teamListsProcessed = false,
}: {
  edgePp: number;
  eventDate: string;
  eventKickoff?: string | null;
  nowMs?: number;
  todayIso: string;
  efficiencyScore: number;
  disagreementScore: number;
  teamListsProcessed?: boolean;
}): number {
  const referenceNowMs = nowMs ?? (
    todayIso === todayIsoInBrisbane()
      ? Date.now()
      : Date.parse(`${todayIso}T00:00:00+10:00`)
  );
  const timingScore = eventProximityScore(eventKickoff ?? eventDate, referenceNowMs);
  const teamListsScore = teamListsProcessed ? 1 : 0.5;
  const contextWeight =
    BET_RATING_WEIGHTS.efficiency +
    BET_RATING_WEIGHTS.disagreement +
    BET_RATING_WEIGHTS.timing +
    BET_RATING_WEIGHTS.teamLists;
  const contextScore = contextWeight > 0 ? (
    (efficiencyScore * BET_RATING_WEIGHTS.efficiency) +
    (disagreementScore * BET_RATING_WEIGHTS.disagreement) +
    (timingScore * BET_RATING_WEIGHTS.timing) +
    (teamListsScore * BET_RATING_WEIGHTS.teamLists)
  ) / contextWeight : 0.5;
  const edgeCurve = 1 / (1 + Math.exp(-edgePp / (
    edgePp < 0 ? BET_SCORE_NEGATIVE_EDGE_CURVE_STEEPNESS_PP : BET_SCORE_EDGE_CURVE_STEEPNESS_PP
  )));
  const edgeScore = edgePp < 0
    ? BET_SCORE_ZERO_EDGE * (edgeCurve / 0.5)
    : BET_SCORE_ZERO_EDGE + (((edgeCurve - 0.5) / 0.5) * BET_SCORE_POSITIVE_EDGE_RANGE);
  const contextAdjustment = (contextScore - 0.5) * BET_SCORE_CONTEXT_ADJUSTMENT_RANGE;
  const baseScore = edgePp <= 0
    ? clamp(edgeScore + Math.min(contextAdjustment, 0), 0, BET_SCORE_ZERO_EDGE)
    : clamp(edgeScore + contextAdjustment, BET_SCORE_ZERO_EDGE, 1);
  if (edgePp <= BET_SCORE_SUSPICIOUS_EDGE_THRESHOLD_PP) return baseScore;

  const decayProtection = clamp(
    (efficiencyScore - BET_SCORE_EFFICIENT_MARKET_DECAY_PROTECTION_MIN) /
      (BET_SCORE_EFFICIENT_MARKET_DECAY_PROTECTION_MAX - BET_SCORE_EFFICIENT_MARKET_DECAY_PROTECTION_MIN),
    0,
    1
  );
  const maxDecay = 0.65 - (decayProtection * BET_SCORE_EFFICIENT_MARKET_MAX_DECAY_REDUCTION);
  const decay = clamp(
    (edgePp - BET_SCORE_SUSPICIOUS_EDGE_THRESHOLD_PP) / BET_SCORE_SUSPICIOUS_EDGE_DECAY_RANGE_PP,
    0,
    maxDecay
  );
  return clamp(baseScore * (1 - decay), 0, 1);
}
