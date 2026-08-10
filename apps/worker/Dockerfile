FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --frozen-lockfile --filter @btc/worker...

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY apps/worker ./apps/worker
WORKDIR /app/apps/worker
CMD ["pnpm", "start"]
