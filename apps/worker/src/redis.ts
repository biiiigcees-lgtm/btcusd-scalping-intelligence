import { Redis } from "ioredis";

export function createRedis(url: string): Redis {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      console.warn(`[redis] reconnect attempt ${times}, delay ${delay}ms`);
      return delay;
    },
  });
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
