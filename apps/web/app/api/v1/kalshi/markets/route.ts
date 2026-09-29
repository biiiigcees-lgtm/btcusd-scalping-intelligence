import { listOpenMarkets, UpstreamError } from "@btc/kalshi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Open KXBTC15M markets via Kalshi public REST (no auth). */
export async function GET() {
  try {
    const markets = await listOpenMarkets("KXBTC15M");
    return Response.json(
      {
        tickers: markets.map((m) => m.ticker),
        markets: markets.map((m) => ({
          ticker: m.ticker,
          title: m.title,
          status: m.status,
          floor_strike: m.floor_strike,
          close_time: m.close_time,
          yes_bid_dollars: m.yes_bid_dollars,
          yes_ask_dollars: m.yes_ask_dollars,
          no_bid_dollars: m.no_bid_dollars,
          no_ask_dollars: m.no_ask_dollars,
          last_price_dollars: m.last_price_dollars,
        })),
        dataMode: "PUBLIC_PROXY",
        source: "kalshi_public_rest",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const status = e instanceof UpstreamError ? e.status : 502;
    const code = e instanceof UpstreamError ? e.code : "UPSTREAM_ERROR";
    return Response.json(
      { error: code, message: "upstream or internal error" },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
