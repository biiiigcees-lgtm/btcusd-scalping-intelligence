import { pingRedis } from "@/lib/redis";
import { getOrRefreshMarketState } from "@/lib/server/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Health endpoint — reports Redis status, cron freshness, and latest market state age */
export async function GET() {
  const hasUrl = Boolean(process.env.REDIS_URL?.trim());
  const redis = hasUrl
    ? await pingRedis()
    : { ok: false as const, error: "REDIS_URL is not set" };

  let marketStateSummary: {
    lastUpdate?: string;
    ageSec?: number;
    price?: number;
    dataQuality?: number;
    candlesCount?: number;
  } = {};

  try {
    const { state } = await getOrRefreshMarketState(120_000);
    const ageSec = Math.max(
      0,
      Math.round((Date.now() - Date.parse(state.lastUpdate)) / 1000)
    );
    marketStateSummary = {
      lastUpdate: state.lastUpdate,
      ageSec,
      price: state.price,
      dataQuality: state.dataQuality,
      candlesCount: state.candles?.length,
    };
  } catch {
    /* ignore */
  }

  const isHealthy =
    redis.ok &&
    (marketStateSummary.ageSec == null || marketStateSummary.ageSec < 180);

  const body = {
    service: "btc-scalping-web",
    ok: isHealthy,
    mode: "vercel-cron",
    redis: redis.ok ? "connected" : "unavailable",
    redisError: redis.ok ? undefined : redis.error,
    redisUrlConfigured: hasUrl,
    redisHostHint: hasUrl
      ? (() => {
          try {
            const u = new URL(
              process.env
                .REDIS_URL!.replace(/^rediss:/, "https:")
                .replace(/^redis:/, "http:")
            );
            return `${u.hostname}:${u.port || (process.env.REDIS_URL!.startsWith("rediss") ? 6379 : 6379)}`;
          } catch {
            return "unparseable";
          }
        })()
      : null,
    market: marketStateSummary,
    timestamp: new Date().toISOString(),
  };

  return Response.json(body, {
    status: isHealthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
