import { describe, it, expect } from "vitest";
import { detectRegime } from "../index";

describe("detectRegime", () => {
  it("flags high_volatility", () => {
    expect(detectRegime(0.03, 0, 0, "2026-01-01T00:00:00.000Z").regime).toBe("high_volatility");
  });
  it("flags trending_up", () => {
    expect(detectRegime(0.005, 0.6, 0, "2026-01-01T00:00:00.000Z").regime).toBe("trending_up");
  });
});
