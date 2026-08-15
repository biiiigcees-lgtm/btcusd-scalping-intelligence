/**
 * Market Data + Feature + Inference Worker
 * Single source of truth for market_state published to Redis.
 * Primary evaluation timeframe = 15m (aggregated from trades via 1m).
 */
import { createRedis, safeConnect } from "./redis";
import {
  initPersistence,
  persistTrade,
  persistSignal,
  persistCandle,
  loadRecent1mCandles,
} from "./persist";
import http from "http";
import {
  SYMBOL,
  REDIS_STREAMS,
  DATA_QUALITY_THRESHOLD,
  PRIMARY_EXCHANGE,
  PRIMARY_TIMEFRAME,
} from "@btc/shared";
import { calculateMvpFeatures } from "@btc/features";
import { detectRegime } from "@btc/regime";
import { inferBaseline } from "@btc/ml";
import type { Trade, MarketState, Signal, SystemHealth } from "@btc/shared";
import { randomUUID } from "crypto";
import { BinanceTradeFeed } from "./feeds/binance";
import { DataQualityTracker } from "./quality/data-quality";
import { CandleAggregator } from "./candles/aggregator";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const USE_MOCK = process.env.USE_MOCK_FEED === "true";
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 8081);

const redis = createRedis(REDIS_URL);
let redisReady = false;
const quality = new DataQualityTracker();
const candles = new CandleAggregator();

let lastPrice = 0;
let feedConnected = false;
let activeSource = USE_MOCK ? "mock" : "binance-public-ws";

function deriveExtraFeatures(prices: number[]) {
  if (prices.length < 3) {
    return { momentum_5: 0, range_position: 0.5 };
  }
  const last = prices[prices.length - 1];
  const lookback = Math.min(5, prices.length - 1);
  const base = prices[prices.length - 1 - lookback];
  const momentum_5 = base !== 0 ? (last - base) / base : 0;

  const window = prices.slice(-30);
  const hi = Math.max(...window);
  const lo = Math.min(...window);
  const range_position = hi > lo ? (last - lo) / (hi - lo) : 0.5;

  return { momentum_5, range_position };
}

async function publishMarketState(state: MarketState) {
  if (!redisReady) return;
  try {
    await redis.xadd(
      REDIS_STREAMS.marketState,
      "MAXLEN",
      "~",
      "1000",
      "*",
      "payload",
      JSON.stringify(state)
    );
  } catch (err) {
    console.error("[worker] Failed to publish market state", err);
  }
}

async function publishSignal(signal: Signal) {
  persistSignal(signal).catch(() => {});
  if (!redisReady) return;
  try {
    await redis.xadd(
      REDIS_STREAMS.signals,
      "MAXLEN",
      "~",
      "500",
      "*",
      "payload",
      JSON.stringify(signal)
    );
  } catch (err) {
    console.error("[worker] Failed to publish signal", err);
  }
}

