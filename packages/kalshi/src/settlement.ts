/**
 * Kalshi CFB BRTI settlement rules (pure).
 * Official: simple average of 60 one-second RTI samples in (C-60s, C],
 * half-up to 2 decimal places.
 */

export function roundHalfUp2dp(value: number): number {
  // Avoid FP edge (e.g. 1.005 → 1.01)
  const scaled = value * 100 + Math.sign(value) * 1e-7;
  return Math.round(scaled) / 100;
}

export function isInsideSettlementWindow(
  observationTsMs: number,
  closeTsMs: number
): boolean {
  // (C-60s, C]  — exclusive left, inclusive right
  return observationTsMs > closeTsMs - 60_000 && observationTsMs <= closeTsMs;
}

export function computeOfficialSettlement(
  observations: readonly { tsMs: number; value: number }[],
  closeTsMs: number
): {
  average: number | null;
  rounded: number | null;
  count: number;
  complete: boolean;
} {
  const inWindow = observations.filter((o) =>
    isInsideSettlementWindow(o.tsMs, closeTsMs)
  );
  if (inWindow.length === 0) {
    return { average: null, rounded: null, count: 0, complete: false };
  }
  const sum = inWindow.reduce((a, o) => a + o.value, 0);
  const average = sum / inWindow.length;
  return {
    average,
    rounded: roundHalfUp2dp(average),
    count: inWindow.length,
    complete: inWindow.length >= 60,
  };
}
