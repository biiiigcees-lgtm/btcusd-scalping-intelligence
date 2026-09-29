# Kalshi Quantitative Terminal Module

**Status:** Integrated (PUBLIC_PROXY)  
**Execution:** None — decision-support only  
**Series:** `KXBTC15M` (BTC 15-minute binary event contracts)

## What this is

Additive module on top of the BTCUSD scalping stack. It reads **Kalshi public market data** (no API key) and **Coinbase public BTC spot**, then emits a conservative decision state:

| Decision | Meaning |
|----------|---------|
| `WATCH` | Estimated edge present; not actionable without CFB |
| `NO_TRADE` | Default / closed / settlement window / insufficient data |
| `INVALID` | Reserved for dual-path settlement failure (CFB path) |

**Hard rule:** free/public path never emits actionable `YES` / `NO`. Those require `CFB_DIRECT` (Kalshi-authenticated CF Benchmarks BRTI feed).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/kalshi/health` | Public feed health (always DEGRADED without CFB) |
| GET | `/api/v1/kalshi/markets` | Open KXBTC15M markets |
| GET | `/api/v1/kalshi/snapshot` | Full terminal snapshot (auto-picks open market) |
| GET | `/api/v1/kalshi/snapshot?ticker=` | Snapshot for a specific ticker |
| GET | `/api/v1/kalshi/config` | Versions + capability flags |

## Package

```
packages/kalshi/
  src/public-client.ts   # Kalshi + Coinbase public REST
  src/decision-public.ts # PUBLIC_PROXY policy (no YES/NO)
  src/settlement.ts      # CFB BRTI half-up / 60s window (pure)
```

Import: `@btc/kalshi`

## Modes

| Mode | Data | Actionable YES/NO |
|------|------|-------------------|
| `PUBLIC_PROXY` | Kalshi public REST + Coinbase spot | **No** |
| `CFB_DIRECT` | Kalshi auth + `cfbenchmarks_value` | Yes (future) |

## Safety invariants

1. Default = `NO_TRADE`
2. Settlement window (last 60s before close) → `NO_TRADE`
3. Empty book → `NO_TRADE`
4. Health never claims settlement-grade HEALTHY without CFB
5. No order placement, wallets, or private keys

## Local verify

```bash
pnpm install
pnpm --filter @btc/kalshi test
pnpm --filter @btc/web dev
# curl http://localhost:3000/api/v1/kalshi/snapshot
```

## Relation to BTCUSD worker

- BTCUSD path: Binance → worker → Redis → web SSE (unchanged)
- Kalshi path: serverless public REST on demand (no worker required for PUBLIC_PROXY)
- Shared non-negotiable: human-supervised, non-executing
EOF
