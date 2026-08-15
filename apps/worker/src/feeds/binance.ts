/**
 * Binance-family public WebSocket trade feed (global or .us).
 * Public market data only — no API keys.
 */
import WebSocket from "ws";
import type { Trade, Exchange } from "@btc/shared";
import { SYMBOL } from "@btc/shared";

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
  source: string;
}) => void;

export interface BinanceFeedOptions {
  /** Full WS URL e.g. wss://stream.binance.com:9443/ws/btcusdt@trade */
  url: string;
  sourceLabel: string;
  exchange?: Exchange;
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
  private readonly url: string;
  private readonly sourceLabel: string;
  private readonly exchange: Exchange;
  private lastMessageAt = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private connected = false;

  constructor(opts: BinanceFeedOptions) {
    this.url = opts.url;
    this.sourceLabel = opts.sourceLabel;
    this.exchange = opts.exchange ?? "binance";
    this.onTrade = opts.onTrade;
    this.onStatus = opts.onStatus;
    this.maxReconnectAttempts = opts.maxReconnectAttempts ?? 50;
    this.initialBackoffMs = opts.initialBackoffMs ?? 1000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 60_000;
  }

  getSourceLabel(): string {
    return this.sourceLabel;
  }

  isConnected(): boolean {
    return this.connected;
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
    this.connected = false;
    this.onStatus({
      connected: false,
      reason: "stopped",
      source: this.sourceLabel,
    });
  }

  getSilenceMs(): number {
    if (this.lastMessageAt === 0) return Number.POSITIVE_INFINITY;
    return Date.now() - this.lastMessageAt;
  }

  private connect() {
    if (this.stopped) return;
    console.log(
      `[${this.sourceLabel}] Connecting to ${this.url} (attempt ${this.reconnectAttempt + 1})`
    );
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      console.error(`[${this.sourceLabel}] WebSocket constructor failed`, err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      console.log(`[${this.sourceLabel}] Connected`);
      this.reconnectAttempt = 0;
      this.lastMessageAt = Date.now();
      this.connected = true;
      this.onStatus({ connected: true, source: this.sourceLabel });
      this.startHeartbeat();
    });

    this.ws.on("message", (data: WebSocket.RawData) => {
      this.lastMessageAt = Date.now();
      try {
        const raw = JSON.parse(data.toString()) as BinanceTradeEvent;
        const trade = this.mapToTrade(raw);
        if (trade) this.onTrade(trade);
      } catch (err) {
        console.warn(`[${this.sourceLabel}] Failed to parse message`, err);
      }
    });

    this.ws.on("error", (err) => {
      console.error(`[${this.sourceLabel}] WebSocket error`, err.message);
      this.connected = false;
      this.onStatus({
        connected: false,
        reason: err.message,
        source: this.sourceLabel,
      });
    });

    this.ws.on("close", (code, reason) => {
      console.warn(
        `[${this.sourceLabel}] Closed code=${code} reason=${reason.toString()}`
      );
      this.clearHeartbeat();
      this.connected = false;
      this.onStatus({
        connected: false,
        reason: `close:${code}`,
        reconnectAttempt: this.reconnectAttempt,
        source: this.sourceLabel,
      });
      this.ws = null;
      if (!this.stopped) this.scheduleReconnect();
    });
  }

  private mapToTrade(raw: BinanceTradeEvent): Trade | null {
    if (raw.e !== "trade") return null;
    const sym = (raw.s || "").toUpperCase();
    if (sym && sym !== SYMBOL) return null;
    const price = parseFloat(raw.p);
    const quantity = parseFloat(raw.q);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }
    const tradeTime = new Date(raw.T).toISOString();
    const receivedAt = new Date().toISOString();
    const skewMs = Date.now() - raw.T;
    if (skewMs > 30_000 || skewMs < -5_000) {
      return null;
    }
    return {
      tradeId: `${this.sourceLabel}:${raw.t}`,
      exchange: this.exchange,
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
      console.error(`[${this.sourceLabel}] Max reconnect attempts reached`);
      this.onStatus({
        connected: false,
        reason: "max_reconnects",
        reconnectAttempt: this.reconnectAttempt,
        source: this.sourceLabel,
      });
      return;
    }
    const backoff = Math.min(
      this.initialBackoffMs * Math.pow(2, this.reconnectAttempt),
      this.maxBackoffMs
    );
    const jitter = backoff * (0.8 + Math.random() * 0.4);
    this.reconnectAttempt += 1;
    console.log(
      `[${this.sourceLabel}] Reconnecting in ${Math.round(jitter)}ms (attempt ${this.reconnectAttempt})`
    );
    setTimeout(() => this.connect(), jitter);
  }

  private startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.getSilenceMs() > 15_000) {
        console.warn(`[${this.sourceLabel}] Silence >15s — forcing reconnect`);
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
