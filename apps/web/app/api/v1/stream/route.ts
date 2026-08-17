import { getOrRefreshMarketState } from "@/lib/server/tick";
import { pingRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * SSE relay — Serverless stream.
 * Reads latest market state from Redis (or on-demand tick),
 * pushes real-time updates and status events to connected clients.
 */
export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;

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

      let lastEmittedState = "";
      let redisHealthy = true;

      const redisCheck = await pingRedis();
      redisHealthy = redisCheck.ok;

      // Initial state fetch
      try {
        const { state } = await getOrRefreshMarketState(60_000);
        lastEmittedState = state.lastUpdate;
        const ageSec = Math.max(
          0,
          Math.round((Date.now() - Date.parse(state.lastUpdate)) / 1000)
        );

        send("status", {
          redis: redisHealthy ? "connected" : "unavailable",
          mode: "vercel-cron",
          ageSec,
          note: "Market state cached in Redis via Vercel Cron & on-demand tick",
        });

        send("market_state", state);
      } catch (err) {
        send("status", {
          redis: redisHealthy ? "connected" : "unavailable",
          mode: "degraded",
          error: (err as Error).message,
        });
      }

      // Continuous polling loop
      let tickCount = 0;
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }

        tickCount++;
        try {
          const { state } = await getOrRefreshMarketState(60_000);
          const ageSec = Math.max(
            0,
            Math.round((Date.now() - Date.parse(state.lastUpdate)) / 1000)
          );

          if (state.lastUpdate !== lastEmittedState) {
            lastEmittedState = state.lastUpdate;
            send("market_state", state);
          }

          // Emit status heartbeat every 5 ticks (10s)
          if (tickCount % 5 === 0) {
            send("status", {
              redis: redisHealthy ? "connected" : "unavailable",
              mode: "vercel-cron",
              ageSec,
              ts: new Date().toISOString(),
            });
          }
        } catch {
          /* ignore loop error */
        }
      }, 2000);
    },
    cancel() {
      closed = true;
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
