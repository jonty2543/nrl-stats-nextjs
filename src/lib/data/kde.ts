/**
 * Gaussian KDE (Kernel Density Estimation).
 * Matches Python scipy.stats.gaussian_kde behavior.
 */

function gaussianKernel(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Compute Silverman bandwidth for the dataset.
 */
function silvermanBandwidth(data: number[]): number {
  const n = data.length;
  if (n < 2) return 0.3;
  const m = data.reduce((a, b) => a + b, 0) / n;
  const variance = data.reduce((a, b) => a + (b - m) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const iqr = computeIQR(data);
  const s = Math.min(sd, iqr / 1.34);
  return 0.9 * s * Math.pow(n, -0.2);
}

function computeIQR(data: number[]): number {
  const sorted = [...data].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  return q3 - q1;
}

function quantile(sorted: number[], p: number): number {
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface KDEPoint {
  x: number;
  y: number;
}

/**
 * Compute Gaussian KDE for `data` over `nPoints` evenly-spaced x values.
 * @param data - raw data points
 * @param bandwidth - KDE bandwidth (default: Silverman's rule)
 * @param nPoints - number of output points (default 200)
 * @param padding - extend range by this fraction on each side (default 0.15)
 */
export function gaussianKDE(
  data: number[],
  bandwidth?: number,
  nPoints = 200,
  padding = 0.15
): KDEPoint[] {
  if (data.length === 0) return [];

  const h = bandwidth ?? silvermanBandwidth(data);
  if (h === 0) return [];

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const lo = min - range * padding;
  const hi = max + range * padding;
  const step = (hi - lo) / (nPoints - 1);

  const result: KDEPoint[] = [];
  for (let i = 0; i < nPoints; i++) {
    const x = lo + i * step;
    let density = 0;
    for (const d of data) {
      density += gaussianKernel((x - d) / h);
    }
    density /= data.length * h;
    result.push({ x, y: density });
  }

  return result;
}
