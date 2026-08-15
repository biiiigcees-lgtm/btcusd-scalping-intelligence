import { DATA_QUALITY_THRESHOLD } from "@btc/shared";

export interface QualitySnapshot {
  score: number;
  latencyMs: number;
  silenceMs: number;
  reconnectsRecent: number;
  sourceSwitchesRecent: number;
  activeSource: string;
  reasons: string[];
  lastHealthyAt: string;
}

export class DataQualityTracker {
  private score = 1.0;
  private lastHealthyAt = new Date().toISOString();
  private recentReconnects: number[] = [];
  private recentSourceSwitches: number[] = [];
  private lastTradeReceivedAt = 0;
  private lastTradeLatencyMs = 0;
  private activeSource = "unknown";

  onTrade(tradeTimeIso: string, receivedAtIso: string) {
    const tradeTs = Date.parse(tradeTimeIso);
    const receivedTs = Date.parse(receivedAtIso);
    this.lastTradeLatencyMs = Math.max(0, receivedTs - tradeTs);
    this.lastTradeReceivedAt = receivedTs;
    this.recompute();
  }

  onConnectionStatus(connected: boolean, _reason?: string) {
    if (!connected) {
      this.recentReconnects.push(Date.now());
      const cutoff = Date.now() - 5 * 60_000;
      this.recentReconnects = this.recentReconnects.filter((t) => t > cutoff);
    }
    this.recompute();
  }

  /** Call when FeedManager switches active source — flapping lowers quality */
  onSourceSwitch(source: string, _reason?: string) {
    this.activeSource = source;
    this.recentSourceSwitches.push(Date.now());
    const cutoff = Date.now() - 15 * 60_000;
    this.recentSourceSwitches = this.recentSourceSwitches.filter((t) => t > cutoff);
    this.recompute();
  }

  setActiveSource(source: string) {
    this.activeSource = source;
  }

  onSilence(silenceMs: number) {
    this.recompute(undefined, silenceMs);
  }

  getSnapshot(): QualitySnapshot {
    return {
      score: this.score,
      latencyMs: this.lastTradeLatencyMs,
      silenceMs:
        this.lastTradeReceivedAt === 0
          ? Number.POSITIVE_INFINITY
          : Date.now() - this.lastTradeReceivedAt,
      reconnectsRecent: this.recentReconnects.length,
      sourceSwitchesRecent: this.recentSourceSwitches.length,
      activeSource: this.activeSource,
      reasons: this.buildReasons(),
      lastHealthyAt: this.lastHealthyAt,
    };
  }

  getScore(): number {
    return this.score;
  }

  isHealthy(): boolean {
    return this.score >= DATA_QUALITY_THRESHOLD;
  }

  private recompute(_reason?: string, silenceMsOverride?: number) {
    let score = 1.0;
    const silence =
      silenceMsOverride ??
      (this.lastTradeReceivedAt === 0
        ? Number.POSITIVE_INFINITY
        : Date.now() - this.lastTradeReceivedAt);

    if (this.lastTradeLatencyMs > 2000) score -= 0.3;
    else if (this.lastTradeLatencyMs > 500) score -= 0.1;

    if (silence > 30_000) score -= 0.5;
    else if (silence > 10_000) score -= 0.2;

    if (this.recentReconnects.length >= 5) score -= 0.3;
    else if (this.recentReconnects.length >= 2) score -= 0.1;

    // Flapping between sources is itself a quality defect
    if (this.recentSourceSwitches.length >= 4) score -= 0.25;
    else if (this.recentSourceSwitches.length >= 2) score -= 0.1;

    this.score = Math.max(0, Math.min(1, score));
    if (this.score >= DATA_QUALITY_THRESHOLD) {
      this.lastHealthyAt = new Date().toISOString();
    }
  }

  private buildReasons(): string[] {
    const snap = this.getSnapshot();
    const reasons: string[] = [];
    if (snap.latencyMs > 500) reasons.push(`latency:${snap.latencyMs}ms`);
    if (snap.silenceMs > 10_000)
      reasons.push(`silence:${Math.round(snap.silenceMs / 1000)}s`);
    if (snap.reconnectsRecent > 0)
      reasons.push(`reconnects:${snap.reconnectsRecent}`);
    if (snap.sourceSwitchesRecent > 0)
      reasons.push(`source_switches:${snap.sourceSwitchesRecent}`);
    if (snap.activeSource) reasons.push(`source:${snap.activeSource}`);
    return reasons;
  }
}
