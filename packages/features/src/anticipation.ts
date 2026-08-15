/**
 * "Something big is coming" anticipation score.
 * Independent of directional signal — answers volatility/breakout likelihood, not side.
 *
 * Components (each 0–1, then weighted):
 *  1. Bollinger squeeze proxy — band width vs recent average (compression → expansion setup)
 *  2. Volume intensity acceleration — recent volume vs longer baseline
 *  3. Range extreme — proximity to local high/low (breakout risk)
 */

export type AnticipationInputBar = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type AnticipationResult = {
  score: number;
  label: "quiet" | "building" | "elevated" | "high";
  components: {
    squeeze: number;
    volumeAccel: number;
    rangeExtreme: number;
  };
  explanation: {
    what: string;
    why: string[];
    supporting: string[];
    contradictory: string[];
  };
};

const BB_PERIOD = 20;
const BB_STD = 2;
const VOL_SHORT = 5;
const VOL_LONG = 20;
const RANGE_LOOKBACK = 20;

function stdev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return Math.sqrt(v);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function labelFor(score: number): AnticipationResult["label"] {
  if (score >= 0.75) return "high";
  if (score >= 0.55) return "elevated";
  if (score >= 0.35) return "building";
  return "quiet";
}

/**
 * Compute anticipation from primary-timeframe OHLCV (oldest → newest).
 * Causal: only uses data available at the last bar.
 */
export function computeAnticipation(bars: AnticipationInputBar[]): AnticipationResult {
  const empty: AnticipationResult = {
    score: 0,
    label: "quiet",
    components: { squeeze: 0, volumeAccel: 0, rangeExtreme: 0 },
    explanation: {
      what: "Quiet — insufficient history for anticipation",
      why: ["Need more primary-TF bars"],
      supporting: [],
      contradictory: ["history_too_short"],
    },
  };

  if (bars.length < Math.max(BB_PERIOD, VOL_LONG, RANGE_LOOKBACK) + 2) {
    return empty;
  }

  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const n = bars.length;
  const i = n - 1;

  // --- 1. Bollinger squeeze ---
  // bandwidth = (upper - lower) / mid; compare current BW to median of recent BWs
  const bandwidths: number[] = [];
  for (let j = BB_PERIOD - 1; j <= i; j++) {
    const window = closes.slice(j - BB_PERIOD + 1, j + 1);
    const mid = window.reduce((a, b) => a + b, 0) / window.length;
    const sd = stdev(window);
    const bw = mid > 0 ? (2 * BB_STD * sd) / mid : 0;
    bandwidths.push(bw);
  }
  const currentBw = bandwidths[bandwidths.length - 1] ?? 0;
  const recentBw = bandwidths.slice(-30);
  const sorted = [...recentBw].sort((a, b) => a - b);
  const medianBw = sorted[Math.floor(sorted.length / 2)] || 1e-9;
  // Low current BW vs median → high squeeze score
  const squeezeRatio = medianBw > 0 ? currentBw / medianBw : 1;
  // Map: ratio 0.4 → ~1.0, ratio 1.0 → ~0.2, ratio ≥1.5 → ~0
  const squeeze = clamp01(1.2 - squeezeRatio);

  // --- 2. Volume acceleration ---
  const shortVol =
    volumes.slice(-VOL_SHORT).reduce((a, b) => a + b, 0) / VOL_SHORT;
  const longVol =
    volumes.slice(-VOL_LONG).reduce((a, b) => a + b, 0) / VOL_LONG;
  const volRatio = longVol > 0 ? shortVol / longVol : 1;
  // Elevated short-term volume → higher score (building pressure)
  // Also reward a recent uptick from a quiet base
  const volumeAccel = clamp01((volRatio - 0.7) / 1.3);

  // --- 3. Range extreme ---
  const rangeWindow = closes.slice(-RANGE_LOOKBACK);
  const hi = Math.max(...rangeWindow);
  const lo = Math.min(...rangeWindow);
  const span = hi - lo || 1e-9;
  const pos = (closes[i] - lo) / span; // 0 = low, 1 = high
  // Extreme near edges (either side) raises breakout risk
  const edgeDist = Math.min(pos, 1 - pos); // 0 at edge, 0.5 at mid
  const rangeExtreme = clamp01(1 - edgeDist * 2.2);

  // Weighted blend — squeeze is the strongest classic "coiling" signal
  const score = clamp01(0.45 * squeeze + 0.3 * volumeAccel + 0.25 * rangeExtreme);
  const label = labelFor(score);

  const why = [
    `BB squeeze score ${(squeeze * 100).toFixed(0)}% (bw/median=${squeezeRatio.toFixed(2)})`,
    `Volume accel ${(volumeAccel * 100).toFixed(0)}% (short/long=${volRatio.toFixed(2)})`,
    `Range extreme ${(rangeExtreme * 100).toFixed(0)}% (pos=${(pos * 100).toFixed(0)}% of ${RANGE_LOOKBACK}-bar range)`,
  ];
  const supporting: string[] = [];
  const contradictory: string[] = [];

  if (squeeze >= 0.5) supporting.push("Volatility compression (Bollinger squeeze)");
  else contradictory.push("Bandwidth not compressed vs recent median");

  if (volumeAccel >= 0.45) supporting.push("Short-horizon volume elevated vs baseline");
  else contradictory.push("Volume not accelerating");

  if (rangeExtreme >= 0.5) supporting.push("Price near local range extreme");
  else contradictory.push("Price mid-range — breakout less imminent");

  const whatMap = {
    quiet: "Quiet — no strong expansion setup",
    building: "Building — early compression / pressure signs",
    elevated: "Elevated — expansion setup forming",
    high: "High — volatility expansion / breakout conditions elevated",
  };

  return {
    score,
    label,
    components: { squeeze, volumeAccel, rangeExtreme },
    explanation: {
      what: whatMap[label],
      why,
      supporting,
      contradictory,
    },
  };
}
