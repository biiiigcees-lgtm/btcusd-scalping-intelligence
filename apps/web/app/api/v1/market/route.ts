import { Redis } from "ioredis";
import { REDIS_STREAMS } from "@btc/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Snapshot endpoint — reads last worker-published state from Redis only.
 * No direct exchange access.
 */
export async function GET() {
  let redis: Redis | null = null;
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2500,
    });
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
    redis?.disconnect();
  }
}
