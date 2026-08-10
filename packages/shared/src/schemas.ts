import { z } from "zod";

export const ExchangeSchema = z.enum(["binance", "bybit", "coinbase"]);
export const SideSchema = z.enum(["buy", "sell"]);
export const RegimeSchema = z.enum([
  "trending_up",
  "trending_down",
  "ranging",
  "high_volatility",
  "low_liquidity",
  "unknown",
]);
export const SignalDirectionSchema = z.enum(["long", "short"]).nullable();

export const TradeSchema = z.object({
  tradeId: z.string(),
  exchange: ExchangeSchema,
  symbol: z.string(),
  price: z.number().positive(),
  quantity: z.number().positive(),
  side: SideSchema,
  tradeTime: z.string().datetime(),
  receivedAt: z.string().datetime(),
});

export const FeatureVectorSchema = z.object({
  featureSetId: z.string().uuid(),
  timestamp: z.string().datetime(),
  values: z.record(z.number()),
  quality: z.number().min(0).max(1),
});

export const MarketStateSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  change24h: z.number(),
  regime: z.object({
    timestamp: z.string().datetime(),
    regime: RegimeSchema,
    confidence: z.number(),
    evidence: z.record(z.union([z.number(), z.string()])),
  }),
  dataQuality: z.number().min(0).max(1),
  lastUpdate: z.string().datetime(),
  systemHealth: z.enum(["healthy", "degraded", "critical"]),
});
