import { describe, it, expect } from "vitest";
import { CandleAggregator } from "./aggregator";
import type { Trade } from "@btc/shared";

function tradeAt(iso: string, price: number, qty = 0.1): Trade {
  return {
    tradeId: iso + price,
    exchange: "binance",
    symbol: "BTCUSDT",
    price,
    quantity: qty,
    side: "buy",
    tradeTime: iso,
    receivedAt: iso,
  };
}

describe("CandleAggregator", () => {
  it("builds 1m bars and rolls into 15m", () => {
    const agg = new CandleAggregator();
    // 15 consecutive 1m windows starting at a clean 15m boundary
    const base = Date.parse("2026-08-15T12:00:00.000Z");

    let closed15Count = 0;
    for (let i = 0; i < 15; i++) {
      const t = new Date(base + i * 60_000).toISOString();
      const { closed1m, closed15m } = agg.onTrade(tradeAt(t, 65000 + i, 1));
      if (i > 0) expect(closed1m).toBeDefined();
      if (closed15m) closed15Count++;
    }
    // After the 15th 1m that ends the window, 15m should close
    // The close happens when next 1m would start past the 15m boundary
    const endTrade = tradeAt(new Date(base + 15 * 60_000).toISOString(), 65100, 1);
    const { closed15m } = agg.onTrade(endTrade);
    if (closed15m) closed15Count++;

    expect(closed15Count).toBeGreaterThanOrEqual(1);
    const primary = agg.getPrimaryCloses();
    expect(primary.length).toBeGreaterThanOrEqual(1);
  });

  it("seeds from historical 1m bars", () => {
    const agg = new CandleAggregator();
    const base = Date.parse("2026-08-15T10:00:00.000Z");
    const bars = [];
    for (let i = 0; i < 30; i++) {
      bars.push({
        exchange: "binance" as const,
        symbol: "BTCUSDT",
        interval: "1m" as const,
        openTime: new Date(base + i * 60_000).toISOString(),
        open: 64000,
        high: 64100,
        low: 63900,
        close: 64050 + i,
        volume: 1,
        closed: true,
      });
    }
    agg.seedFrom1m(bars);
    expect(agg.getPrimaryCloses().length).toBeGreaterThanOrEqual(1);
  });
});
