/** System-wide constants — never hardcode magic numbers elsewhere */

export const SYMBOL = "BTCUSDT";
export const PRIMARY_EXCHANGE = "binance" as const;

/** Data quality threshold below which new signals are suppressed */
export const DATA_QUALITY_THRESHOLD = 0.85;

/** End-to-end latency target (ms) */
export const LATENCY_TARGET_MS = 2000;

/** Feature set version for MVP */
export const MVP_FEATURE_SET_VERSION = "0.1.0";

/** Model version placeholder until first trained model */
export const PLACEHOLDER_MODEL_VERSION = "0.0.0-baseline";

/** Redis stream keys */
export const REDIS_STREAMS = {
  trades: "stream:trades",
  candles: "stream:candles",
  features: "stream:features",
  signals: "stream:signals",
  marketState: "stream:market_state",
} as const;

/** Redis key for web-push subscription JSON blobs */
export const REDIS_PUSH_SUBS_KEY = "push:subscriptions";

/** Health check paths */
export const HEALTH_PATHS = {
  worker: "/health",
  web: "/api/v1/health",
} as const;

/** Primary evaluation timeframe — regime, features, ML, gauges */
export const PRIMARY_TIMEFRAME = "15m" as const;

/** Base aggregation timeframe — trades → 1m → 15m */
export const BASE_TIMEFRAME = "1m" as const;

/** How many primary-TF bars to keep in the in-memory / published history */
export const PRIMARY_HISTORY_BARS = 96; // 24h of 15m

/** How many 1m bars to keep for reconstruction */
export const BASE_HISTORY_BARS = 1500; // ~25h

/** Anticipation score at/above which a push may fire (if opted in) */
export const PUSH_ANTICIPATION_THRESHOLD = 0.75;