function processTrade(trade: Trade) {
  quality.onTrade(trade.tradeTime, trade.receivedAt);
  persistTrade(trade).catch(() => {});
  lastPrice = trade.price;

  const { closed1m, closed15m } = candles.onTrade(trade);
  if (closed1m) persistCandle(closed1m).catch(() => {});
  if (closed15m) persistCandle(closed15m).catch(() => {});

  // Primary series = 15m closes (includes forming bar)
  const primaryCloses = candles.getPrimaryCloses();
  const primaryCandles = candles.getPrimaryCandles();
  // Synthetic volume series aligned to primary closes (use bar volumes)
  const primaryVolumes = primaryCandles.map((c) => c.volume);

  const dataQuality = quality.getScore();
  const qSnap = quality.getSnapshot();

  const features = calculateMvpFeatures(
    primaryCloses,
    primaryVolumes.length ? primaryVolumes : primaryCloses.map(() => 1),
    trade.tradeTime,
    dataQuality
  );
  const extra = deriveExtraFeatures(primaryCloses);

  const regime = detectRegime(
    features.values.realized_vol ?? 0.01,
    features.values.return_1 ?? 0,
    0,
    trade.tradeTime
  );
  const inference = inferBaseline(features, dataQuality);

  const systemHealth: SystemHealth =
    dataQuality >= DATA_QUALITY_THRESHOLD
      ? "healthy"
      : dataQuality >= 0.6
        ? "degraded"
        : "critical";

  const why = [
    "Baseline model is locked at NO TRADE until research promotion",
    `Timeframe: ${PRIMARY_TIMEFRAME}`,
    `Realized vol (${PRIMARY_TIMEFRAME}): ${((features.values.realized_vol ?? 0) * 100).toFixed(3)}%`,
    `5-bar momentum (${PRIMARY_TIMEFRAME}): ${(extra.momentum_5 * 100).toFixed(3)}%`,
  ];
  const supporting: string[] = [];
  const contradictory: string[] = [];

  if (dataQuality < DATA_QUALITY_THRESHOLD) {
    contradictory.push(
      `Data quality ${(dataQuality * 100).toFixed(0)}% below ${(DATA_QUALITY_THRESHOLD * 100).toFixed(0)}% threshold`
    );
  } else {
    supporting.push("Public feed healthy and within quality band");
  }
  for (const r of qSnap.reasons) {
    contradictory.push(`quality:${r}`);
  }
  if (primaryCloses.length < 10) {
    contradictory.push(
      `Insufficient ${PRIMARY_TIMEFRAME} history (${primaryCloses.length} bars)`
    );
  }

  const signalBlock = {
    direction: inference.direction,
    label: (inference.direction === "long"
      ? "LONG"
      : inference.direction === "short"
        ? "SHORT"
        : "NO TRADE") as "NO TRADE" | "LONG" | "SHORT",
    confidence: inference.confidence,
    modelVersion: inference.modelVersion,
    explanation: {
      what: "NO TRADE — human remains final decision maker",
      why,
      supporting,
      contradictory,
      calibrationNote:
        "Placeholder baseline — no directional bias until a validated model is promoted",
    },
  };

  const chartCandles = primaryCandles.slice(-48).map((c) => ({
    openTime: c.openTime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));

  const marketState: MarketState = {
    symbol: SYMBOL,
    price: lastPrice,
    change24h: 0,
    regime,
    dataQuality,
    qualitySnapshot: qSnap,
    lastUpdate: trade.tradeTime,
    systemHealth,
    features: {
      return_1: features.values.return_1,
      realized_vol: features.values.realized_vol,
      volume_intensity: features.values.volume_intensity,
      momentum_5: extra.momentum_5,
      range_position: extra.range_position,
      price: features.values.price ?? lastPrice,
    },
    signal: signalBlock,
    priceHistory: primaryCloses.slice(-48),
    candles: chartCandles,
    source: activeSource,
    timeframe: PRIMARY_TIMEFRAME,
  };
  publishMarketState(marketState);

  if (inference.direction !== null && dataQuality >= DATA_QUALITY_THRESHOLD) {
    const signal: Signal = {
      signalId: randomUUID(),
      timestamp: trade.tradeTime,
      direction: inference.direction,
      confidence: inference.confidence,
      regime: regime.regime,
      featureSetId: features.featureSetId,
      modelVersion: inference.modelVersion,
      explanation: {
        what: `${inference.direction} bias`,
        why: [`baseline model on ${PRIMARY_TIMEFRAME}`],
        supporting: [],
        contradictory: qSnap.reasons.map((r) => `quality:${r}`),
        confidence: inference.confidence,
        calibrationNote: "placeholder baseline — no real calibration yet",
        dataQuality,
        featureSetId: features.featureSetId,
        modelVersion: inference.modelVersion,
      },
      invalidation: { dataQualityBelow: DATA_QUALITY_THRESHOLD },
      dataQuality,
      createdAt: new Date().toISOString(),
    };
    publishSignal(signal);
  }
}

function startMockFeed() {
  console.log("[worker] MOCK feed active (USE_MOCK_FEED=true)");
  activeSource = "mock";
  // Faster mock so 1m/15m bars form during local testing
  setInterval(() => {
    const change = (Math.random() - 0.5) * 40;
    const price = Math.max(1000, (lastPrice || 65000) + change);
    const qty = Math.random() * 0.5 + 0.01;
    const now = new Date().toISOString();
    processTrade({
      tradeId: randomUUID(),
      exchange: PRIMARY_EXCHANGE,
      symbol: SYMBOL,
      price,
      quantity: qty,
      side: Math.random() > 0.5 ? "buy" : "sell",
      tradeTime: now,
      receivedAt: now,
    });
  }, 400);
}

function startRealFeed(): BinanceTradeFeed {
  console.log("[worker] REAL Binance public WebSocket feed");
  activeSource = "binance-public-ws";
  const feed = new BinanceTradeFeed({
    onTrade: (trade) => processTrade(trade),
    onStatus: ({ connected, reason, reconnectAttempt }) => {
      feedConnected = connected;
      quality.onConnectionStatus(connected, reason);
      if (!connected) {
        console.warn(
          `[worker] Feed disconnected reason=${reason} attempt=${reconnectAttempt ?? "-"}`
        );
      }
    },
  });
  feed.start();
  setInterval(() => quality.onSilence(feed.getSilenceMs()), 5_000);
  return feed;
}

function startHealthServer(_feed: BinanceTradeFeed | null) {
  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/healthz") {
      const snap = quality.getSnapshot();
      const primary = candles.getPrimaryCloses();
      const body = {
        status: snap.score >= DATA_QUALITY_THRESHOLD ? "ok" : "degraded",
        feed: USE_MOCK ? "mock" : feedConnected ? "connected" : "disconnected",
        dataQuality: snap,
        lastPrice,
        symbol: SYMBOL,
        redisReady,
        source: activeSource,
        timeframe: PRIMARY_TIMEFRAME,
        primaryBars: primary.length,
        forming15m: candles.getForming15m()?.openTime ?? null,
        timestamp: new Date().toISOString(),
      };
      res.writeHead(snap.score >= 0.5 ? 200 : 503, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(HEALTH_PORT, () => {
    console.log(`[worker] Health endpoint http://0.0.0.0:${HEALTH_PORT}/health`);
  });
  return server;
}

async function main() {
  console.log("[worker] BTC Scalping Intelligence Worker starting...");
  console.log(`[worker] Redis: ${REDIS_URL}`);
  console.log(`[worker] USE_MOCK_FEED=${USE_MOCK}`);
  console.log(`[worker] Primary timeframe: ${PRIMARY_TIMEFRAME}`);
  await initPersistence();

  // Reconstruct 15m from stored 1m on restart when DB is available
  try {
    const hist = await loadRecent1mCandles();
    if (hist.length) {
      candles.seedFrom1m(hist);
      console.log(`[worker] Seeded ${hist.length} 1m bars → ${candles.getPrimaryCloses().length} 15m closes`);
    }
  } catch (err) {
    console.warn("[worker] seed from DB skipped", (err as Error).message);
  }

  redisReady = await safeConnect(redis);
  let feed: BinanceTradeFeed | null = null;
  if (USE_MOCK) startMockFeed();
  else feed = startRealFeed();
  const healthServer = startHealthServer(feed);
  const shutdown = () => {
    console.log("[worker] Shutting down");
    feed?.stop();
    healthServer.close();
    redis.quit().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[worker] Fatal", err);
  process.exit(1);
});
