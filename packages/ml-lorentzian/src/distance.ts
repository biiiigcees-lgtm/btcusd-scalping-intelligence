import type { FeatureRow } from "./indicators";

/** Lorentzian distance — robust to outlier bars vs Euclidean */
export function lorentzianDistance(a: FeatureRow, b: FeatureRow): number {
  const keys: (keyof FeatureRow)[] = ["rsi", "willr", "cci", "adx", "rvol"];
  let d = 0;
  for (const k of keys) {
    d += Math.log(1 + Math.abs(a[k] - b[k]));
  }
  return d;
}
