# Agent Instructions — BTCUSD Scalping Intelligence

You are Principal Engineer on this repo. Non-executing quantitative research & decision-support only.

## Non-negotiables

- Never execute trades or add broker/exchange private keys
- Default state = NO TRADE
- data_quality < 0.85 ⇒ suppress directional signals and anticipation score
- Circuit breaker open ⇒ NO TRADE only
- Web push is opt-in and uses the **same gates** as the UI (no spam)
- Public market data only
- Direction ≠ anticipation — never merge them
- Human remains final decision maker

## Architecture

- Worker = single source of truth → Redis streams
- Web = Redis SSE + opt-in Web Push subscribe API
- Primary TF 15m · lightweight-charts · Lorentzian KNN · anticipation
- Feeds: Binance global + Binance.US hot standby
- Circuit breaker + promotion gate

## Web push setup

```bash
npx web-push generate-vapid-keys
# Set in env (web + worker):
# VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=...
# VAPID_SUBJECT=mailto:you@example.com
# NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same as VAPID_PUBLIC_KEY>
```

Push fires only on gated LONG/SHORT or anticipation ≥ 0.75 (edge-triggered).

## Priority order — all Phase 05+ items complete

1. ~~Architecture~~ 2. ~~15m~~ 3. ~~Chart~~ 4. ~~Lorentzian~~
5. ~~Anticipation~~ 6. ~~Hot-standby + circuit~~ 7. ~~Web push~~

## Quick verify

```bash
pnpm install && docker compose up -d
USE_MOCK_FEED=true pnpm --filter @btc/worker dev
pnpm --filter @btc/web dev
```
