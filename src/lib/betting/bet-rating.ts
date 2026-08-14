import { BETTING_BOOKIE_COLUMNS } from "./types";

const BET_SCORE_ZERO_EDGE = 0.3;
const BET_SCORE_POSITIVE_EDGE_RANGE = 0.58;
const BET_SCORE_EDGE_CURVE_STEEPNESS_PP = 2.2;
const BET_SCORE_NEGATIVE_EDGE_CURVE_STEEPNESS_PP = 3.4;
const BET_SCORE_EFFICIENT_MARKET_DECAY_PROTECTION_MIN = 0.72;
const BET_SCORE_EFFICIENT_MARKET_DECAY_PROTECTION_MAX = 1;
const BET_SCORE_EFFICIENT_MARKET_MAX_DECAY_REDUCTION = 0.35;
const BET_SCORE_SUSPICIOUS_EDGE_DECAY_RANGE_PP = 10;

export const BET_SCORE_SUSPICIOUS_EDGE_THRESHOLD_PP = 6;

export const BET_RATING_WEIGHTS = {
  liquidity: 0.18,
  efficiency: 0.12,
  disagreement: 0.08,
  timing: 0.14,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isoDateDiffDays(fromIso: string, toIso: string): number | null {
  const fromMs = Date.parse(`${fromIso}T00:00:00`);
  const toMs = Date.parse(`${toIso}T00:00:00`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000));
}

export function todayIsoInBrisbane(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function eventProximityScore(eventDate: string, todayIso: string): number {
  const daysUntil = isoDateDiffDays(todayIso, eventDate);
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
  const lowerPrices = bestPrice == null
    ? []
    : validPrices.filter((price) => price < bestPrice - 1e-9);
  const averageLowerPrice = lowerPrices.length > 0
    ? lowerPrices.reduce((sum, price) => sum + price, 0) / lowerPrices.length
    : null;
  const marketDisagreementPct = bestPrice != null && averageLowerPrice != null && averageLowerPrice > 0
    ? ((bestPrice / averageLowerPrice) - 1) * 100
    : null;
  const liquidityScore = clamp(validPrices.length / BETTING_BOOKIE_COLUMNS.length, 0, 1);
  const efficiencyScore = marketEfficiencyPct != null
    ? clamp(1 - Math.max(0, marketEfficiencyPct - 100) / 14, 0, 1)
    : clamp(0.5 + liquidityScore * 0.35, 0, 1);
  const lowerBookConsensusScore = validPrices.length > 1
    ? clamp(lowerPrices.length / (validPrices.length - 1), 0, 1)
    : 0;
  const disagreementScore = clamp((marketDisagreementPct ?? 0) / 14, 0, 1)
    * (0.35 + (lowerBookConsensusScore * 0.65));

  return {
    marketDisagreementPct,
    liquidityScore,
    efficiencyScore,
    disagreementScore,
  };
}

export function calculateBetRatingScore({
  edgePp,
  eventDate,
  todayIso,
  liquidityScore,
  efficiencyScore,
  disagreementScore,
}: {
  edgePp: number;
  eventDate: string;
  todayIso: string;
  liquidityScore: number;
  efficiencyScore: number;
  disagreementScore: number;
}): number {
  const timingScore = eventProximityScore(eventDate, todayIso);
  const contextWeight =
    BET_RATING_WEIGHTS.liquidity +
    BET_RATING_WEIGHTS.efficiency +
    BET_RATING_WEIGHTS.disagreement +
    BET_RATING_WEIGHTS.timing;
  const contextScore = contextWeight > 0 ? (
    (liquidityScore * BET_RATING_WEIGHTS.liquidity) +
    (efficiencyScore * BET_RATING_WEIGHTS.efficiency) +
    (disagreementScore * BET_RATING_WEIGHTS.disagreement) +
    (timingScore * BET_RATING_WEIGHTS.timing)
  ) / contextWeight : 0.5;
  const edgeCurve = 1 / (1 + Math.exp(-edgePp / (
    edgePp < 0 ? BET_SCORE_NEGATIVE_EDGE_CURVE_STEEPNESS_PP : BET_SCORE_EDGE_CURVE_STEEPNESS_PP
  )));
  const edgeScore = edgePp < 0
    ? BET_SCORE_ZERO_EDGE * (edgeCurve / 0.5)
    : BET_SCORE_ZERO_EDGE + (((edgeCurve - 0.5) / 0.5) * BET_SCORE_POSITIVE_EDGE_RANGE);
  const contextAdjustment = (contextScore - 0.5) * 0.08;
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
