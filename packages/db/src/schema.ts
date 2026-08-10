import {
  pgTable, text, numeric, timestamp, uuid, jsonb, bigint, primaryKey, index,
} from "drizzle-orm/pg-core";

export const trades = pgTable(
  "trades",
  {
    tradeId: text("trade_id").primaryKey(),
    exchange: text("exchange").notNull(),
    symbol: text("symbol").notNull().default("BTCUSDT"),
    price: numeric("price", { precision: 18, scale: 8 }).notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
    side: text("side").notNull(),
    tradeTime: timestamp("trade_time", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ tradeTimeIdx: index("trades_trade_time_idx").on(t.tradeTime) })
);

export const candles = pgTable(
  "candles",
  {
    exchange: text("exchange").notNull(),
    symbol: text("symbol").notNull(),
    interval: text("interval").notNull(),
    openTime: timestamp("open_time", { withTimezone: true }).notNull(),
    open: numeric("open", { precision: 18, scale: 8 }).notNull(),
    high: numeric("high", { precision: 18, scale: 8 }).notNull(),
    low: numeric("low", { precision: 18, scale: 8 }).notNull(),
    close: numeric("close", { precision: 18, scale: 8 }).notNull(),
    volume: numeric("volume", { precision: 18, scale: 8 }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.exchange, t.symbol, t.interval, t.openTime] }),
  })
);

export const featureSets = pgTable("feature_sets", {
  featureSetId: uuid("feature_set_id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  codeHash: text("code_hash").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const features = pgTable(
  "features",
  {
    featureSetId: uuid("feature_set_id").notNull().references(() => featureSets.featureSetId),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    values: jsonb("values").notNull(),
    quality: numeric("quality", { precision: 5, scale: 4 }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.featureSetId, t.timestamp] }) })
);

export const marketRegimes = pgTable("market_regimes", {
  timestamp: timestamp("timestamp", { withTimezone: true }).primaryKey(),
  regime: text("regime").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  evidence: jsonb("evidence"),
});

export const signals = pgTable(
  "signals",
  {
    signalId: uuid("signal_id").primaryKey().defaultRandom(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    direction: text("direction"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    regime: text("regime"),
    featureSetId: uuid("feature_set_id").references(() => featureSets.featureSetId),
    modelVersion: text("model_version"),
    explanation: jsonb("explanation"),
    invalidation: jsonb("invalidation"),
    dataQuality: numeric("data_quality", { precision: 5, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ tsIdx: index("signals_timestamp_idx").on(t.timestamp) })
);

export const signalOutcomes = pgTable("signal_outcomes", {
  signalId: uuid("signal_id").primaryKey().references(() => signals.signalId),
  outcome: text("outcome"),
  measuredAt: timestamp("measured_at", { withTimezone: true }),
  metrics: jsonb("metrics"),
});

export const dataQualitySnapshots = pgTable("data_quality_snapshots", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  score: numeric("score", { precision: 5, scale: 4 }).notNull(),
  latencyMs: numeric("latency_ms"),
  reasons: jsonb("reasons"),
});
