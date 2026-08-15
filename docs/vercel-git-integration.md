# Configure Vercel Git Integration

Native **Vercel for GitHub** is the recommended path: every push to `main` (and PRs) deploys automatically. No deploy tokens required after the one-time link.

Repo: `biiiigcees-lgtm/btcusd-scalping-intelligence`

---

## Path A — Official Git integration (recommended)

### 1. Install the Vercel GitHub App

1. Open: **https://github.com/apps/vercel**
2. Click **Install** (or **Configure** if already installed).
3. Choose account **biiiigcees-lgtm**.
4. Grant access to **Only select repositories** → select **btcusd-scalping-intelligence** (or all repos).
5. Confirm.

### 2. Import / link the project in Vercel

1. Open: **https://vercel.com/new**
2. Sign in with the **same GitHub account** that owns the repo.
3. Import **btcusd-scalping-intelligence**.
4. Framework preset: **Next.js**.
5. Root Directory: leave empty (repo root — uses `vercel.json`).
6. Build settings (should match `vercel.json`):
   - Install Command: `pnpm install --no-frozen-lockfile`
   - Build Command: `pnpm --filter @btc/web build`
7. Add environment variables before deploy:

| Name | Required | Value |
|------|----------|--------|
| `REDIS_URL` | Yes | Upstash / shared Redis (same as worker) |
| `DASHBOARD_SECRET` | Recommended | Shared secret for UI gate |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Optional | Web push |
| `VAPID_PUBLIC_KEY` | Optional | Same public key |
| `VAPID_PRIVATE_KEY` | Optional | Private key |
| `VAPID_SUBJECT` | Optional | `mailto:you@example.com` |

8. Click **Deploy**.

### 3. Verify Git is connected

Vercel → Project → **Settings → Git**:

- Connected Repository: `biiiigcees-lgtm/btcusd-scalping-intelligence`
- Production Branch: `main`
- Auto-deploy: enabled

After this, every push to `main` creates a **Production** deployment; other branches / PRs create **Preview** deployments. Status appears on GitHub commits via the Deployments API.

### 4. If the project already exists but Git is not linked

Vercel → Project → **Settings → Git** → **Connect Git Repository** → pick this repo.

---

## Path B — GitHub Actions fallback

Use when you cannot install the Vercel GitHub App (org policy, etc.).

1. Create a Vercel token: **https://vercel.com/account/tokens**
2. Get Org + Project IDs from Project → Settings → General.
3. GitHub repo → **Settings → Secrets and variables → Actions** → add:

| Secret | Source |
|--------|--------|
| `VERCEL_TOKEN` | Account token |
| `VERCEL_ORG_ID` | Team/user id |
| `VERCEL_PROJECT_ID` | Project id |

4. Workflow: `.github/workflows/vercel.yml` runs on push to `main` when secrets exist.

---

## Notes

- **Worker is not deployed on Vercel.** Run it on Fly/Railway/VPS with the same `REDIS_URL`.
- Without `REDIS_URL`, the site builds but SSE stays **degraded**.
- Web push needs HTTPS (Vercel provides this) + VAPID keys on both web and worker.
