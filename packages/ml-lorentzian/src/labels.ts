import { LABEL_HORIZON_BARS, LABEL_RETURN_THRESHOLD } from "./constants";

export type ClassLabel = "long" | "short" | "neutral";

/**
 * Causal labels: for bar i, use close[i+horizon] / close[i] - 1.
 * Bars without a complete forward window are unlabeled (null).
 */
export function buildLabels(
  closes: number[],
  horizon = LABEL_HORIZON_BARS,
  threshold = LABEL_RETURN_THRESHOLD
): (ClassLabel | null)[] {
  const out: (ClassLabel | null)[] = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length - horizon; i++) {
    if (closes[i] <= 0) continue;
    const ret = closes[i + horizon] / closes[i] - 1;
    if (ret > threshold) out[i] = "long";
    else if (ret < -threshold) out[i] = "short";
    else out[i] = "neutral";
  }
  return out;
}
