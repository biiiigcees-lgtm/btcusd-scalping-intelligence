import { getOrRefreshMarketState } from "@/lib/server/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Snapshot — reads latest market state from Redis with automatic on-demand tick. */
export async function GET() {
  try {
    const { state, source } = await getOrRefreshMarketState(60_000);

    return Response.json(
      {
        ...state,
        _meta: {
          cacheSource: source,
          servedAt: new Date().toISOString(),
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    console.error("[/api/v1/market] Error fetching market state", err);
    return Response.json(
      {
        error: "market_state_error",
        message: (err as Error).message,
        defaultState: "NO TRADE",
        systemHealth: "degraded",
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  }
}
