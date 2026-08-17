# Deploy worker on Railway

Vercel hosts the **web UI only**. The **worker** must run 24/7 with the same `REDIS_URL`.

## One-time setup

1. Create account at [railway.app](https://railway.app) and sign in with GitHub.
2. **New Project** → **Deploy from GitHub repo** → `biiiigcees-lgtm/btcusd-scalping-intelligence`.
3. Railway will detect `railway.toml` + `Dockerfile.worker`.
4. Open the service → **Variables** → add:

| Variable | Value |
|----------|--------|
| `REDIS_URL` | Same as Vercel (Storage → Redis). Example: `redis://default:…@….db.redis.io:13770` |
| `USE_MOCK_FEED` | `false` |
| `HEALTH_PORT` | `8081` (optional; Railway `PORT` is used automatically) |

5. **Settings** → generate a domain (optional) for `/health` checks.
6. Deploy. Logs should show:

```text
[worker] Bootstrapped … 1m klines → … 15m closes
[redis] connected
[worker] REAL feeds — primary + hot standby
[worker] Health endpoint http://0.0.0.0:PORT/health
```

7. Hard-refresh https://btcusd-scalping-intelligence.vercel.app — Live price + chart.

## CLI alternative

```bash
npm i -g @railway/cli
railway login
cd /path/to/btcusd-scalping-intelligence
railway init          # link project
railway up            # deploy
railway variables set REDIS_URL="redis://default:…@….db.redis.io:13770"
railway variables set USE_MOCK_FEED=false
```

## Verify

```bash
# Railway public URL if you exposed one
curl -sS https://YOUR-SERVICE.up.railway.app/health

# Vercel still the UI
curl -sS https://btcusd-scalping-intelligence.vercel.app/api/v1/health
curl -sS https://btcusd-scalping-intelligence.vercel.app/api/v1/market | head -c 400
```

## Notes

- Do **not** deploy the Next.js web app to Railway for this project — it stays on Vercel.
- No exchange trading keys. Public market data only.
- If Binance global returns 451, worker fails over to Binance.US automatically.
- Rotate Redis credentials if they were ever pasted into chat.
