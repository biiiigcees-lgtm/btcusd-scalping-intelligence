/**
 * Serverless Tick Engine — Single Source of Truth for Pure Vercel Deployment
 *
 * Fetches public market REST data (15m klines + 24hr ticker + price),
 * executes the exact same shared mathematical models (features, regime, Lorentzian KNN, anticipation),
 * applies quality gates, and caches state in Redis (and memory).
 *
 * Non-negotiables:
 * - NO private API keys
 * - Default state: NO TRADE
 * - dataQuality < 0.85 suppresses directional output
 * - Human remains final decision maker
 */
import {
  SYMBOL,
  REDIS_STREAMS,
  DATA_QUALITY_THRESHOLD,
  type MarketState,
  type Candle,
  type QualitySnapshot,
} from "@btc/shared";
import { calculateMvpFeatures, computeAnticipation } from "@btc/features";
import { detectRegime } from "@btc/regime";
import {
  LorentzianClassifier,
  gateInference,
  type Ohlcv,
} from "@btc/ml-lorentzian";
import { createRedisClient } from "@/lib/redis";
import type { Redis } from "ioredis";

export const REDIS_KEY_LATEST_STATE = "market:state:latest";

// REST endpoint fallbacks (Binance US first to avoid US IP 451 blocks on Vercel)
const REST_HOSTS = [
  "https://api.binance.us",
  "https://data-api.binance.vision",
  "https://api.binance.com",
];

interface RawKline extends Array<number | string> {
  0: number; // Open time
  1: string; // Open
  2: string; // High
  3: string; // Low
  4: string; // Close
  5: string; // Volume
  6: number; // Close time
}

