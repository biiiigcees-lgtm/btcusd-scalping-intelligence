import { Redis, type RedisOptions } from "ioredis";

export function redactRedisUrl(url: string): string {
  try {
    const isTls = url.startsWith("rediss://");
    const parsed = new URL(url.replace(/^rediss:\/\//, "https://").replace(/^redis:\/\//, "http://"));
    const proto = isTls ? "rediss://" : "redis://";
    const auth = parsed.username ? `${parsed.username}${parsed.password ? ":******" : ""}@` : "";
    return `${proto}${auth}${parsed.host}`;
  } catch {
    return "[redacted]";
  }
}

export function createRedis(url: string): Redis {
  const isTls =
    url.startsWith("rediss://") ||
    url.includes("upstash") ||
    url.includes("redis-cloud") ||
    url.includes("amazonaws.com");

  const opts: RedisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 8_000,
    family: 0,
    keepAlive: 10_000,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      console.warn(`[redis] reconnect attempt ${times}, delay ${delay}ms`);
      return delay;
    },
    ...(isTls
      ? {
          tls: {
            rejectUnauthorized: true,
          },
        }
      : {}),
  };

  const redis = new Redis(url, opts);
  redis.on("connect", () => console.log("[redis] connected"));
  redis.on("ready", () => console.log("[redis] ready"));
  redis.on("error", (err) => console.error("[redis] error", err.message));
  redis.on("close", () => console.warn("[redis] connection closed"));
  return redis;
}

export async function safeConnect(redis: Redis): Promise<boolean> {
  try {
    await redis.connect();
    return true;
  } catch (err) {
    console.error("[redis] initial connect failed — continuing without Redis", err);
    return false;
  }
}
