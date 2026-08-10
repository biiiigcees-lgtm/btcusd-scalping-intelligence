/**
 * Real Binance public WebSocket trade feed.
 * Public market data only — no API keys.
 * Stream: wss://stream.binance.com:9443/ws/btcusdt@trade
 */
import WebSocket from "ws";
import type { Trade } from "@btc/shared";
import { PRIMARY_EXCHANGE, SYMBOL } from "@btc/shared";

const BINANCE_WS_BASE =
  process.env.BINANCE_WS_URL || "wss://stream.binance.com:9443/ws";
const STREAM = `${SYMBOL.toLowerCase()}@trade`;
const FULL_URL = `${BINANCE_WS_BASE}/${STREAM}`;

interface BinanceTradeEvent {
  e: "trade";
  E: number;
  s: string;
  t: number;
  p: string;
  q: string;
  T: number;
  m: boolean;
  M: boolean;
}

export type OnTradeCallback = (trade: Trade) => void;
export type OnStatusCallback = (status: {
  connected: boolean;
  reason?: string;
  reconnectAttempt?: number;
}) => void;

export interface BinanceFeedOptions {
  onTrade: OnTradeCallback;
  onStatus: OnStatusCallback;
  maxReconnectAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

export class BinanceTradeFeed {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private stopped = false;
  private readonly maxReconnectAttempts: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly onTrade: OnTradeCallback;
  private readonly onStatus: OnStatusCallback;
  private lastMessageAt = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(opts: BinanceFeedOptions) {
    this.onTrade = opts.onTrade;
    this.onStatus = opts.onStatus;
    this.maxReconnectAttempts = opts.maxReconnectAttempts ?? 50;
    this.initialBackoffMs = opts.initialBackoffMs ?? 1000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 60_000;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearHeartbeat();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.onStatus({ connected: false, reason: "stopped" });
  }

  getSilenceMs(): number {
    if (this.lastMessageAt === 0) return Number.POSITIVE_INFINITY;
    return Date.now() - this.lastMessageAt;
  }

  private connect() {
    if (this.stopped) return;
    console.log(`[binance] Connecting to ${FULL_URL} (attempt ${this.reconnectAttempt + 1})`);
    try {
      this.ws = new WebSocket(FULL_URL);
    } catch (err) {
      console.error("[binance] WebSocket constructor failed", err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      console.log("[binance] Connected");
      this.reconnectAttempt = 0;
      this.lastMessageAt = Date.now();
      this.onStatus({ connected: true });
      this.startHeartbeat();
    });

    this.ws.on("message", (data: WebSocket.RawData) => {
      this.lastMessageAt = Date.now();
      try {
        const raw = JSON.parse(data.toString()) as BinanceTradeEvent;
        const trade = this.mapToTrade(raw);
        if (trade) this.onTrade(trade);
      } catch (err) {
        console.warn("[binance] Failed to parse message", err);
      }
    });

    this.ws.on("error", (err) => {
      console.error("[binance] WebSocket error", err.message);
      this.onStatus({ connected: false, reason: err.message });
    });

    this.ws.on("close", (code, reason) => {
      console.warn(`[binance] Closed code=${code} reason=${reason.toString()}`);
      this.clearHeartbeat();
      this.onStatus({
        connected: false,
        reason: `close:${code}`,
        reconnectAttempt: this.reconnectAttempt,
      });
      this.ws = null;
      if (!this.stopped) this.scheduleReconnect();
    });
  }

  private mapToTrade(raw: BinanceTradeEvent): Trade | null {
    if (raw.e !== "trade" || raw.s !== SYMBOL) return null;
    const price = parseFloat(raw.p);
    const quantity = parseFloat(raw.q);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }
    const tradeTime = new Date(raw.T).toISOString();
    const receivedAt = new Date().toISOString();
    const skewMs = Date.now() - raw.T;
    if (skewMs > 30_000 || skewMs < -5_000) {
      console.warn(`[binance] Rejecting trade with skew ${skewMs}ms`);
      return null;
    }
    return {
      tradeId: String(raw.t),
      exchange: PRIMARY_EXCHANGE,
      symbol: SYMBOL,
      price,
      quantity,
      side: raw.m ? "sell" : "buy",
      tradeTime,
      receivedAt,
    };
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      console.error("[binance] Max reconnect attempts reached");
      this.onStatus({
        connected: false,
        reason: "max_reconnects",
        reconnectAttempt: this.reconnectAttempt,
      });
      return;
    }
    const backoff = Math.min(
      this.initialBackoffMs * Math.pow(2, this.reconnectAttempt),
      this.maxBackoffMs
    );
    const jitter = backoff * (0.8 + Math.random() * 0.4);
    this.reconnectAttempt += 1;
    console.log(`[binance] Reconnecting in ${Math.round(jitter)}ms (attempt ${this.reconnectAttempt})`);
    setTimeout(() => this.connect(), jitter);
  }

  private startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.getSilenceMs() > 15_000) {
        console.warn("[binance] Silence >15s — forcing reconnect");
        this.ws?.terminate();
      }
    }, 5_000);
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
