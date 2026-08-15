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
export const SystemHealthSchema = z.enum(["healthy", "degraded", "critical"]);

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

export const QualitySnapshotSchema = z.object({
  score: z.number().min(0).max(1),
  latencyMs: z.number(),
  silenceMs: z.number(),
  reconnectsRecent: z.number().int().nonnegative(),
  reasons: z.array(z.string()),
  lastHealthyAt: z.string().datetime(),
});

export const MarketStateSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  change24h: z.number(),
  high24h: z.number().optional(),
  low24h: z.number().optional(),
  volume24h: z.number().optional(),
  quoteVolume24h: z.number().optional(),
  regime: z.object({
    timestamp: z.string().datetime(),
    regime: RegimeSchema,
    confidence: z.number(),
    evidence: z.record(z.union([z.number(), z.string()])),
  }),
  dataQuality: z.number().min(0).max(1),
  qualitySnapshot: QualitySnapshotSchema.optional(),
  lastUpdate: z.string().datetime(),
  systemHealth: SystemHealthSchema,
  features: z
    .object({
      return_1: z.number().optional(),
      realized_vol: z.number().optional(),
      volume_intensity: z.number().optional(),
      momentum_5: z.number().optional(),
      range_position: z.number().optional(),
      price: z.number().optional(),
    })
    .optional(),
  signal: z
    .object({
      direction: SignalDirectionSchema,
      label: z.enum(["NO TRADE", "LONG", "SHORT"]),
      confidence: z.number(),
      modelVersion: z.string(),
      explanation: z.object({
        what: z.string(),
        why: z.array(z.string()),
        supporting: z.array(z.string()),
        contradictory: z.array(z.string()),
        calibrationNote: z.string(),
      }),
    })
    .optional(),
  priceHistory: z.array(z.number()).optional(),
  source: z.string().optional(),
  timeframe: z.string().optional(),
});
