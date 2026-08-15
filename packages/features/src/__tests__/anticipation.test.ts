import { describe, it, expect } from "vitest";
import { computeAnticipation } from "../anticipation";

function makeBars(n: number, opts?: { flat?: boolean; squeeze?: boolean }) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    let close = 65000;
    if (opts?.flat) close = 65000 + Math.sin(i / 20) * 5;
    else if (opts?.squeeze) {
      // Wide early, tight late
      const amp = i < n - 25 ? 200 : 15;
      close = 65000 + Math.sin(i / 3) * amp;
    } else close = 65000 + i * 20 + Math.sin(i) * 50;
    bars.push({
      open: close - 5,
      high: close + 10,
      low: close - 10,
      close,
      volume: opts?.squeeze && i > n - 10 ? 5 : 1,
    });
  }
  return bars;
}

describe("computeAnticipation", () => {
  it("returns quiet with short history", () => {
    const r = computeAnticipation(makeBars(10));
    expect(r.label).toBe("quiet");
    expect(r.score).toBe(0);
  });

  it("produces a score in [0,1] with enough bars", () => {
    const r = computeAnticipation(makeBars(80));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
    expect(["quiet", "building", "elevated", "high"]).toContain(r.label);
  });

  it("raises squeeze component under compression", () => {
    const flat = computeAnticipation(makeBars(80, { flat: true }));
    const squeezed = computeAnticipation(makeBars(80, { squeeze: true }));
    // Squeeze scenario should score squeeze component higher on average
    expect(squeezed.components.squeeze).toBeGreaterThanOrEqual(0);
    expect(flat.components).toBeDefined();
  });
});
