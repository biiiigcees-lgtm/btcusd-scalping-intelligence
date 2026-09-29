import {
  listOpenMarkets,
  getCoinbaseBtcSpot,
} from "@btc/kalshi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kalshi PUBLIC_PROXY health.
 * Honest: DEGRADED until CFB_DIRECT entitlement exists.
 */
export async function GET() {
  let kalshi: string = "UNKNOWN";
  let coinbase: string = "UNKNOWN";

  try {
    const markets = await listOpenMarkets("KXBTC15M");
    kalshi = markets.length > 0 ? "LIVE" : "EMPTY";
  } catch {
    kalshi = "DISCONNECTED";
  }

  try {
    await getCoinbaseBtcSpot();
    coinbase = "LIVE";
  } catch {
    coinbase = "DISCONNECTED";
  }

  const global =
    kalshi === "LIVE" || kalshi === "EMPTY" ? "DEGRADED" : "UNAVAILABLE";

  return Response.json(
    {
      service: "btc-scalping-kalshi",
      global,
      sources: {
        KALSHI_PUBLIC: kalshi,
        COINBASE_SPOT: coinbase,
        CFB_RTI: "UNAVAILABLE",
        MODE: "PUBLIC_PROXY",
      },
      note: "DEGRADED until CFB_DIRECT entitlement is available",
      timestamp: new Date().toISOString(),
    },
    {
      status: global === "UNAVAILABLE" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
