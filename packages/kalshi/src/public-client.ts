/**
 * Free / public Kalshi market-data client (no API key).
 * Base: https://external-api.kalshi.com/trade-api/v2
 */

export const PUBLIC_REST_BASE =
  "https://external-api.kalshi.com/trade-api/v2";

const TIMEOUT_MS = 8_000;

export class UpstreamError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface PublicMarket {
  ticker: string;
  event_ticker?: string;
  status?: string;
  title?: string;
  floor_strike?: number;
  close_time?: string;
  open_time?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  last_price_dollars?: string;
  rules_primary?: string;
}

export interface PublicOrderbook {
  yes: { price: number; quantity: number }[];
  no: { price: number; quantity: number }[];
  yesBestBid: number | null;
  yesBestAsk: number | null;
  noBestBid: number | null;
  noBestAsk: number | null;
  status: "SYNCED" | "EMPTY";
}

async function fetchJson(url: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new UpstreamError(
        "UPSTREAM_HTTP",
        `HTTP ${res.status}`,
        res.status === 404 ? 404 : 502
      );
    }
    return await res.json();
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new UpstreamError("UPSTREAM_TIMEOUT", "upstream timeout", 504);
    }
    throw new UpstreamError("UPSTREAM_ERROR", "upstream unavailable", 502);
  } finally {
    clearTimeout(t);
  }
}

export async function listOpenMarkets(
  seriesTicker = "KXBTC15M"
): Promise<PublicMarket[]> {
  const data = (await fetchJson(
    `${PUBLIC_REST_BASE}/markets?series_ticker=${encodeURIComponent(seriesTicker)}&status=open&limit=20`
  )) as { markets?: PublicMarket[] };
  return data.markets ?? [];
}

export async function getMarket(ticker: string): Promise<PublicMarket> {
  try {
    return (await fetchJson(
      `${PUBLIC_REST_BASE}/markets/${encodeURIComponent(ticker)}`
    )) as PublicMarket;
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 404) {
      throw new UpstreamError("NOT_FOUND", "market not found", 404);
    }
    throw e;
  }
}

/** Parse orderbook_fp: ascending price; best bid = last element. */
export async function getOrderbook(ticker: string): Promise<PublicOrderbook> {
  const data = (await fetchJson(
    `${PUBLIC_REST_BASE}/markets/${encodeURIComponent(ticker)}/orderbook`
  )) as {
    orderbook_fp?: {
      yes_dollars?: [string, string][];
      no_dollars?: [string, string][];
    };
  };
  const fp = data.orderbook_fp ?? {};
  const parseSide = (rows: [string, string][] | undefined) =>
    (rows ?? [])
      .map(([p, q]) => ({ price: Number(p), quantity: Number(q) }))
      .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.quantity));

  const yes = parseSide(fp.yes_dollars);
  const no = parseSide(fp.no_dollars);
  const yesBestBid = yes.length ? yes[yes.length - 1]!.price : null;
  const noBestBid = no.length ? no[no.length - 1]!.price : null;

  return {
    yes,
    no,
    yesBestBid,
    noBestBid,
    yesBestAsk:
      noBestBid !== null ? Number((1 - noBestBid).toFixed(4)) : null,
    noBestAsk:
      yesBestBid !== null ? Number((1 - yesBestBid).toFixed(4)) : null,
    status: yes.length || no.length ? "SYNCED" : "EMPTY",
  };
}

/** Coinbase public spot — PUBLIC_PROXY settlement reference (not CFB). */
export async function getCoinbaseBtcSpot(): Promise<number> {
  const j = (await fetchJson(
    "https://api.coinbase.com/v2/prices/BTC-USD/spot"
  )) as { data?: { amount?: string } };
  const v = Number(j.data?.amount);
  if (!Number.isFinite(v)) {
    throw new UpstreamError("SPOT_PARSE", "spot parse failed", 502);
  }
  return v;
}
