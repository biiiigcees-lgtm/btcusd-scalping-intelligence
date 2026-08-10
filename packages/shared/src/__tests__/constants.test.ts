import { describe, it, expect } from "vitest";
import { DATA_QUALITY_THRESHOLD, SYMBOL, PLACEHOLDER_MODEL_VERSION } from "../constants";

describe("constants", () => {
  it("symbol is BTCUSDT", () => expect(SYMBOL).toBe("BTCUSDT"));
  it("quality threshold in (0,1]", () => {
    expect(DATA_QUALITY_THRESHOLD).toBeGreaterThan(0);
    expect(DATA_QUALITY_THRESHOLD).toBeLessThanOrEqual(1);
  });
  it("baseline model version", () => expect(PLACEHOLDER_MODEL_VERSION).toContain("baseline"));
});
