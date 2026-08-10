import { fetchLiveMarket } from "@/lib/market-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await fetchLiveMarket();
    return Response.json(snapshot, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    return Response.json(
      {
        error: "market_unavailable",
        message: (err as Error).message,
        defaultState: "NO TRADE",
      },
      { status: 502 }
    );
  }
}
