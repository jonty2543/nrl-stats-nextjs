/** Arithmetic mean */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Median */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Min */
export function min(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/** Max */
export function max(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

/** Standard deviation (population) */
export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const sqDiffs = values.map((v) => (v - m) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Pearson correlation coefficient.
 * Returns null if fewer than 2 points or no variation.
 */
export function pearsonR(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;

  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));

  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }

  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return null;
  return num / denom;
}

/**
 * Simple linear regression: y = m*x + b
 * Returns null if fewer than 2 points.
 */
export function linearRegression(
  x: number[],
  y: number[]
): { m: number; b: number } | null {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;

  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));

  let num = 0;
  let denom = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    num += dx * (y[i] - my);
    denom += dx * dx;
  }

  if (denom === 0) return null;
  const m = num / denom;
  const b = my - m * mx;
  return { m, b };
}

/**
 * Percentile rank: percentage of values in `all` that are < `value`.
 */
export function percentileRank(value: number, all: number[]): number {
  if (all.length === 0) return 0;
  const below = all.filter((v) => v < value).length;
  return (below / all.length) * 100;
}
