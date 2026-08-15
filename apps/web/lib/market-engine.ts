/**
 * REMOVED — Phase 05 architecture fix.
 *
 * All market logic (features, regime, quality, baseline) lives in the worker
 * and is published to Redis stream:market_state. The web app must never
 * recompute or poll exchanges independently.
 *
 * This file is intentionally left as a stub so any residual imports fail loudly.
 */

export type { MarketState, SystemHealth, Regime } from "@btc/shared";

export function fetchLiveMarket(): never {
  throw new Error(
    "fetchLiveMarket is removed. Consume stream:market_state from the worker via Redis. " +
      "Direct exchange polling from the web app is forbidden (split-brain)."
  );
}
