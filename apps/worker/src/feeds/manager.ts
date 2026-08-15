/**
 * Hot-standby feed manager.
 * Keeps primary + standby WebSockets both connected.
 * On primary silence > threshold, instantly routes trades from the warm standby.
 */
import type { Trade } from "@btc/shared";
import { SYMBOL } from "@btc/shared";
import { BinanceTradeFeed } from "./binance";

const PRIMARY_URL =
  process.env.BINANCE_WS_URL ||
  `wss://stream.binance.com:9443/ws/${SYMBOL.toLowerCase()}@trade`;
const STANDBY_URL =
  process.env.BINANCE_US_WS_URL ||
  `wss://stream.binance.us:9443/ws/${SYMBOL.toLowerCase()}@trade`;

/** Silence on active source before switching (ms) */
const FAILOVER_SILENCE_MS = Number(process.env.FEED_FAILOVER_SILENCE_MS || 8_000);

export type FeedManagerCallbacks = {
  onTrade: (trade: Trade, source: string) => void;
  onActiveSourceChange: (source: string, reason: string) => void;
  onStatus: (info: {
    source: string;
    connected: boolean;
    reason?: string;
  }) => void;
};

export class FeedManager {
  private primary: BinanceTradeFeed;
  private standby: BinanceTradeFeed;
  private active: "primary" | "standby" = "primary";
  private monitorTimer: NodeJS.Timeout | null = null;
  private readonly cbs: FeedManagerCallbacks;
  private lastSwitchAt = 0;

  constructor(cbs: FeedManagerCallbacks) {
    this.cbs = cbs;

    this.primary = new BinanceTradeFeed({
      url: PRIMARY_URL,
      sourceLabel: "binance-global",
      exchange: "binance",
      onTrade: (t) => this.handleTrade("primary", t),
      onStatus: (s) =>
        this.cbs.onStatus({
          source: s.source,
          connected: s.connected,
          reason: s.reason,
        }),
    });

    this.standby = new BinanceTradeFeed({
      url: STANDBY_URL,
      sourceLabel: "binance-us",
      exchange: "binance",
      onTrade: (t) => this.handleTrade("standby", t),
      onStatus: (s) =>
        this.cbs.onStatus({
          source: s.source,
          connected: s.connected,
          reason: s.reason,
        }),
    });
  }

  start() {
    console.log("[feed-manager] Starting primary + standby (hot)");
    this.primary.start();
    this.standby.start();
    this.monitorTimer = setInterval(() => this.monitor(), 2_000);
  }

  stop() {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.primary.stop();
    this.standby.stop();
  }

  getActiveSource(): string {
    return this.active === "primary"
      ? this.primary.getSourceLabel()
      : this.standby.getSourceLabel();
  }

  getSilenceMs(): number {
    const feed = this.active === "primary" ? this.primary : this.standby;
    return feed.getSilenceMs();
  }

  isAnyConnected(): boolean {
    return this.primary.isConnected() || this.standby.isConnected();
  }

  private handleTrade(from: "primary" | "standby", trade: Trade) {
    // Only forward from the active source to avoid double-counting
    if (from !== this.active) return;
    const label =
      from === "primary"
        ? this.primary.getSourceLabel()
        : this.standby.getSourceLabel();
    this.cbs.onTrade(trade, label);
  }

  private monitor() {
    const primarySilence = this.primary.getSilenceMs();
    const standbySilence = this.standby.getSilenceMs();

    if (this.active === "primary") {
      if (
        primarySilence > FAILOVER_SILENCE_MS &&
        this.standby.isConnected() &&
        standbySilence < FAILOVER_SILENCE_MS
      ) {
        this.switchTo("standby", `primary_silence_${Math.round(primarySilence)}ms`);
      }
    } else {
      // Prefer returning to primary when it is healthy again
      if (
        this.primary.isConnected() &&
        primarySilence < FAILOVER_SILENCE_MS / 2
      ) {
        this.switchTo("primary", "primary_recovered");
      } else if (
        standbySilence > FAILOVER_SILENCE_MS &&
        this.primary.isConnected() &&
        primarySilence < FAILOVER_SILENCE_MS
      ) {
        this.switchTo("primary", `standby_silence_${Math.round(standbySilence)}ms`);
      }
    }
  }

  private switchTo(next: "primary" | "standby", reason: string) {
    if (this.active === next) return;
    // Debounce rapid flapping
    if (Date.now() - this.lastSwitchAt < 3_000) return;
    this.active = next;
    this.lastSwitchAt = Date.now();
    const label =
      next === "primary"
        ? this.primary.getSourceLabel()
        : this.standby.getSourceLabel();
    console.warn(`[feed-manager] Active → ${label} (${reason})`);
    this.cbs.onActiveSourceChange(label, reason);
  }
}
