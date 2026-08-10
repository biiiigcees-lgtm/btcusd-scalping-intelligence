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

## Structure

| Path | Role |
|------|------|
| `apps/web` | Next.js 15 UI + SSE |
| `apps/worker` | Binance public WS / mock + features + regime + baseline ML |
| `packages/*` | shared, features, regime, ml, db, config |
| `docs/` | Foundation 00–04 (locked) |

## Constraints

- No trade execution
- Data quality < 0.85 → NO TRADE
- Baseline model emits no direction until research promotion
- Public market data only

See `AGENTS.md` for agent/engineering workflow.
