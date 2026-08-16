import { Redis, type RedisOptions } from "ioredis";

/**
 * Build an ioredis client tuned for Vercel serverless + managed Redis
 * (Official Redis / Upstash-style TLS endpoints).
 */
export function getRedisUrl(): string {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }
  return url;
}

export function redisOptions(url: string): RedisOptions {
  const isTls =
    url.startsWith("rediss://") ||
    url.includes("upstash") ||
    url.includes("redis-cloud") ||
    url.includes("amazonaws.com");

  return {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
    connectTimeout: 8_000,
    enableReadyCheck: true,
    // Prefer whichever family the platform resolves (avoids IPv6-only stalls)
    family: 0,
    keepAlive: 10_000,
    ...(isTls
      ? {
          tls: {
            // Managed Redis TLS certs are public CA-signed
            rejectUnauthorized: true,
          },
        }
      : {}),
  };
}

export function createRedisClient(url = process.env.REDIS_URL?.trim()): Redis {
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }
  return new Redis(url, redisOptions(url));
}

/** Connect + PING; returns error message on failure */
export async function pingRedis(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  let client: Redis | null = null;
  try {
    client = createRedisClient();
    await client.connect();
    const pong = await client.ping();
    if (pong !== "PONG" && pong !== "pong") {
      return { ok: false, error: `unexpected ping response: ${String(pong)}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  } finally {
    try {
      client?.disconnect();
    } catch {
      /* ignore */
    }
  }
}
