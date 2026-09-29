import {
  listOpenMarkets,
  getMarket,
  getOrderbook,
  getCoinbaseBtcSpot,
  publicProxyDecision,
  UpstreamError,
} from "@btc/kalshi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kalshi terminal snapshot (PUBLIC_PROXY).
 * Decision ∈ { WATCH, NO_TRADE, INVALID } — never YES/NO without CFB_DIRECT.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let ticker = url.searchParams.get("ticker");
    let market;

    if (!ticker) {
      const markets = await listOpenMarkets("KXBTC15M");
      if (!markets.length) {
        return Response.json(
          { error: "NO_OPEN_KXBTC15M" },
          { status: 404, headers: { "Cache-Control": "no-store" } }
        );
      }
      market = markets[0]!;
      ticker = market.ticker;
    } else {
      market = await getMarket(ticker);
    }

    const [book, spot] = await Promise.all([
      getOrderbook(ticker),
      getCoinbaseBtcSpot().catch(() => null),
    ]);

    const strike =
      market.floor_strike != null ? Number(market.floor_strike) : null;
    const closeTimestampMs = market.close_time
      ? Date.parse(market.close_time)
      : null;
    const nowMs = Date.now();

    const d = publicProxyDecision({
      book,
      spot,
      strike,
      closeTimestampMs,
      nowMs,
    });

    return Response.json(
      {
        market: {
          ticker,
          status: market.status,
          title: market.title,
          strike,
          closeTimestampMs,
          rules: market.rules_primary,
        },
        orderBook: {
          yesBest: book.yesBestBid,
          noBest: book.noBestBid,
          yesAsk: book.yesBestAsk,
          noAsk: book.noBestAsk,
          status: book.status,
          yesDepth: book.yes.slice(-5),
          noDepth: book.no.slice(-5),
        },
        rti: null,
        spot: spot != null ? { value: spot, source: "coinbase_public" } : null,
        model: {
          pYes: d.modelProbability,
          regime: "PUBLIC_PROXY_HEURISTIC",
          version: "public-proxy-v1",
          note: "Estimated only. YES/NO disabled without CFB_DIRECT.",
        },
        decision: {
          decision: d.decision,
          netEdge: d.netEdge,
          modelProbability: d.modelProbability,
          marketProbability: d.marketProbability,
          dataMode: "PUBLIC_PROXY",
          settlementConfidence: "ESTIMATED",
          reasons: d.reasons,
        },
        health: {
          global: "DEGRADED",
          sources: {
            KALSHI_PUBLIC: "LIVE",
            COINBASE_SPOT: spot != null ? "LIVE" : "DISCONNECTED",
            CFB_RTI: "UNAVAILABLE",
          },
        },
        clock: { serverNowMs: nowMs, synced: true },
        dataMode: "PUBLIC_PROXY",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const status = e instanceof UpstreamError ? e.status : 502;
    const code = e instanceof UpstreamError ? e.code : "UPSTREAM_ERROR";
    return Response.json(
      {
        error: code,
        message:
          status < 500 && e instanceof Error
            ? e.message.slice(0, 120)
            : "upstream or internal error",
      },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
