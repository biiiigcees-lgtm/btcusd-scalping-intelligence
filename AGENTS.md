# Agent Instructions — BTCUSD Scalping Intelligence

You are Principal Engineer on this repo. Non-executing quantitative research & decision-support only.

## Non-negotiables

- Never execute trades or add broker/exchange private keys
- Default state = NO TRADE
- data_quality < 0.85 ⇒ suppress directional signals **and** anticipation display score
- Baseline model must not emit long/short until research promotion
- Public market data only for live feeds
- Smallest correct change; no drive-by refactors
- Human remains final decision maker
- Directional signal and anticipation gauge are **independent** — never merge them

## Architecture (Phase 05+)

- **Worker is the single source of truth.** Publishes full `MarketState` to Redis.
- **Web never recomputes** / never polls exchanges. Redis-only SSE; fail loud if degraded.
- **Primary TF = 15m.** Chart = lightweight-charts candlesticks.
- **Directional** = `@btc/ml-lorentzian` gated KNN (Wilson ≥ 68%, quality, cooldown).
- **Anticipation** = squeeze + volume accel + range extreme (not direction).
- `@btc/ml` baseline remains safe NO TRADE fallback.

## Priority order when continuing work

1. ~~Architecture single source of truth~~
2. ~~15m native aggregation~~
3. ~~Real chart (lightweight-charts)~~
4. ~~Lorentzian classifier + directional gauge~~
5. ~~Anticipation gauge~~
6. Feed hot-standby + auto-retrain / circuit breaker
7. Notifications (confirm scope)

## Quick verify

```bash
pnpm install
docker compose up -d
USE_MOCK_FEED=true pnpm --filter @btc/worker dev
pnpm --filter @btc/web dev
pnpm --filter @btc/features test
pnpm --filter @btc/ml-lorentzian test
```
