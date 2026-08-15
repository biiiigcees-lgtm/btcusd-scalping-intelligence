/**
 * Market Data + Feature + Inference Worker
 * Single source of truth for market_state published to Redis.
 * Primary TF = 15m. Hot-standby feeds. Lorentzian + anticipation. Circuit breaker.
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
import { calculateMvpFeatures, computeAnticipation } from "@btc/features";
import { detectRegime } from "@btc/regime";
import { inferBaseline } from "@btc/ml";
import {
  LorentzianClassifier,
  gateInference,
  MODEL_VERSION as LORENTZIAN_VERSION,
  type GatedSignal,
  type Ohlcv,
} from "@btc/ml-lorentzian";
import type { Trade, MarketState, Signal, SystemHealth } from "@btc/shared";
import { randomUUID } from "crypto";
import { FeedManager } from "./feeds/manager";
import { DataQualityTracker } from "./quality/data-quality";
import { CandleAggregator } from "./candles/aggregator";
import { CircuitBreaker } from "./circuit-breaker";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const USE_MOCK = process.env.USE_MOCK_FEED === "true";
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 8081);

const redis = createRedis(REDIS_URL);
let redisReady = false;
const quality = new DataQualityTracker();
const candles = new CandleAggregator();
const lorentzian = new LorentzianClassifier();
const circuit = new CircuitBreaker(LORENTZIAN_VERSION);

let lastPrice = 0;
let feedConnected = false;
let activeSource = USE_MOCK ? "mock" : "binance-global";
let lastGated: GatedSignal | null = null;
let feedManager: FeedManager | null = null;

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

function barsToOhlcv(): Ohlcv[] {
  return candles.getPrimaryCandles().map((c) => ({
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

function runLorentzian(dataQuality: number): GatedSignal {
  const ohlcv = barsToOhlcv();
  lorentzian.setBars(ohlcv);
  const inference = lorentzian.infer();
  let gated = gateInference(inference, dataQuality);

  // Circuit breaker overrides any directional output
  if (circuit.shouldSuppressDirectional() && gated.direction !== null) {
    const st = circuit.getState();
    gated = {
      direction: null,
      label: "NO TRADE",
      confidence: 0,
      modelVersion: gated.modelVersion,
      explanation: {
        what: "NO TRADE — circuit breaker open (live performance drift)",
        why: [
          ...gated.explanation.why,
          `Circuit: ${st.reason}`,
          st.liveHitRate != null
            ? `Live hit rate ${(st.liveHitRate * 100).toFixed(1)}% over ${st.sampleSize} samples`
            : "Insufficient live samples",
        ],
        supporting: gated.explanation.supporting,
        contradictory: [
          ...gated.explanation.contradictory,
          "circuit_breaker_open",
        ],
        calibrationNote: gated.explanation.calibrationNote,
      },
    };
  }
  return gated;
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

function processTrade(trade: Trade, source?: string) {
  if (source) {
    activeSource = source;
    quality.setActiveSource(source);
  }
  quality.onTrade(trade.tradeTime, trade.receivedAt);
  persistTrade(trade).catch(() => {});
  lastPrice = trade.price;

  const { closed1m, closed15m } = candles.onTrade(trade);
  if (closed1m) persistCandle(closed1m).catch(() => {});
  if (closed15m) {
    persistCandle(closed15m).catch(() => {});
    const dataQuality = quality.getScore();
    lastGated = runLorentzian(dataQuality);

    if (lastGated.direction !== null) {
      const signal: Signal = {
        signalId: randomUUID(),
        timestamp: trade.tradeTime,
        direction: lastGated.direction,
        confidence: lastGated.confidence,
        regime: "unknown",
        featureSetId: "00000000-0000-0000-0000-000000000002",
        modelVersion: lastGated.modelVersion,
        explanation: {
          what: lastGated.explanation.what,
          why: lastGated.explanation.why,
          supporting: lastGated.explanation.supporting,
          contradictory: lastGated.explanation.contradictory,
          confidence: lastGated.confidence,
          calibrationNote: lastGated.explanation.calibrationNote,
          dataQuality,
          featureSetId: "00000000-0000-0000-0000-000000000002",
          modelVersion: lastGated.modelVersion,
        },
        invalidation: { dataQualityBelow: DATA_QUALITY_THRESHOLD },
        dataQuality,
        createdAt: new Date().toISOString(),
      };
      publishSignal(signal);
    }
  }

  const primaryCloses = candles.getPrimaryCloses();
  const primaryCandles = candles.getPrimaryCandles();
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

  const anticipationRaw = computeAnticipation(
    primaryCandles.map((c) => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))
  );
  const anticipation =
    dataQuality < DATA_QUALITY_THRESHOLD
      ? {
          ...anticipationRaw,
          score: 0,
          label: "quiet" as const,
          explanation: {
            ...anticipationRaw.explanation,
            what: "Suppressed — data quality below threshold",
            contradictory: [
              ...anticipationRaw.explanation.contradictory,
              `data_quality ${(dataQuality * 100).toFixed(0)}% < ${(DATA_QUALITY_THRESHOLD * 100).toFixed(0)}%`,
            ],
          },
        }
      : anticipationRaw;

  let signalBlock: MarketState["signal"];
  if (lastGated) {
    signalBlock = {
      direction: lastGated.direction,
      label: lastGated.label,
      confidence: lastGated.confidence,
      modelVersion: lastGated.modelVersion,
      explanation: lastGated.explanation,
    };
  } else {
    const baseline = inferBaseline(features, dataQuality);
    signalBlock = {
      direction: baseline.direction,
      label: "NO TRADE",
      confidence: baseline.confidence,
      modelVersion: baseline.modelVersion,
      explanation: {
        what: "NO TRADE — waiting for Lorentzian readiness / 15m history",
        why: [
          "Baseline fallback until classifier has sufficient labeled history",
          `Timeframe: ${PRIMARY_TIMEFRAME}`,
          `Primary bars: ${primaryCloses.length}`,
        ],
        supporting: [],
        contradictory:
          dataQuality < DATA_QUALITY_THRESHOLD
            ? [`data_quality ${(dataQuality * 100).toFixed(0)}% below threshold`]
            : [],
        calibrationNote: "Human remains final decision maker",
      },
    };
  }

  // Surface circuit state in explanation when open
  if (circuit.shouldSuppressDirectional() && signalBlock) {
    const st = circuit.getState();
    signalBlock = {
      ...signalBlock,
      direction: null,
      label: "NO TRADE",
      confidence: 0,
      explanation: {
        ...signalBlock.explanation,
        what: "NO TRADE — circuit breaker open",
        contradictory: [
          ...signalBlock.explanation.contradictory,
          st.reason,
        ],
      },
    };
  }

  const systemHealth: SystemHealth =
    dataQuality >= DATA_QUALITY_THRESHOLD
      ? "healthy"
      : dataQuality >= 0.6
        ? "degraded"
        : "critical";

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
    anticipation,
    priceHistory: primaryCloses.slice(-48),
    candles: chartCandles,
    source: activeSource,
    timeframe: PRIMARY_TIMEFRAME,
  };
  publishMarketState(marketState);
}

function startMockFeed() {
  console.log("[worker] MOCK feed active (USE_MOCK_FEED=true)");
  activeSource = "mock";
  quality.setActiveSource("mock");
  setInterval(() => {
    const change = (Math.random() - 0.5) * 40;
    const price = Math.max(1000, (lastPrice || 65000) + change);
    const qty = Math.random() * 0.5 + 0.01;
    const now = new Date().toISOString();
    processTrade(
      {
        tradeId: randomUUID(),
        exchange: PRIMARY_EXCHANGE,
        symbol: SYMBOL,
        price,
        quantity: qty,
        side: Math.random() > 0.5 ? "buy" : "sell",
        tradeTime: now,
        receivedAt: now,
      },
      "mock"
    );
  }, 400);
}

function startRealFeeds() {
  console.log("[worker] REAL feeds — primary + hot standby");
  feedManager = new FeedManager({
    onTrade: (trade, source) => {
      feedConnected = true;
      processTrade(trade, source);
    },
    onActiveSourceChange: (source, reason) => {
      activeSource = source;
      quality.onSourceSwitch(source, reason);
    },
    onStatus: ({ source, connected, reason }) => {
      quality.onConnectionStatus(connected, reason);
      if (!connected) {
        console.warn(`[worker] Feed ${source} disconnected reason=${reason}`);
      }
      feedConnected = feedManager?.isAnyConnected() ?? false;
    },
  });
  feedManager.start();
  activeSource = feedManager.getActiveSource();
  quality.setActiveSource(activeSource);
  setInterval(() => {
    if (feedManager) quality.onSilence(feedManager.getSilenceMs());
  }, 5_000);
}

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/healthz") {
      const snap = quality.getSnapshot();
      const primary = candles.getPrimaryCloses();
      const body = {
        status: snap.score >= DATA_QUALITY_THRESHOLD ? "ok" : "degraded",
        feed: USE_MOCK
          ? "mock"
          : feedConnected
            ? "connected"
            : "disconnected",
        dataQuality: snap,
        lastPrice,
        symbol: SYMBOL,
        redisReady,
        source: activeSource,
        timeframe: PRIMARY_TIMEFRAME,
        primaryBars: primary.length,
        lorentzianBars: lorentzian.getBarCount(),
        lastSignal: lastGated?.label ?? "NONE",
        circuit: circuit.getState(),
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
  console.log(
    "[worker] Classifier: Lorentzian KNN · anticipation · hot-standby · circuit breaker"
  );
  await initPersistence();

  try {
    const hist = await loadRecent1mCandles();
    if (hist.length) {
      candles.seedFrom1m(hist);
      lorentzian.setBars(barsToOhlcv());
      console.log(
        `[worker] Seeded ${hist.length} 1m bars → ${candles.getPrimaryCloses().length} 15m · lorentzian ${lorentzian.getBarCount()} bars`
      );
    }
  } catch (err) {
    console.warn("[worker] seed from DB skipped", (err as Error).message);
  }

  redisReady = await safeConnect(redis);
  if (USE_MOCK) startMockFeed();
  else startRealFeeds();
  const healthServer = startHealthServer();
  const shutdown = () => {
    console.log("[worker] Shutting down");
    feedManager?.stop();
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
