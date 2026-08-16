import { pingRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight health — reports Redis reachability (no secrets). */
export async function GET() {
  const hasUrl = Boolean(process.env.REDIS_URL?.trim());
  const redis = hasUrl
    ? await pingRedis()
    : { ok: false as const, error: "REDIS_URL is not set" };

  const body = {
    service: "btc-scalping-web",
    ok: redis.ok,
    redis: redis.ok ? "connected" : "unavailable",
    redisError: redis.ok ? undefined : redis.error,
    redisUrlConfigured: hasUrl,
    // Host only — never the password
    redisHostHint: hasUrl
      ? (() => {
          try {
            const u = new URL(process.env.REDIS_URL!.replace(/^rediss:/, "https:").replace(/^redis:/, "http:"));
            return `${u.hostname}:${u.port || (process.env.REDIS_URL!.startsWith("rediss") ? 6379 : 6379)}`;
          } catch {
            return "unparseable";
          }
        })()
      : null,
    timestamp: new Date().toISOString(),
  };

  return Response.json(body, {
    status: redis.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
