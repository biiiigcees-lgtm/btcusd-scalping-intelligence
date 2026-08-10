import type { FeatureVector, SignalDirection } from "@btc/shared";
import { PLACEHOLDER_MODEL_VERSION, DATA_QUALITY_THRESHOLD } from "@btc/shared";

/**
 * Placeholder baseline model.
 * This baseline never emits a directional signal until research promotes a real model.
 */
export function inferBaseline(
  features: FeatureVector,
  dataQuality: number
): { direction: SignalDirection; confidence: number; modelVersion: string } {
  if (dataQuality < DATA_QUALITY_THRESHOLD) {
    return {
      direction: null,
      confidence: 0,
      modelVersion: PLACEHOLDER_MODEL_VERSION,
    };
  }

  return {
    direction: null,
    confidence: 0,
    modelVersion: PLACEHOLDER_MODEL_VERSION,
  };
}
