/**
 * Public REST kline bootstrap — no API keys.
 * Prefer Binance.US (works in restricted regions); fall back to global.
 */
import type { Candle, Exchange } from "@btc/shared";
import { PRIMARY_EXCHANGE, SYMBOL } from "@btc/shared";

const ENDPOINTS = [
  "https://api.binance.us/api/v3/klines",
  "https://data-api.binance.vision/api/v3/klines",
  "https://api.binance.com/api/v3/klines",
];

type RawKline = [
  number, // open time
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // close time
  ...unknown[]
];

async function fetchKlines(
  interval: "1m" | "15m",
  limit: number
): Promise<RawKline[]> {
  const qs = `symbol=${SYMBOL}&interval=${interval}&limit=${limit}`;
  let lastErr = "";
  for (const base of ENDPOINTS) {
    try {
      const res = await fetch(`${base}?${qs}`, {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        lastErr = `${base} HTTP ${res.status}`;
        continue;
      }
      const data = (await res.json()) as RawKline[];
      if (!Array.isArray(data) || data.length === 0) {
        lastErr = `${base} empty`;
        continue;
      }
      return data;
    } catch (e) {
      lastErr = `${base} ${(e as Error).message}`;
    }
  }
  throw new Error(`kline bootstrap failed: ${lastErr}`);
}

function toCandle(
  row: RawKline,
  interval: "1m" | "15m",
  exchange: Exchange = PRIMARY_EXCHANGE
): Candle {
  return {
    exchange,
    symbol: SYMBOL,
    interval,
    openTime: new Date(row[0]).toISOString(),
    open: parseFloat(row[1]),
    high: parseFloat(row[2]),
    low: parseFloat(row[3]),
    close: parseFloat(row[4]),
    volume: parseFloat(row[5]),
    closed: true,
  };
}

/** Fetch closed 1m bars for aggregator.seedFrom1m */
export async function fetchHistorical1m(limit = 500): Promise<Candle[]> {
  const rows = await fetchKlines("1m", limit);
  // Drop the last bar — it may still be forming on the exchange
  const closed = rows.slice(0, -1);
  return closed.map((r) => toCandle(r, "1m"));
}

/** Optional direct 15m seed (chart speed); aggregator prefers 1m rollup */
export async function fetchHistorical15m(limit = 100): Promise<Candle[]> {
  const rows = await fetchKlines("15m", limit);
  const closed = rows.slice(0, -1);
  return closed.map((r) => toCandle(r, "15m"));
}
