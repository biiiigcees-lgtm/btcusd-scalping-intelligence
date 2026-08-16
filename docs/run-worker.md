# Run the worker (required for live data)

Vercel hosts **only the web UI**. The worker must run 24/7 with the **same** `REDIS_URL` as the Vercel project.

## 1. Copy REDIS_URL

Vercel → Project **btcusd-scalping-intelligence** → **Storage** → **redis-coffee-envelope** → copy **REDIS_URL**  
(or Storage → open Redis → `.env` / connection string).

Host should look like: `*.db.redis.io`

## 2. Local smoke test

```bash
export REDIS_URL='rediss://default:…@….db.redis.io:…'
export USE_MOCK_FEED=false   # real Binance public WS
# optional: USE_MOCK_FEED=true for synthetic ticks
pnpm --filter @btc/worker dev
curl -sS http://localhost:8081/health
```

Within a few seconds the web UI at https://btcusd-scalping-intelligence.vercel.app should show price + chart.

## 3. Docker

```bash
docker build -f apps/worker/Dockerfile -t btc-worker .
docker run --rm -e REDIS_URL="$REDIS_URL" -e USE_MOCK_FEED=false -p 8081:8081 btc-worker
```

## 4. Railway / Fly / any VPS

Set env:

| Var | Value |
|-----|--------|
| `REDIS_URL` | Same as Vercel |
| `USE_MOCK_FEED` | `false` |
| `HEALTH_PORT` | `8081` |

Expose health port if you want uptime checks.
