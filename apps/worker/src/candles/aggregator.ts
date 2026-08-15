/**
 * Trade → 1m → 15m candle aggregation.
 * 15m is the primary evaluation unit (regime, features, ML).
 * 1m is retained for reconstruction / backfill.
 */
import type { Candle, CandleInterval, Exchange, Trade } from "@btc/shared";
import {
  PRIMARY_EXCHANGE,
  SYMBOL,
  PRIMARY_TIMEFRAME,
  BASE_TIMEFRAME,
  PRIMARY_HISTORY_BARS,
  BASE_HISTORY_BARS,
} from "@btc/shared";

function floorToIntervalMs(tsMs: number, intervalMs: number): number {
  return Math.floor(tsMs / intervalMs) * intervalMs;
}

const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "15m": 15 * 60_000,
};

export class CandleAggregator {
  private forming1m: Candle | null = null;
  private forming15m: Candle | null = null;
  private history1m: Candle[] = [];
  private history15m: Candle[] = [];
  private readonly exchange: Exchange;
  private readonly symbol: string;

  constructor(opts?: { exchange?: Exchange; symbol?: string }) {
    this.exchange = opts?.exchange ?? PRIMARY_EXCHANGE;
    this.symbol = opts?.symbol ?? SYMBOL;
  }

  /** Ingest a trade; returns any bars that just closed (1m and/or 15m). */
  onTrade(trade: Trade): { closed1m?: Candle; closed15m?: Candle } {
    const ts = Date.parse(trade.tradeTime);
    if (!Number.isFinite(ts)) return {};

    const closed1m = this.updateForming(
      "1m",
      ts,
      trade.price,
      trade.quantity
    );
    let closed15m: Candle | undefined;

    if (closed1m) {
      this.pushHistory1m(closed1m);
      closed15m = this.rollUpTo15m(closed1m);
      if (closed15m) this.pushHistory15m(closed15m);
    } else {
      // Still update forming 15m with live price even before 1m closes
      this.touchForming15m(ts, trade.price, trade.quantity);
    }

    return { closed1m, closed15m };
  }

  getPrimaryCloses(): number[] {
    const closed = this.history15m.map((c) => c.close);
    if (this.forming15m) return [...closed, this.forming15m.close];
    return closed;
  }

  getPrimaryCandles(): Candle[] {
    const out = [...this.history15m];
    if (this.forming15m) out.push({ ...this.forming15m });
    return out;
  }

  getBaseHistory(): Candle[] {
    return [...this.history1m];
  }

  getForming1m(): Candle | null {
    return this.forming1m ? { ...this.forming1m } : null;
  }

  getForming15m(): Candle | null {
    return this.forming15m ? { ...this.forming15m } : null;
  }

  /** Seed from historical 1m bars (e.g. after restart from DB). */
  seedFrom1m(bars: Candle[]) {
    const sorted = [...bars].sort(
      (a, b) => Date.parse(a.openTime) - Date.parse(b.openTime)
    );
    for (const bar of sorted) {
      if (bar.interval !== "1m" || !bar.closed) continue;
      this.pushHistory1m(bar);
      const closed15 = this.rollUpTo15m(bar);
      if (closed15) this.pushHistory15m(closed15);
    }
  }

  private updateForming(
    interval: "1m",
    tsMs: number,
    price: number,
    qty: number
  ): Candle | undefined {
    const intervalMs = INTERVAL_MS[interval];
    const openMs = floorToIntervalMs(tsMs, intervalMs);
    const openTime = new Date(openMs).toISOString();

    if (!this.forming1m || this.forming1m.openTime !== openTime) {
      let closed: Candle | undefined;
      if (this.forming1m) {
        closed = { ...this.forming1m, closed: true };
      }
      this.forming1m = {
        exchange: this.exchange,
        symbol: this.symbol,
        interval: BASE_TIMEFRAME,
        openTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: qty,
        closed: false,
      };
      return closed;
    }

    this.forming1m.high = Math.max(this.forming1m.high, price);
    this.forming1m.low = Math.min(this.forming1m.low, price);
    this.forming1m.close = price;
    this.forming1m.volume += qty;
    return undefined;
  }

  private touchForming15m(tsMs: number, price: number, qty: number) {
    const intervalMs = INTERVAL_MS["15m"];
    const openMs = floorToIntervalMs(tsMs, intervalMs);
    const openTime = new Date(openMs).toISOString();

    if (!this.forming15m || this.forming15m.openTime !== openTime) {
      // New 15m window started mid-bar without a closed 1m yet
      if (this.forming15m && !this.forming15m.closed) {
        // leave previous forming as incomplete; only closed bars enter history
      }
      this.forming15m = {
        exchange: this.exchange,
        symbol: this.symbol,
        interval: PRIMARY_TIMEFRAME,
        openTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: qty,
        closed: false,
      };
      return;
    }

    this.forming15m.high = Math.max(this.forming15m.high, price);
    this.forming15m.low = Math.min(this.forming15m.low, price);
    this.forming15m.close = price;
    this.forming15m.volume += qty;
  }

  private rollUpTo15m(closed1m: Candle): Candle | undefined {
    const tsMs = Date.parse(closed1m.openTime);
    const intervalMs = INTERVAL_MS["15m"];
    const openMs = floorToIntervalMs(tsMs, intervalMs);
    const openTime = new Date(openMs).toISOString();

    if (!this.forming15m || this.forming15m.openTime !== openTime) {
      let closed: Candle | undefined;
      if (this.forming15m && this.forming15m.openTime !== openTime) {
        closed = { ...this.forming15m, closed: true };
      }
      this.forming15m = {
        exchange: this.exchange,
        symbol: this.symbol,
        interval: PRIMARY_TIMEFRAME,
        openTime,
        open: closed1m.open,
        high: closed1m.high,
        low: closed1m.low,
        close: closed1m.close,
        volume: closed1m.volume,
        closed: false,
      };
      return closed;
    }

    this.forming15m.high = Math.max(this.forming15m.high, closed1m.high);
    this.forming15m.low = Math.min(this.forming15m.low, closed1m.low);
    this.forming15m.close = closed1m.close;
    this.forming15m.volume += closed1m.volume;

    // Close 15m when the 1m bar that ends the 15m window closes
    const next1mOpen = tsMs + INTERVAL_MS["1m"];
    if (next1mOpen >= openMs + intervalMs) {
      const finalized = { ...this.forming15m, closed: true };
      this.forming15m = null;
      return finalized;
    }
    return undefined;
  }

  private pushHistory1m(bar: Candle) {
    this.history1m.push(bar);
    if (this.history1m.length > BASE_HISTORY_BARS) {
      this.history1m = this.history1m.slice(-BASE_HISTORY_BARS);
    }
  }

  private pushHistory15m(bar: Candle) {
    this.history15m.push(bar);
    if (this.history15m.length > PRIMARY_HISTORY_BARS) {
      this.history15m = this.history15m.slice(-PRIMARY_HISTORY_BARS);
    }
  }
}
