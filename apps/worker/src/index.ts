/**
 * Market Data + Feature + Inference Worker
 * Single source of truth for market_state published to Redis.
 * Web app must never recompute regime/features/quality independently.
 */
import { createRedis, safeConnect } from "./redis";
import { initPersistence, persistTrade, persistSignal } from "./persist";
import http from "http";
import {
  SYMBOL,
  REDIS_STREAMS,
  DATA_QUALITY_THRESHOLD,
  PRIMARY_EXCHANGE,
  PLACEHOLDER_MODEL_VERSION,
  INTERIM_PRICE_HISTORY_TF,
} from "@btc/shared";
import { calculateMvpFeatures } from "@btc/features";
import { detectRegime } from "@btc/regime";
import { inferBaseline } from "@btc/ml";
import type { Trade, MarketState, Signal, SystemHealth } from "@btc/shared";
import { randomUUID } from "crypto";
import { BinanceTradeFeed } from "./feeds/binance";
import { DataQualityTracker } from "./quality/data-quality";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const USE_MOCK = process.env.USE_MOCK_FEED === "true";
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 8081);

const redis = createRedis(REDIS_URL);
let redisReady = false;
const quality = new DataQualityTracker();

const priceBuffer: number[] = [];
const volumeBuffer: number[] = [];
const MAX_BUFFER = 120;
let lastPrice = 0;
let feedConnected = false;
let activeSource = USE_MOCK ? "mock" : "binance-public-ws";

function updateBuffers(price: number, qty: number) {
  priceBuffer.push(price);
  volumeBuffer.push(qty);
  if (priceBuffer.length > MAX_BUFFER) {
    priceBuffer.shift();
    volumeBuffer.shift();
  }
  lastPrice = price;
}

function deriveExtraFeatures(prices: number[], volumes: number[]) {
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
  updateBuffers(trade.price, trade.quantity);

  const dataQuality = quality.getScore();
  const qSnap = quality.getSnapshot();
  const features = calculateMvpFeatures(
    priceBuffer,
    volumeBuffer,
    trade.tradeTime,
    dataQuality
  );
  const extra = deriveExtraFeatures(priceBuffer, volumeBuffer);

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
    `Realized vol: ${((features.values.realized_vol ?? 0) * 100).toFixed(3)}%`,
    `5-bar momentum: ${(extra.momentum_5 * 100).toFixed(3)}%`,
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
    priceHistory:
      priceBuffer.length > 40
        ? priceBuffer.filter((_, i) => i % 2 === 0).slice(-30)
        : priceBuffer.slice(-30),
    source: activeSource,
    timeframe: INTERIM_PRICE_HISTORY_TF,
  };
  publishMarketState(marketState);

  // Baseline currently never emits direction; gate remains for future promotion
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
        why: ["baseline model (research required for real signals)"],
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
  setInterval(() => {
    const change = (Math.random() - 0.5) * 20;
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
  }, 800);
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
      const body = {
        status: snap.score >= DATA_QUALITY_THRESHOLD ? "ok" : "degraded",
        feed: USE_MOCK ? "mock" : feedConnected ? "connected" : "disconnected",
        dataQuality: snap,
        lastPrice,
        symbol: SYMBOL,
        redisReady,
        source: activeSource,
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
  await initPersistence();
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
