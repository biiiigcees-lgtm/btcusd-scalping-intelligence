# Agent Instructions — BTCUSD Scalping Intelligence

You are Principal Engineer on this repo. Non-executing quantitative research & decision-support only.

## Non-negotiables

- Never execute trades or add broker/exchange private keys
- Default state = NO TRADE
- data_quality < 0.85 ⇒ suppress directional signals
- Baseline model must not emit long/short until research promotion
- Public market data only for live feeds
- Smallest correct change; no drive-by refactors
- Human remains final decision maker

## Architecture (Phase 05+)

- **Worker is the single source of truth.** It alone talks to exchanges, computes features/regime/quality/ML, and publishes `stream:market_state`.
- **Web never recomputes** and never polls exchanges. `/api/v1/stream` is Redis-only; if Redis is down → degraded, fail loud.
- Real `DataQualityTracker` score (latency + silence + reconnects) is what the UI displays — never a candle-count proxy.
- Dashboard is gated by `DASHBOARD_SECRET` (cookie or `x-dashboard-secret` header) when that env var is set.
- **Primary timeframe = 15m.** Trades → 1m → 15m. Features, regime, and signals evaluate on 15m closes. Every UI surface labels the TF.

## Stack

- apps/web — Next.js 15 (UI + SSE relay)
- apps/worker — Binance public WS / mock, candle aggregation, features, regime, baseline ML, Redis, health :8081
- packages/shared, features, regime, ml, db, config
- pnpm + Turborepo + docker-compose (Timescale + Redis)

## Quick verify

```bash
pnpm install
docker compose up -d   # or set REDIS_URL
USE_MOCK_FEED=true pnpm --filter @btc/worker dev
pnpm --filter @btc/web dev
curl -sS http://localhost:8081/health
```

## Priority order when continuing work

1. ~~Architecture single source of truth~~ (done)
2. ~~15m native aggregation~~ (done)
3. Real chart (TradingView lightweight-charts, 15m candles)
4. Lorentzian classifier + directional gauge
5. Anticipation gauge
6. Feed hot-standby + auto-retrain / circuit breaker
7. Notifications (confirm scope)

See `docs/` and root README.
