import { describe, it, expect } from "vitest";
import { lorentzianDistance } from "../distance";
import { wilsonLowerBound } from "../wilson";
import { buildLabels } from "../labels";
import { LorentzianClassifier } from "../classifier";
import { gateInference, resetSignalMemory } from "../gates";
import type { Ohlcv, FeatureRow } from "../indicators";
import { CONFIDENCE_THRESHOLD } from "../constants";

describe("lorentzianDistance", () => {
  it("is zero for identical vectors", () => {
    const a: FeatureRow = { rsi: 1, willr: 0, cci: -1, adx: 0.5, rvol: 0.2 };
    expect(lorentzianDistance(a, a)).toBe(0);
  });

  it("increases with feature divergence", () => {
    const a: FeatureRow = { rsi: 0, willr: 0, cci: 0, adx: 0, rvol: 0 };
    const b: FeatureRow = { rsi: 1, willr: 0, cci: 0, adx: 0, rvol: 0 };
    const c: FeatureRow = { rsi: 3, willr: 2, cci: 1, adx: 0, rvol: 0 };
    expect(lorentzianDistance(a, b)).toBeLessThan(lorentzianDistance(a, c));
  });
});

describe("wilsonLowerBound", () => {
  it("is below raw proportion for small samples", () => {
    const lb = wilsonLowerBound(7, 8);
    expect(lb).toBeLessThan(7 / 8);
    expect(lb).toBeGreaterThan(0.4);
  });

  it("returns 0 for empty", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });
});

describe("buildLabels", () => {
  it("labels forward returns without looking ahead on the last bars", () => {
    const closes = [100, 100, 100, 100, 101, 102, 103, 104, 105];
    const labels = buildLabels(closes, 2, 0.005);
    // last 2 bars have no complete forward window
    expect(labels[labels.length - 1]).toBeNull();
    expect(labels[labels.length - 2]).toBeNull();
  });
});

describe("LorentzianClassifier + gates", () => {
  it("stays NO TRADE when history is short", () => {
    resetSignalMemory();
    const clf = new LorentzianClassifier();
    const bars: Ohlcv[] = [];
    for (let i = 0; i < 30; i++) {
      const p = 65000 + i * 10;
      bars.push({ open: p, high: p + 5, low: p - 5, close: p, volume: 1 });
    }
    clf.setBars(bars);
    const inf = clf.infer();
    const gated = gateInference(inf, 0.95);
    expect(gated.label).toBe("NO TRADE");
  });

  it("suppresses when data quality is low even if inference were ready", () => {
    resetSignalMemory();
    const fakeReady = {
      distribution: { long: 0.75, short: 0.125, neutral: 0.125 },
      topClass: "long" as const,
      confidence: 0.9,
      neighborCount: 8,
      poolSize: 40,
      modelVersion: "test",
      neighborMeta: [],
      ready: true,
    };
    const gated = gateInference(fakeReady, 0.5);
    expect(gated.label).toBe("NO TRADE");
    expect(gated.explanation.contradictory.some((c) => c.includes("data_quality"))).toBe(
      true
    );
  });

  it("requires confidence threshold", () => {
    resetSignalMemory();
    const lowConf = {
      distribution: { long: 0.5, short: 0.25, neutral: 0.25 },
      topClass: "long" as const,
      confidence: CONFIDENCE_THRESHOLD - 0.1,
      neighborCount: 8,
      poolSize: 40,
      modelVersion: "test",
      neighborMeta: [],
      ready: true,
    };
    const gated = gateInference(lowConf, 0.95);
    expect(gated.label).toBe("NO TRADE");
  });
});
