# Deploy web app on Vercel

The **worker** (feeds, Lorentzian, Redis publisher) must run elsewhere (Fly, Railway, VPS). Vercel hosts only `apps/web`.

## 1. Commits

All Phase 05+ work is on `main`:
https://github.com/biiiigcees-lgtm/btcusd-scalping-intelligence

## 2. Import project

1. [vercel.com/new](https://vercel.com/new) → Import `biiiigcees-lgtm/btcusd-scalping-intelligence`
2. Framework: **Next.js** (detected via `vercel.json`)
3. Root Directory: leave **repository root** (uses root `vercel.json`)
4. Install: `pnpm install --no-frozen-lockfile`
5. Build: `pnpm --filter @btc/web build`

## 3. Environment variables (Production)

| Name | Required | Notes |
|------|----------|--------|
| `REDIS_URL` | **Yes** | Same Redis the worker writes to (e.g. Upstash) |
| `DASHBOARD_SECRET` | Recommended | Gates the UI if middleware uses it |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Optional | Web push |
| `VAPID_PUBLIC_KEY` | Optional | Same as public |
| `VAPID_PRIVATE_KEY` | Optional | Server-side only |
| `VAPID_SUBJECT` | Optional | `mailto:...` |

Without `REDIS_URL`, the SSE stream runs in **degraded** mode (no live worker state).

## 4. Deploy

- Push to `main` triggers production deploy if Git integration is connected.
- Or CLI: `npx vercel --prod` from a machine logged into the Vercel account that owns the project.

## 5. Worker reminder

Vercel does **not** run the worker. Deploy worker with `REDIS_URL` pointing at the same Redis instance.
