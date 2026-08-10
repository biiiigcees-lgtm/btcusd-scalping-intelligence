import type { Regime, RegimeState } from "@btc/shared";

export function detectRegime(
  realizedVol: number,
  directionalStrength: number,
  bookImbalance: number,
  timestamp: string
): RegimeState {
  let regime: Regime = "unknown";
  let confidence = 0.5;
  const evidence: Record<string, number | string> = {
    realizedVol,
    directionalStrength,
    bookImbalance,
  };

  if (realizedVol > 0.02) {
    regime = "high_volatility";
    confidence = 0.7;
  } else if (Math.abs(directionalStrength) > 0.4) {
    regime = directionalStrength > 0 ? "trending_up" : "trending_down";
    confidence = 0.65;
  } else if (Math.abs(bookImbalance) < 0.1 && realizedVol < 0.008) {
    regime = "ranging";
    confidence = 0.6;
  } else {
    regime = "unknown";
    confidence = 0.4;
  }

  return { timestamp, regime, confidence, evidence };
}
