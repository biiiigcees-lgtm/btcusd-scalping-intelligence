import { Redis } from "ioredis";
import { REDIS_STREAMS } from "@btc/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * SSE relay — Redis only.
 * Worker is the single source of truth. No per-client exchange polling.
 * If Redis is unreachable we fail loud with a degraded status event.
 */
export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;
  let redis: Redis | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      send("hello", {
        service: "btc-scalping-web",
        message: "SSE connected",
        defaultState: "NO TRADE",
        timestamp: new Date().toISOString(),
      });

      try {
        redis = new Redis(REDIS_URL, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
          connectTimeout: 2500,
        });
        await redis.connect();
        await redis.ping();
      } catch {
        redis?.disconnect();
        redis = null;
      }

      if (!redis) {
        // Fail loud — no silent direct-exchange fallback (split-brain ban)
        send("status", {
          redis: "unavailable",
          mode: "degraded",
          systemHealth: "degraded",
          note: "Worker/Redis unreachable. Market state unavailable. No direct exchange polling.",
        });

        const hb = setInterval(() => {
          if (closed) {
            clearInterval(hb);
            return;
          }
          send("status", {
            redis: "unavailable",
            mode: "degraded",
            systemHealth: "degraded",
            note: "Still waiting for Redis / worker",
            ts: new Date().toISOString(),
          });
        }, 10_000);
        return;
      }

      send("status", {
        redis: "connected",
        mode: "worker-stream",
        note: "Reading market_state from Redis worker — single source of truth",
      });

      // Try to seed with the most recent message if stream has history
      try {
        const latest = await redis.xrevrange(
          REDIS_STREAMS.marketState,
          "+",
          "-",
          "COUNT",
          1
        );
        if (latest?.length) {
          const fields = latest[0][1];
          const payloadIdx = fields.indexOf("payload");
          if (payloadIdx >= 0 && fields[payloadIdx + 1]) {
            try {
              send("market_state", JSON.parse(fields[payloadIdx + 1]));
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore seed failure */
      }

      let lastId = "$";
      const poll = async () => {
        if (closed || !redis) return;
        try {
          const results = await redis.xread(
            "COUNT",
            10,
            "BLOCK",
            2000,
            "STREAMS",
            REDIS_STREAMS.marketState,
            lastId
          );
          if (results) {
            for (const [, messages] of results) {
              for (const [id, fields] of messages) {
                lastId = id;
                const payloadIdx = fields.indexOf("payload");
                if (payloadIdx >= 0 && fields[payloadIdx + 1]) {
                  try {
                    send("market_state", JSON.parse(fields[payloadIdx + 1]));
                  } catch {
                    /* ignore */
                  }
                }
              }
            }
          }
        } catch (err) {
          send("status", {
            redis: "error",
            mode: "degraded",
            systemHealth: "degraded",
            message: (err as Error).message,
          });
        }
        if (!closed) setTimeout(poll, 50);
      };
      poll();
    },
    cancel() {
      closed = true;
      redis?.disconnect();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
