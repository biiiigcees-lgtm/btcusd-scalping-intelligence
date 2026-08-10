import { describe, it, expect } from "vitest";
import { calculateMvpFeatures } from "../index";

describe("calculateMvpFeatures", () => {
  it("returns empty values when fewer than 2 prices", () => {
    const result = calculateMvpFeatures([100], [1], "2026-01-01T00:00:00.000Z", 1);
    expect(result.values).toEqual({});
    expect(result.quality).toBe(0);
  });

  it("computes return and vol", () => {
    const result = calculateMvpFeatures([100, 101, 102, 101], [1, 2, 1.5, 3], "2026-01-01T00:00:00.000Z", 0.95);
    expect(result.quality).toBe(0.95);
    expect(result.values.price).toBe(101);
    expect(result.values.realized_vol).toBeGreaterThanOrEqual(0);
  });
});
