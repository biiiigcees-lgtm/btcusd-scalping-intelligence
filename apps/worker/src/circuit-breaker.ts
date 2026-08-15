/**
 * Live performance circuit breaker + promotion gate scaffold.
 *
 * - Tracks recent signal outcomes (win/loss) in a trailing window.
 * - If live hit-rate falls meaningfully below expected, force NO TRADE-only mode.
 * - Promotion: a candidate modelVersion is only accepted if held-out walk-forward
 *   accuracy beats the currently live version (auto-promotion gate, not blind deploy).
 */

export type Outcome = "win" | "loss" | "flat" | "unknown";

export type CircuitState = {
  open: boolean; // true = tripped → NO TRADE only
  reason: string;
  liveHitRate: number | null;
  sampleSize: number;
  liveModelVersion: string;
  candidateModelVersion: string | null;
};

const TRAILING_WINDOW = 40;
/** Minimum samples before breaker can trip */
const MIN_SAMPLES = 15;
/** Expected baseline hit rate (placeholder until backtest fills it) */
const EXPECTED_HIT_RATE = 0.55;
/** Trip when live is this far below expected */
const DRAWDOWN_TOLERANCE = 0.12;

export class CircuitBreaker {
  private outcomes: Array<{ at: number; outcome: Outcome; modelVersion: string }> =
    [];
  private open = false;
  private reason = "ok";
  private liveModelVersion: string;
  private candidateModelVersion: string | null = null;
  private candidateHeldOutHitRate: number | null = null;

  constructor(initialModelVersion: string) {
    this.liveModelVersion = initialModelVersion;
  }

  recordOutcome(outcome: Outcome, modelVersion: string) {
    this.outcomes.push({ at: Date.now(), outcome, modelVersion });
    if (this.outcomes.length > TRAILING_WINDOW * 2) {
      this.outcomes = this.outcomes.slice(-TRAILING_WINDOW * 2);
    }
    this.evaluate();
  }

  /**
   * Propose a new model version with its held-out walk-forward hit rate.
   * Promotes only if it beats the live version's recent live hit rate
   * (or expected baseline when live sample is thin).
   */
  proposePromotion(
    candidateVersion: string,
    heldOutHitRate: number
  ): { promoted: boolean; reason: string } {
    this.candidateModelVersion = candidateVersion;
    this.candidateHeldOutHitRate = heldOutHitRate;

    const live = this.liveHitRate();
    const benchmark =
      live.sampleSize >= MIN_SAMPLES && live.rate != null
        ? live.rate
        : EXPECTED_HIT_RATE;

    if (heldOutHitRate > benchmark + 0.02) {
      this.liveModelVersion = candidateVersion;
      this.candidateModelVersion = null;
      this.open = false;
      this.reason = `promoted:${candidateVersion}`;
      console.log(
        `[circuit] Promoted ${candidateVersion} (heldOut=${heldOutHitRate.toFixed(3)} > bench=${benchmark.toFixed(3)})`
      );
      return { promoted: true, reason: this.reason };
    }

    return {
      promoted: false,
      reason: `heldOut ${heldOutHitRate.toFixed(3)} did not beat benchmark ${benchmark.toFixed(3)}`,
    };
  }

  /** When tripped, directional signals must be suppressed */
  shouldSuppressDirectional(): boolean {
    return this.open;
  }

  getLiveModelVersion(): string {
    return this.liveModelVersion;
  }

  getState(): CircuitState {
    const live = this.liveHitRate();
    return {
      open: this.open,
      reason: this.reason,
      liveHitRate: live.rate,
      sampleSize: live.sampleSize,
      liveModelVersion: this.liveModelVersion,
      candidateModelVersion: this.candidateModelVersion,
    };
  }

  private liveHitRate(): { rate: number | null; sampleSize: number } {
    const recent = this.outcomes
      .filter((o) => o.modelVersion === this.liveModelVersion)
      .slice(-TRAILING_WINDOW)
      .filter((o) => o.outcome === "win" || o.outcome === "loss");
    if (recent.length === 0) return { rate: null, sampleSize: 0 };
    const wins = recent.filter((o) => o.outcome === "win").length;
    return { rate: wins / recent.length, sampleSize: recent.length };
  }

  private evaluate() {
    const live = this.liveHitRate();
    if (live.sampleSize < MIN_SAMPLES || live.rate == null) {
      // Not enough evidence to trip or clear
      return;
    }

    if (live.rate < EXPECTED_HIT_RATE - DRAWDOWN_TOLERANCE) {
      if (!this.open) {
        console.warn(
          `[circuit] TRIPPED liveHitRate=${live.rate.toFixed(3)} sample=${live.sampleSize} — NO TRADE only`
        );
      }
      this.open = true;
      this.reason = `live_hit_rate_${live.rate.toFixed(3)}_below_floor`;
    } else if (this.open && live.rate >= EXPECTED_HIT_RATE - DRAWDOWN_TOLERANCE / 2) {
      console.log(
        `[circuit] CLEARED liveHitRate=${live.rate.toFixed(3)} — directional allowed again`
      );
      this.open = false;
      this.reason = "recovered";
    }
  }
}
