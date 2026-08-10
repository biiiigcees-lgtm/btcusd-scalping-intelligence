/**
 * Server-side market intelligence using public Binance data only.
 * Mirrors worker packages (features / regime / baseline ML) so the Vercel
 * deployment is production-useful without Redis or a long-running worker.
 */

export type Regime =
  | "trending_up"
  | "trending_down"
  | "ranging"
  | "high_volatility"
  | "low_liquidity"
  | "unknown";

export type SystemHealth = "healthy" | "degraded" | "critical";

export interface MarketSnapshot {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h: number;
  regime: {
    regime: Regime;
    confidence: number;
    evidence: Record<string, number | string>;
  };
  dataQuality: number;
  systemHealth: SystemHealth;
  lastUpdate: string;
  features: {
    return_1: number;
    realized_vol: number;
    volume_intensity: number;
    momentum_5: number;
    range_position: number;
  };
  signal: {
    direction: "long" | "short" | null;
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
  sparkline: number[];
  source: "binance-public";
}

const SYMBOL = "BTCUSDT";
const DATA_QUALITY_THRESHOLD = 0.85;
const MODEL_VERSION = "0.0.0-baseline";

function calcFeatures(closes: number[], volumes: number[]) {
  if (closes.length < 3) {
    return {
      return_1: 0,
      realized_vol: 0,
      volume_intensity: 0,
      momentum_5: 0,
      range_position: 0.5,
    };
  }

  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const return_1 = prev !== 0 ? (last - prev) / prev : 0;

  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const p = closes[i - 1];
    if (p !== 0) returns.push((closes[i] - p) / p);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(returns.length, 1);
  const realized_vol = Math.sqrt(variance);

  const volMean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const lastVol = volumes[volumes.length - 1] || 0;
  const volume_intensity = volMean > 0 ? lastVol / volMean : 0;

  const lookback = Math.min(5, closes.length - 1);
  const base = closes[closes.length - 1 - lookback];
  const momentum_5 = base !== 0 ? (last - base) / base : 0;

  const window = closes.slice(-30);
  const hi = Math.max(...window);
  const lo = Math.min(...window);
  const range_position = hi > lo ? (last - lo) / (hi - lo) : 0.5;

  return { return_1, realized_vol, volume_intensity, momentum_5, range_position };
}

function detectRegime(
  realizedVol: number,
  directionalStrength: number,
  timestamp: string
) {
  let regime: Regime = "unknown";
  let confidence = 0.45;
  const evidence: Record<string, number | string> = {
    realizedVol,
    directionalStrength,
  };

  if (realizedVol > 0.004) {
    regime = "high_volatility";
    confidence = 0.72;
  } else if (Math.abs(directionalStrength) > 0.0025) {
    regime = directionalStrength > 0 ? "trending_up" : "trending_down";
    confidence = 0.68;
  } else if (realizedVol < 0.0012) {
    regime = "ranging";
    confidence = 0.62;
  } else {
    regime = "unknown";
    confidence = 0.4;
  }

  return { timestamp, regime, confidence, evidence };
}

/** Baseline never emits direction until research promotes a model. */
function inferBaseline(
  dataQuality: number,
  features: ReturnType<typeof calcFeatures>
) {
  const volPct = (features.realized_vol * 100).toFixed(3);
  const momPct = (features.momentum_5 * 100).toFixed(3);
  const why = [
    "Baseline model is locked at NO TRADE until research promotion",
    "Realized vol (1m window): " + volPct + "%",
    "5-bar momentum: " + momPct + "%",
  ];
  const supporting: string[] = [];
  const contradictory: string[] = [];

  if (dataQuality < DATA_QUALITY_THRESHOLD) {
    contradictory.push(
      "Data quality " +
        (dataQuality * 100).toFixed(0) +
        "% below " +
        (DATA_QUALITY_THRESHOLD * 100).toFixed(0) +
        "% threshold"
    );
  } else {
    supporting.push("Public feed healthy and within quality band");
  }

  if (Math.abs(features.momentum_5) > 0.003) {
    supporting.push(
      features.momentum_5 > 0
        ? "Short-horizon momentum leaning up (informational only)"
        : "Short-horizon momentum leaning down (informational only)"
    );
  }

  return {
    direction: null as "long" | "short" | null,
    label: "NO TRADE" as const,
    confidence: 0,
    modelVersion: MODEL_VERSION,
    explanation: {
      what: "NO TRADE — human remains final decision maker",
      why,
      supporting,
      contradictory,
      calibrationNote:
        "Placeholder baseline — no directional bias until a validated model is promoted",
    },
  };
}

export async function fetchLiveMarket(): Promise<MarketSnapshot> {
  const [tickerRes, klinesRes] = await Promise.all([
    fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=" + SYMBOL, {
      next: { revalidate: 0 },
      cache: "no-store",
    }),
    fetch(
      "https://api.binance.com/api/v3/klines?symbol=" +
        SYMBOL +
        "&interval=1m&limit=60",
      { next: { revalidate: 0 }, cache: "no-store" }
    ),
  ]);

  if (!tickerRes.ok || !klinesRes.ok) {
    throw new Error(
      "Binance public API error ticker=" +
        tickerRes.status +
        " klines=" +
        klinesRes.status
    );
  }

  const ticker = (await tickerRes.json()) as {
    lastPrice: string;
    priceChangePercent: string;
    highPrice: string;
    lowPrice: string;
    volume: string;
    quoteVolume: string;
  };

  const klines = (await klinesRes.json()) as Array<
    [number, string, string, string, string, string, ...unknown[]]
  >;

  const closes = klines.map((k) => parseFloat(k[4]));
  const volumes = klines.map((k) => parseFloat(k[5]));
  const price = parseFloat(ticker.lastPrice);
  const change24h = parseFloat(ticker.priceChangePercent);
  const high24h = parseFloat(ticker.highPrice);
  const low24h = parseFloat(ticker.lowPrice);
  const volume24h = parseFloat(ticker.volume);
  const quoteVolume24h = parseFloat(ticker.quoteVolume);

  const features = calcFeatures(closes, volumes);
  const now = new Date().toISOString();

  const dataQuality = closes.length >= 30 ? 0.92 : closes.length >= 10 ? 0.8 : 0.55;
  const regime = detectRegime(features.realized_vol, features.momentum_5, now);
  const signal = inferBaseline(dataQuality, features);

  const systemHealth: SystemHealth =
    dataQuality >= DATA_QUALITY_THRESHOLD
      ? "healthy"
      : dataQuality >= 0.6
        ? "degraded"
        : "critical";

  const sparkline =
    closes.length > 40
      ? closes.filter((_, i) => i % 2 === 0).slice(-30)
      : closes.slice(-30);

  return {
    symbol: SYMBOL,
    price,
    change24h,
    high24h,
    low24h,
    volume24h,
    quoteVolume24h,
    regime: {
      regime: regime.regime,
      confidence: regime.confidence,
      evidence: regime.evidence,
    },
    dataQuality,
    systemHealth,
    lastUpdate: now,
    features,
    signal,
    sparkline,
    source: "binance-public",
  };
}
