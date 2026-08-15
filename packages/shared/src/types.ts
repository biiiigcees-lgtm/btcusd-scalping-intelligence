/** Core domain types for BTCUSD Scalping Intelligence Assistant */

export type Exchange = "binance" | "bybit" | "coinbase";
export type Side = "buy" | "sell";
export type Regime =
  | "trending_up"
  | "trending_down"
  | "ranging"
  | "high_volatility"
  | "low_liquidity"
  | "unknown";
export type SignalDirection = "long" | "short" | null;
export type SystemHealth = "healthy" | "degraded" | "critical";

/** Supported candle intervals */
export type CandleInterval = "1m" | "15m";

export interface Trade {
  tradeId: string;
  exchange: Exchange;
  symbol: string;
  price: number;
  quantity: number;
  side: Side;
  tradeTime: string;
  receivedAt: string;
}

export interface Candle {
  exchange: Exchange;
  symbol: string;
  interval: CandleInterval;
  openTime: string; // ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean; // true when bar is finalized
}

export interface FeatureVector {
  featureSetId: string;
  timestamp: string;
  values: Record<string, number>;
  quality: number;
}

export interface RegimeState {
  timestamp: string;
  regime: Regime;
  confidence: number;
  evidence: Record<string, number | string>;
}

export interface ExplanationPayload {
  what: string;
  why: string[];
  supporting: string[];
  contradictory: string[];
  confidence: number;
  calibrationNote: string;
  dataQuality: number;
  featureSetId: string;
  modelVersion: string;
}

export interface InvalidationConditions {
  price?: number;
  timeSeconds?: number;
  regimeChange?: boolean;
  dataQualityBelow?: number;
}

export interface Signal {
  signalId: string;
  timestamp: string;
  direction: SignalDirection;
  confidence: number;
  regime: Regime;
  featureSetId: string;
  modelVersion: string;
  explanation: ExplanationPayload;
  invalidation: InvalidationConditions;
  dataQuality: number;
  createdAt: string;
}

/** Snapshot of DataQualityTracker — real latency/silence/reconnect metrics */
export interface QualitySnapshot {
  score: number;
  latencyMs: number;
  silenceMs: number;
  reconnectsRecent: number;
  reasons: string[];
  lastHealthyAt: string;
}

/**
 * Full market snapshot published by the worker.
 * Single source of truth — web must never recompute regime/features/quality.
 */
export interface MarketState {
  symbol: string;
  price: number;
  change24h: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  quoteVolume24h?: number;
  regime: RegimeState;
  dataQuality: number;
  qualitySnapshot?: QualitySnapshot;
  lastUpdate: string;
  systemHealth: SystemHealth;
  /** Feature values from @btc/features (canonical) — computed on primary timeframe */
  features?: {
    return_1?: number;
    realized_vol?: number;
    volume_intensity?: number;
    momentum_5?: number;
    range_position?: number;
    price?: number;
  };
  /** Baseline / promoted model output */
  signal?: {
    direction: SignalDirection;
    label: "NO TRADE" | "LONG" | "SHORT";
    confidence: number;
    modelVersion: string;
    explanation: {
      what: string;
      why: string[];
      supporting: string[];
      contradictory: string[];
      calibrationNote: string;
    };
  };
  /** Recent closes for chart seed — primary timeframe */
  priceHistory?: number[];
  /** Recent OHLCV bars (primary timeframe) for chart */
  candles?: Array<{
    openTime: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  /** Active feed source label */
  source?: string;
  /** Explicit timeframe label — never leave the user guessing */
  timeframe?: string;
}
