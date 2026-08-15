import type { FeatureRow, Ohlcv } from "./indicators";
import { computeRawFeatures, zScoreFeatures } from "./indicators";
import { lorentzianDistance } from "./distance";
import { buildLabels, type ClassLabel } from "./labels";
import { wilsonLowerBound } from "./wilson";
import {
  K_NEIGHBORS,
  CHRONO_SPACING,
  ZSCORE_LOOKBACK,
  MIN_NEIGHBOR_POOL,
  FEATURE_HISTORY_MAX,
  MODEL_VERSION,
} from "./constants";

export type ClassDistribution = {
  long: number;
  short: number;
  neutral: number;
};

export type LorentzianInference = {
  distribution: ClassDistribution;
  topClass: ClassLabel;
  /** Wilson lower-bound on top-class win rate among k neighbors */
  confidence: number;
  neighborCount: number;
  poolSize: number;
  modelVersion: string;
  /** Indices of neighbors used (for explanation) */
  neighborMeta: Array<{ index: number; distance: number; label: ClassLabel }>;
  ready: boolean;
  reason?: string;
};

export class LorentzianClassifier {
  private bars: Ohlcv[] = [];
  private features: (FeatureRow | null)[] = [];
  private labels: (ClassLabel | null)[] = [];

  /** Replace history with a full causal bar series (oldest → newest). */
  setBars(bars: Ohlcv[]) {
    const trimmed =
      bars.length > FEATURE_HISTORY_MAX
        ? bars.slice(-FEATURE_HISTORY_MAX)
        : bars;
    this.bars = trimmed;
    const raw = computeRawFeatures(this.bars);
    this.features = zScoreFeatures(raw, ZSCORE_LOOKBACK);
    this.labels = buildLabels(this.bars.map((b) => b.close));
  }

  /** Append a single closed (or forming) bar and recompute tail features. */
  pushBar(bar: Ohlcv) {
    this.bars.push(bar);
    if (this.bars.length > FEATURE_HISTORY_MAX) {
      this.bars = this.bars.slice(-FEATURE_HISTORY_MAX);
    }
    // Full recompute is fine at 15m cadence
    this.setBars(this.bars);
  }

  getBarCount(): number {
    return this.bars.length;
  }

  /**
   * Infer at the latest bar that has features.
   * Neighbors are drawn only from earlier bars (strictly causal).
   * Chronological spacing: take every CHRONO_SPACING-th labeled bar.
   */
  infer(): LorentzianInference {
    const empty = (reason: string): LorentzianInference => ({
      distribution: { long: 0, short: 0, neutral: 1 },
      topClass: "neutral",
      confidence: 0,
      neighborCount: 0,
      poolSize: 0,
      modelVersion: MODEL_VERSION,
      neighborMeta: [],
      ready: false,
      reason,
    });

    // Find latest index with features; for live inference we allow unlabeled current bar
    let queryIdx = -1;
    for (let i = this.features.length - 1; i >= 0; i--) {
      if (this.features[i]) {
        queryIdx = i;
        break;
      }
    }
    if (queryIdx < 0) return empty("no_features_yet");

    const query = this.features[queryIdx] as FeatureRow;

    // Build chronologically spaced neighbor pool from strictly earlier bars
    const pool: Array<{ index: number; distance: number; label: ClassLabel }> =
      [];
    for (let i = queryIdx - 1; i >= 0; i--) {
      if (!this.features[i] || !this.labels[i]) continue;
      // spacing relative to query
      if ((queryIdx - i) % CHRONO_SPACING !== 0) continue;
      pool.push({
        index: i,
        distance: lorentzianDistance(query, this.features[i] as FeatureRow),
        label: this.labels[i] as ClassLabel,
      });
    }

    if (pool.length < MIN_NEIGHBOR_POOL) {
      return empty(
        `neighbor_pool_too_small:${pool.length}<${MIN_NEIGHBOR_POOL}`
      );
    }

    pool.sort((a, b) => a.distance - b.distance);
    const neighbors = pool.slice(0, K_NEIGHBORS);

    const counts = { long: 0, short: 0, neutral: 0 };
    for (const n of neighbors) counts[n.label]++;

    const total = neighbors.length;
    const distribution: ClassDistribution = {
      long: counts.long / total,
      short: counts.short / total,
      neutral: counts.neutral / total,
    };

    let topClass: ClassLabel = "neutral";
    let topCount = counts.neutral;
    if (counts.long > topCount) {
      topClass = "long";
      topCount = counts.long;
    }
    if (counts.short > topCount) {
      topClass = "short";
      topCount = counts.short;
    }

    const confidence = wilsonLowerBound(topCount, total);

    return {
      distribution,
      topClass,
      confidence,
      neighborCount: total,
      poolSize: pool.length,
      modelVersion: MODEL_VERSION,
      neighborMeta: neighbors,
      ready: true,
    };
  }
}
