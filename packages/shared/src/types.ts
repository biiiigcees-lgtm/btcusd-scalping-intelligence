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

export interface MarketState {
  symbol: string;
  price: number;
  change24h: number;
  regime: RegimeState;
  dataQuality: number;
  lastUpdate: string;
  systemHealth: "healthy" | "degraded" | "critical";
}
