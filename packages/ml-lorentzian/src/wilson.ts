/**
 * Wilson score interval lower bound for a binomial proportion.
 * Used as calibrated confidence (not raw vote fraction).
 * z ≈ 1.96 for ~95% confidence.
 */
export function wilsonLowerBound(
  successes: number,
  total: number,
  z = 1.96
): number {
  if (total <= 0) return 0;
  const phat = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = phat + z2 / (2 * total);
  const margin =
    z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / denom);
}
