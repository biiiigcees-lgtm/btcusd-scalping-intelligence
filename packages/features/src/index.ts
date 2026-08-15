import type { FeatureVector } from "@btc/shared";
import { MVP_FEATURE_SET_VERSION } from "@btc/shared";

export const FEATURE_SET_NAME = "mvp_microstructure_v1";
export const FEATURE_SET_VERSION = MVP_FEATURE_SET_VERSION;

export function calculateMvpFeatures(
  prices: number[],
  volumes: number[],
  timestamp: string,
  quality: number
): FeatureVector {
  if (prices.length < 2) {
    return {
      featureSetId: "00000000-0000-0000-0000-000000000001",
      timestamp,
      values: {},
      quality: 0,
    };
  }

  const last = prices[prices.length - 1];
  const prev = prices[prices.length - 2];
  const ret = (last - prev) / prev;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const realizedVol = Math.sqrt(variance);

  const volMean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const lastVol = volumes[volumes.length - 1] || 0;
  const volIntensity = volMean > 0 ? lastVol / volMean : 0;

  return {
    featureSetId: "00000000-0000-0000-0000-000000000001",
    timestamp,
    values: {
      return_1: ret,
      realized_vol: realizedVol,
      volume_intensity: volIntensity,
      price: last,
    },
    quality,
  };
}

export { computeAnticipation } from "./anticipation";
export type { AnticipationInputBar, AnticipationResult } from "./anticipation";
