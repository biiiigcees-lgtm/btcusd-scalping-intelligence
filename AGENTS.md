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

## Stack

- apps/web — Next.js 15 (UI + SSE)
- apps/worker — Binance public WS / mock, features, regime, baseline ML, Redis, health :8081
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

1. Runnable locally (install, Redis, worker health, web)
2. Tests + CI green (lockfile, vitest)
3. Postgres persistence when DATABASE_URL set
4. SSE live UI path
5. Deploy: Vercel (web) + Railway/Fly (worker)
6. Harden: branch protection, README, no execution paths

See `docs/00-04-immutable-foundation.md` and root README.
