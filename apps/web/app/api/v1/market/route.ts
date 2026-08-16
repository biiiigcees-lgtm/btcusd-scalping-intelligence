import { REDIS_STREAMS } from "@btc/shared";
import { createRedisClient } from "@/lib/redis";
import type { Redis } from "ioredis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Snapshot — last worker-published state from Redis only. */
export async function GET() {
  let redis: Redis | null = null;
  try {
    redis = createRedisClient();
    await redis.connect();
    await redis.ping();

    const latest = await redis.xrevrange(
      REDIS_STREAMS.marketState,
      "+",
      "-",
      "COUNT",
      1
    );

    if (!latest?.length) {
      return Response.json(
        {
          error: "no_market_state",
          message: "Worker has not published any market_state yet",
          defaultState: "NO TRADE",
          systemHealth: "degraded",
          redis: "connected",
        },
        { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const fields = latest[0][1];
    const payloadIdx = fields.indexOf("payload");
    if (payloadIdx < 0 || !fields[payloadIdx + 1]) {
      return Response.json(
        {
          error: "malformed_state",
          message: "Redis entry missing payload",
          defaultState: "NO TRADE",
        },
        { status: 502 }
      );
    }

    const snapshot = JSON.parse(fields[payloadIdx + 1]);
    return Response.json(snapshot, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    return Response.json(
      {
        error: "redis_unavailable",
        message: (err as Error).message,
        defaultState: "NO TRADE",
        systemHealth: "degraded",
        note: "Worker/Redis required. Direct exchange polling is disabled.",
      },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } finally {
    try {
      redis?.disconnect();
    } catch {
      /* ignore */
    }
  }
}
