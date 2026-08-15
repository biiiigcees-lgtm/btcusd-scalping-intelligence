/** Tunable constants — never magic numbers inline */

/** Neighbors in the KNN vote */
export const K_NEIGHBORS = 8;

/** Only sample every N-th historical bar (chronological spacing) */
export const CHRONO_SPACING = 4;

/** Rolling window for Z-score normalization of features */
export const ZSCORE_LOOKBACK = 64;

/** Forward horizon in primary bars for labels (4 × 15m = 1h) */
export const LABEL_HORIZON_BARS = 4;

/** Absolute return threshold to count as long/short vs neutral */
export const LABEL_RETURN_THRESHOLD = 0.0025; // 0.25%

/** Minimum neighbors required before a directional vote is allowed */
export const MIN_NEIGHBOR_POOL = 24;

/** Hard confidence threshold (Wilson lower bound) to surface a direction */
export const CONFIDENCE_THRESHOLD = 0.68;

/** Cooldown: min minutes between signals unless delta/flip rules fire */
export const SIGNAL_COOLDOWN_MINUTES = 30;

/** Confidence must move by this much (pp) to re-fire same direction inside cooldown */
export const CONFIDENCE_DELTA_REFIRE = 0.10;

/** Feature history depth kept for neighbor search */
export const FEATURE_HISTORY_MAX = 500;

export const MODEL_VERSION = "0.1.0-lorentzian";
