# BTC worker — long-running process (not for Vercel serverless)
FROM node:20-bookworm-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

RUN pnpm install --no-frozen-lockfile --filter @btc/worker...

ENV NODE_ENV=production
ENV HEALTH_PORT=8081
EXPOSE 8081

WORKDIR /app/apps/worker
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
