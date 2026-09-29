import { describe, it, expect } from "vitest";
import {
  roundHalfUp2dp,
  isInsideSettlementWindow,
  computeOfficialSettlement,
} from "./settlement";

describe("roundHalfUp2dp", () => {
  it("rounds half up", () => {
    expect(roundHalfUp2dp(1.005)).toBe(1.01);
    expect(roundHalfUp2dp(1.004)).toBe(1.0);
    expect(roundHalfUp2dp(84015.875)).toBe(84015.88);
  });
});

describe("settlement window", () => {
  const C = 1_000_000;
  it("excludes C-60s exactly, includes C", () => {
    expect(isInsideSettlementWindow(C - 60_000, C)).toBe(false);
    expect(isInsideSettlementWindow(C - 59_999, C)).toBe(true);
    expect(isInsideSettlementWindow(C, C)).toBe(true);
    expect(isInsideSettlementWindow(C + 1, C)).toBe(false);
  });
});

describe("computeOfficialSettlement", () => {
  it("averages in-window samples", () => {
    const close = 1_000_000;
    const observations = Array.from({ length: 60 }, (_, i) => ({
      tsMs: close - 59_000 + i * 1000,
      value: 100 + i * 0.01,
    }));
    const r = computeOfficialSettlement(observations, close);
    expect(r.count).toBe(60);
    expect(r.complete).toBe(true);
    expect(r.rounded).not.toBeNull();
  });
});
