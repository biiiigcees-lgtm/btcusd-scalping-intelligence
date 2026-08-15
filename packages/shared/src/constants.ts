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

/** Health check paths */
export const HEALTH_PATHS = {
  worker: "/health",
  web: "/api/v1/health",
} as const;

/** Primary evaluation timeframe (Phase 05+) — label everything explicitly */
export const PRIMARY_TIMEFRAME = "15m" as const;

/** Interim seed timeframe until 15m native aggregation lands */
export const INTERIM_PRICE_HISTORY_TF = "1m" as const;
