# Agent Instructions — BTCUSD Scalping Intelligence

You are Principal Engineer on this repo. Non-executing quantitative research & decision-support only.

## Non-negotiables

- Never execute trades or add broker/exchange private keys
- Default state = NO TRADE
- data_quality < 0.85 ⇒ suppress directional signals and anticipation score
- Circuit breaker open ⇒ NO TRADE only (surface clearly in UI/explanations)
- Public market data only for live feeds
- Directional signal and anticipation gauge are independent — never merge them
- Human remains final decision maker
- Smallest correct change; no drive-by refactors

## Architecture (Phase 05+)

- **Worker** = single source of truth → Redis `stream:market_state`
- **Web** = Redis SSE relay only; degraded if Redis down
- **Primary TF** = 15m (trades → 1m → 15m)
- **Chart** = lightweight-charts 15m candles
- **Directional** = `@btc/ml-lorentzian` (Wilson ≥ 68%, quality, cooldown)
- **Anticipation** = squeeze + volume accel + range extreme
- **Feeds** = Binance global primary + Binance.US hot standby; flapping penalized
- **Circuit breaker** = live hit-rate drawdown → NO TRADE; promote only if held-out beats live

## Priority order

1. ~~Architecture single source of truth~~
2. ~~15m native aggregation~~
3. ~~Real chart~~
4. ~~Lorentzian + directional gauge~~
5. ~~Anticipation gauge~~
6. ~~Feed hot-standby + circuit breaker / promotion gate~~
7. Notifications (confirm scope before building)

## Quick verify

```bash
pnpm install
docker compose up -d
USE_MOCK_FEED=true pnpm --filter @btc/worker dev
pnpm --filter @btc/web dev
curl -sS http://localhost:8081/health | jq .
```
