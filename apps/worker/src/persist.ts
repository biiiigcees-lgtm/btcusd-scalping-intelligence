import type { Trade, MarketState, Signal } from "@btc/shared";

let db: unknown = null;
let enabled = false;

export async function initPersistence(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[persist] DATABASE_URL not set — persistence disabled");
    return;
  }
  try {
    const { createDb } = await import("@btc/db");
    db = createDb(url);
    enabled = true;
    console.log("[persist] Postgres persistence enabled");
  } catch (err) {
    console.error("[persist] failed to init — continuing without DB", err);
    enabled = false;
  }
}

export async function persistTrade(trade: Trade): Promise<void> {
  if (!enabled || !db) return;
  try {
    const { trades } = await import("@btc/db");
    const d = db as any;
    await d.insert(trades).values({
      tradeId: trade.tradeId,
      exchange: trade.exchange,
      symbol: trade.symbol,
      price: String(trade.price),
      quantity: String(trade.quantity),
      side: trade.side,
      tradeTime: new Date(trade.tradeTime),
      receivedAt: new Date(trade.receivedAt),
    });
  } catch (err) {
    console.error("[persist] trade insert failed", (err as Error).message);
  }
}

export async function persistMarketState(_state: MarketState): Promise<void> {
  return;
}

export async function persistSignal(signal: Signal): Promise<void> {
  if (!enabled || !db) return;
  try {
    const { signals } = await import("@btc/db");
    const d = db as any;
    await d.insert(signals).values({
      signalId: signal.signalId,
      timestamp: new Date(signal.timestamp),
      direction: signal.direction,
      confidence: String(signal.confidence),
      regime: signal.regime,
      featureSetId: signal.featureSetId,
      modelVersion: signal.modelVersion,
      explanation: signal.explanation,
      invalidation: signal.invalidation,
      dataQuality: String(signal.dataQuality),
      createdAt: new Date(signal.createdAt),
    });
  } catch (err) {
    console.error("[persist] signal insert failed", (err as Error).message);
  }
}