interface RawTicker24h {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

interface RawPriceTicker {
  symbol: string;
  price: string;
}

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

async function fetchWithTimeout<T>(url: string, timeoutMs = 4500): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMarketRestData(): Promise<{
  klines: RawKline[];
  ticker24h: RawTicker24h | null;
  tickerPrice: RawPriceTicker | null;
  hostUsed: string;
}> {
  let lastError: Error | null = null;

  for (const host of REST_HOSTS) {
    try {
      const [klines, ticker24h, tickerPrice] = await Promise.all([
        fetchWithTimeout<RawKline[]>(
          `${host}/api/v3/klines?symbol=${SYMBOL}&interval=15m&limit=100`
        ),
        fetchWithTimeout<RawTicker24h>(
          `${host}/api/v3/ticker/24hr?symbol=${SYMBOL}`
        ).catch(() => null),
        fetchWithTimeout<RawPriceTicker>(
          `${host}/api/v3/ticker/price?symbol=${SYMBOL}`
        ).catch(() => null),
      ]);

      if (Array.isArray(klines) && klines.length > 0) {
        return {
          klines,
          ticker24h,
          tickerPrice,
          hostUsed: host.replace("https://", "").replace("api.", ""),
        };
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("Failed to fetch market data from all REST endpoints");
}

let inflightTick: Promise<MarketState> | null = null;
let memoryCache: { state: MarketState; cachedAt: number } | null = null;

/**
 * Execute a single market tick:
 * Fetches latest REST klines, computes features, regime, Lorentzian signals,
 * applies quality gates, and publishes to Redis.
 */
export async function executeTick(providedRedis?: Redis | null): Promise<MarketState> {
  if (inflightTick) {
    return inflightTick;
  }

  inflightTick = (async () => {
    try {
      const now = new Date();
      const nowIso = now.toISOString();

      const { klines, ticker24h, tickerPrice, hostUsed } =
        await fetchMarketRestData();

      const candles: Candle[] = klines.map((k) => ({
        exchange: "binance",
        symbol: SYMBOL,
        interval: "15m",
        openTime: new Date(k[0]).toISOString(),
        open: parseFloat(String(k[1])),
        high: parseFloat(String(k[2])),
        low: parseFloat(String(k[3])),
        close: parseFloat(String(k[4])),
        volume: parseFloat(String(k[5])),
        closed: true,
      }));

      const latestCandle = candles[candles.length - 1];
      const livePrice = tickerPrice
        ? parseFloat(tickerPrice.price)
        : latestCandle?.close ?? 0;

      const change24h = ticker24h ? parseFloat(ticker24h.priceChangePercent) : 0;
      const high24h = ticker24h ? parseFloat(ticker24h.highPrice) : undefined;
      const low24h = ticker24h ? parseFloat(ticker24h.lowPrice) : undefined;
      const volume24h = ticker24h ? parseFloat(ticker24h.volume) : undefined;
      const quoteVolume24h = ticker24h
        ? parseFloat(ticker24h.quoteVolume)
        : undefined;

      const closes = candles.map((c) => c.close);
      const volumes = candles.map((c) => c.volume);

      // Data Quality assessment
      const lastCandleAgeMs = latestCandle
        ? Date.now() - Date.parse(latestCandle.openTime)
        : Number.POSITIVE_INFINITY;
      // 15m candle should have started within last 60 minutes
      const isFresh = lastCandleAgeMs < 60 * 60_000 && livePrice > 0;
      const hasSufficientBars = candles.length >= 20;

      let dataQuality = 1.0;
      const reasons: string[] = [`source:${hostUsed}`];

      if (!isFresh) {
        dataQuality -= 0.4;
        reasons.push("stale_klines");
      }
      if (!hasSufficientBars) {
        dataQuality -= 0.3;
        reasons.push("insufficient_bars");
      }
      if (livePrice <= 0) {
        dataQuality = 0;
        reasons.push("invalid_price");
      }

      dataQuality = Math.max(0, Math.min(1, dataQuality));

      const qualitySnapshot: QualitySnapshot = {
        score: dataQuality,
        latencyMs: 0,
        silenceMs: 0,
        reconnectsRecent: 0,
        sourceSwitchesRecent: 0,
        activeSource: hostUsed,
        reasons,
        lastHealthyAt: dataQuality >= DATA_QUALITY_THRESHOLD ? nowIso : nowIso,
      };

      // MVP Microstructure features
      const mvpFeatures = calculateMvpFeatures(
        closes,
        volumes.length ? volumes : closes.map(() => 1),
        nowIso,
        dataQuality
      );
      const extra = deriveExtraFeatures(closes);

      // Regime detection
      const regime = detectRegime(
        mvpFeatures.values.realized_vol ?? 0.01,
        mvpFeatures.values.return_1 ?? 0,
        0,
        nowIso
      );

      // Anticipation setup
      const anticipationRaw = computeAnticipation(candles);

      // Lorentzian Classifier Inference & Gating
      const ohlcv: Ohlcv[] = candles.map((c) => ({
        openTime: Date.parse(c.openTime),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      const classifier = new LorentzianClassifier();
      classifier.setBars(ohlcv);
      const rawInference = classifier.infer();
      const gated = gateInference(rawInference, dataQuality);

      const marketState: MarketState = {
        symbol: SYMBOL,
        price: livePrice,
        change24h,
        high24h,
        low24h,
        volume24h,
        quoteVolume24h,
        regime,
        dataQuality,
        qualitySnapshot,
        lastUpdate: nowIso,
        systemHealth: dataQuality >= DATA_QUALITY_THRESHOLD ? "healthy" : "degraded",
        features: {
          return_1: mvpFeatures.values.return_1,
          realized_vol: mvpFeatures.values.realized_vol,
          volume_intensity: mvpFeatures.values.volume_intensity,
          momentum_5: extra.momentum_5,
          range_position: extra.range_position,
          price: livePrice,
        },
        signal: {
          direction: gated.direction,
          label: gated.label,
          confidence: gated.confidence,
          modelVersion: gated.modelVersion,
          explanation: gated.explanation,
        },
        anticipation: {
          score: anticipationRaw.score,
          label: anticipationRaw.label,
          components: anticipationRaw.components,
          explanation: anticipationRaw.explanation,
        },
        priceHistory: closes.slice(-100),
        candles: candles.map((c) => ({
          openTime: c.openTime,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
        source: hostUsed,
        timeframe: "15m",
      };

      memoryCache = { state: marketState, cachedAt: Date.now() };

      // Persist to Redis
      let client = providedRedis;
      let shouldDisconnect = false;
      if (!client && process.env.REDIS_URL?.trim()) {
        try {
          client = createRedisClient();
          await client.connect();
          shouldDisconnect = true;
        } catch {
          client = null;
        }
      }

      if (client) {
        try {
          const payload = JSON.stringify(marketState);
          await Promise.all([
            client.set(REDIS_KEY_LATEST_STATE, payload, "EX", 300),
            client.xadd(
              REDIS_STREAMS.marketState,
              "MAXLEN",
              "~",
              "1000",
              "*",
              "payload",
              payload
            ),
          ]);
        } catch (err) {
          console.warn("[tick] Failed to write state to Redis", (err as Error).message);
        } finally {
          if (shouldDisconnect) {
            try {
              client.disconnect();
            } catch {
              /* ignore */
            }
          }
        }
      }

      return marketState;
    } finally {
      inflightTick = null;
    }
  })();

  return inflightTick;
}

/**
 * Read latest market state from Redis (or memory cache).
 * If missing or older than maxAgeMs (default 60s), triggers on-demand tick.
 */
export async function getOrRefreshMarketState(
  maxAgeMs = 60_000
): Promise<{ state: MarketState; isFresh: boolean; source: "redis" | "memory" | "on-demand" }> {
  let client: Redis | null = null;
  try {
    if (process.env.REDIS_URL?.trim()) {
      client = createRedisClient();
      await client.connect();
      const raw = await client.get(REDIS_KEY_LATEST_STATE);
      if (raw) {
        const state = JSON.parse(raw) as MarketState;
        const ageMs = Date.now() - Date.parse(state.lastUpdate);
        if (ageMs < maxAgeMs) {
          return { state, isFresh: true, source: "redis" };
        }
      }
    }
  } catch (err) {
    console.warn("[getOrRefreshMarketState] Redis read error", (err as Error).message);
  } finally {
    try {
      client?.disconnect();
    } catch {
      /* ignore */
    }
  }

  // Check memory cache
  if (memoryCache && Date.now() - memoryCache.cachedAt < maxAgeMs) {
    return { state: memoryCache.state, isFresh: true, source: "memory" };
  }

  // Trigger on-demand tick
  const state = await executeTick();
  return { state, isFresh: true, source: "on-demand" };
}
