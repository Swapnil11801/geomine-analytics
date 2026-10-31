/**
 * regression.ts — Simple linear regression utility
 * Computes y = mx + b, R², and slope from an array of data points.
 * No external dependencies.
 */

export interface RegressionResult {
  slope: number;
  intercept: number;
  r2: number;
  /** Predicted y-values for each input x */
  predictions: { x: number; y: number }[];
}

/**
 * Compute simple linear regression on a set of (x, y) points.
 * Returns slope, intercept, R², and predicted values.
 */
export function linearRegression(
  points: { x: number; y: number }[]
): RegressionResult | null {
  const n = points.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
    sumY2 += p.y * p.y;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // R² (coefficient of determination)
  const meanY = sumY / n;
  let ssRes = 0;
  let ssTot = 0;

  const predictions: { x: number; y: number }[] = [];

  for (const p of points) {
    const predicted = slope * p.x + intercept;
    predictions.push({ x: p.x, y: Number(predicted.toFixed(4)) });
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }

  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return {
    slope: Number(slope.toFixed(6)),
    intercept: Number(intercept.toFixed(6)),
    r2: Number(r2.toFixed(4)),
    predictions,
  };
}

/**
 * Get a human-readable trend description from regression results.
 */
export function getTrendDescription(reg: RegressionResult): string {
  const absSlope = Math.abs(reg.slope);
  const direction = reg.slope > 0 ? 'Increasing' : reg.slope < 0 ? 'Declining' : 'Stable';

  if (absSlope < 0.001) return 'Stable — no significant trend';
  if (reg.r2 < 0.1) return `Weak trend (R²=${reg.r2})`;

  const rate = absSlope < 0.01 ? 'slowly' : absSlope < 0.03 ? 'moderately' : 'rapidly';
  return `${direction} ${rate} at ${reg.slope > 0 ? '+' : ''}${reg.slope}/yr`;
}
