import { Redis } from "ioredis";
import { REDIS_STREAMS } from "@btc/shared";
import { fetchLiveMarket } from "@/lib/market-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

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

      // Prefer Redis worker stream when available
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
        send("status", {
          redis: "unavailable",
          mode: "direct-binance",
          systemHealth: "healthy",
          note: "Live public Binance feed active (worker/Redis optional)",
        });

        const pushLive = async () => {
          if (closed) return;
          try {
            const snap = await fetchLiveMarket();
            send("market_state", snap);
          } catch (err) {
            send("status", {
              redis: "unavailable",
              mode: "direct-binance",
              error: (err as Error).message,
            });
          }
        };

        await pushLive();
        const iv = setInterval(pushLive, 4000);
        const hb = setInterval(() => {
          if (closed) {
            clearInterval(iv);
            clearInterval(hb);
            return;
          }
          send("heartbeat", { ts: new Date().toISOString() });
        }, 15000);
        return;
      }

      send("status", {
        redis: "connected",
        mode: "worker-stream",
        note: "Reading market_state from Redis worker",
      });

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
          send("status", { redis: "error", message: (err as Error).message });
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
