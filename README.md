# BTCUSD AI Scalping Intelligence Assistant

**Non-executing · Explainable · Human-supervised** quantitative research & decision-support for BTCUSD short-term intelligence.

> Default state = **NO TRADE**. Never executes trades. Never requires exchange private keys.

## Open in VS Code

```bash
git clone https://github.com/biiiigcees-lgtm/btcusd-scalping-intelligence.git
cd btcusd-scalping-intelligence
code .
```

Or: GitHub → **Code** → **Codespaces** → Create on `main`.

Agent instructions: see `AGENTS.md` (and `.github/copilot-instructions.md`).

## Quick Start

```bash
pnpm install
cp .env.example .env.local
docker compose up -d          # Redis + Postgres (or set REDIS_URL to Upstash)
USE_MOCK_FEED=true pnpm --filter @btc/worker dev
pnpm --filter @btc/web dev
```

- UI: http://localhost:3000
- Worker health: http://localhost:8081/health

Set `DASHBOARD_SECRET` in production; then open `/?key=<secret>` once to set the cookie, or send `x-dashboard-secret` header.

## Architecture (Phase 05+)

| Component | Role |
|-----------|------|
| `apps/worker` | **Single source of truth** — Binance public WS / mock, features, regime, quality, baseline ML → Redis `stream:market_state` |
| `apps/web` | Next.js 15 UI + SSE **relay only** (no exchange polling, no recompute) |
| `packages/*` | shared, features, regime, ml, db, config |
| `docs/` | Foundation 00–04 (locked) |

If Redis/worker is down the UI shows **degraded** and does not fall back to direct exchange calls.

## Constraints

- No trade execution
- Data quality < 0.85 → NO TRADE
- Baseline model emits no direction until research promotion
- Public market data only
- Worker is the only process that talks to exchanges

See `AGENTS.md` for agent/engineering workflow and remaining Phase 05+ priority order.
