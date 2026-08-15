/**
 * Causal technical indicators on OHLCV arrays.
 * All values at index i use only data up to and including i (no look-ahead).
 */

export type Ohlcv = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function sma(values: number[], period: number, end: number): number | null {
  if (end + 1 < period) return null;
  let sum = 0;
  for (let i = end - period + 1; i <= end; i++) sum += values[i];
  return sum / period;
}

function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** RSI (Wilder) */
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** Williams %R */
export function williamsR(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, highs[j]);
      ll = Math.min(ll, lows[j]);
    }
    const range = hh - ll;
    out[i] = range === 0 ? -50 : ((hh - closes[i]) / range) * -100;
  }
  return out;
}

/** Commodity Channel Index */
export function cci(highs: number[], lows: number[], closes: number[], period = 20): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  for (let i = period - 1; i < closes.length; i++) {
    const mean = sma(tp, period, i);
    if (mean == null) continue;
    let mad = 0;
    for (let j = i - period + 1; j <= i; j++) mad += Math.abs(tp[j] - mean);
    mad /= period;
    out[i] = mad === 0 ? 0 : (tp[i] - mean) / (0.015 * mad);
  }
  return out;
}

/** ADX (simplified Wilder) — returns ADX only */
export function adx(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period * 2) return out;

  const tr: number[] = new Array(n).fill(0);
  const plusDm: number[] = new Array(n).fill(0);
  const minusDm: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }

  let atr = 0;
  let pDm = 0;
  let mDm = 0;
  for (let i = 1; i <= period; i++) {
    atr += tr[i];
    pDm += plusDm[i];
    mDm += minusDm[i];
  }
  atr /= period;
  pDm /= period;
  mDm /= period;

  const dx: number[] = new Array(n).fill(0);
  for (let i = period; i < n; i++) {
    if (i > period) {
      atr = (atr * (period - 1) + tr[i]) / period;
      pDm = (pDm * (period - 1) + plusDm[i]) / period;
      mDm = (mDm * (period - 1) + minusDm[i]) / period;
    }
    const pDi = atr === 0 ? 0 : (pDm / atr) * 100;
    const mDi = atr === 0 ? 0 : (mDm / atr) * 100;
    const sum = pDi + mDi;
    dx[i] = sum === 0 ? 0 : (Math.abs(pDi - mDi) / sum) * 100;
  }

  // Smooth DX into ADX
  let adxVal = 0;
  let count = 0;
  for (let i = period; i < period * 2 && i < n; i++) {
    adxVal += dx[i];
    count++;
  }
  if (count === 0) return out;
  adxVal /= count;
  out[period * 2 - 1] = adxVal;
  for (let i = period * 2; i < n; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period;
    out[i] = adxVal;
  }
  return out;
}

/** Realized volatility of log returns over lookback */
export function realizedVol(closes: number[], lookback = 20): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = lookback; i < closes.length; i++) {
    const rets: number[] = [];
    for (let j = i - lookback + 1; j <= i; j++) {
      if (closes[j - 1] > 0) rets.push(Math.log(closes[j] / closes[j - 1]));
    }
    if (rets.length < 2) continue;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

export type FeatureRow = {
  rsi: number;
  willr: number;
  cci: number;
  adx: number;
  rvol: number;
};

/** Build raw (pre-Z) feature matrix aligned to bar index */
export function computeRawFeatures(bars: Ohlcv[]): (FeatureRow | null)[] {
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);

  const rsiA = rsi(closes, 14);
  const willA = williamsR(highs, lows, closes, 14);
  const cciA = cci(highs, lows, closes, 20);
  const adxA = adx(highs, lows, closes, 14);
  const volA = realizedVol(closes, 20);

  return bars.map((_, i) => {
    if (
      rsiA[i] == null ||
      willA[i] == null ||
      cciA[i] == null ||
      adxA[i] == null ||
      volA[i] == null
    ) {
      return null;
    }
    return {
      rsi: rsiA[i] as number,
      willr: willA[i] as number,
      cci: cciA[i] as number,
      adx: adxA[i] as number,
      rvol: volA[i] as number,
    };
  });
}

/** Z-score each feature over a trailing lookback window (causal). */
export function zScoreFeatures(
  raw: (FeatureRow | null)[],
  lookback: number
): (FeatureRow | null)[] {
  const keys: (keyof FeatureRow)[] = ["rsi", "willr", "cci", "adx", "rvol"];
  const out: (FeatureRow | null)[] = new Array(raw.length).fill(null);

  for (let i = 0; i < raw.length; i++) {
    if (!raw[i]) continue;
    const window: FeatureRow[] = [];
    for (let j = Math.max(0, i - lookback + 1); j <= i; j++) {
      if (raw[j]) window.push(raw[j] as FeatureRow);
    }
    if (window.length < Math.min(20, lookback / 2)) continue;

    const z: FeatureRow = { rsi: 0, willr: 0, cci: 0, adx: 0, rvol: 0 };
    for (const k of keys) {
      const vals = window.map((w) => w[k]);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance =
        vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      const std = Math.sqrt(variance) || 1e-9;
      z[k] = ((raw[i] as FeatureRow)[k] - mean) / std;
    }
    out[i] = z;
  }
  return out;
}
