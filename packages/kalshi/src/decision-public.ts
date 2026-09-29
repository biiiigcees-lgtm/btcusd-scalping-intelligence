/**
 * PUBLIC_PROXY decision policy (hardened).
 *
 * Free path has no CFB BRTI → never emit YES/NO as actionable.
 * Allowed: WATCH | NO_TRADE | INVALID
 */

import type { PublicOrderbook } from "./public-client";

export type PublicDecision = "WATCH" | "NO_TRADE" | "INVALID";

export interface PublicDecisionInput {
  book: PublicOrderbook;
  spot: number | null;
  strike: number | null;
  closeTimestampMs: number | null;
  nowMs: number;
}

export interface PublicDecisionResult {
  decision: PublicDecision;
  netEdge: number | null;
  modelProbability: number | null;
  marketProbability: number | null;
  reasons: string[];
}

function mid(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return Number(((a + b) / 2).toFixed(4));
}

export function publicProxyDecision(
  input: PublicDecisionInput
): PublicDecisionResult {
  const { book, spot, strike, closeTimestampMs, nowMs } = input;
  const reasons: string[] = [];
  const marketP = mid(book.yesBestBid, book.yesBestAsk);

  if (closeTimestampMs != null && nowMs >= closeTimestampMs) {
    reasons.push("MARKET_CLOSED");
    return {
      decision: "NO_TRADE",
      netEdge: null,
      modelProbability: null,
      marketProbability: marketP,
      reasons,
    };
  }

  // Final minute: CFB 60s averaging window — public proxy must not act
  if (closeTimestampMs != null && nowMs >= closeTimestampMs - 60_000) {
    reasons.push("SETTLEMENT_WINDOW_ACTIVE");
    return {
      decision: "NO_TRADE",
      netEdge: null,
      modelProbability: null,
      marketProbability: marketP,
      reasons,
    };
  }

  if (
    book.status === "EMPTY" ||
    (book.yesBestBid == null && book.noBestBid == null)
  ) {
    reasons.push("ORDERBOOK_EMPTY");
    return {
      decision: "NO_TRADE",
      netEdge: null,
      modelProbability: null,
      marketProbability: marketP,
      reasons,
    };
  }

  if (
    spot == null ||
    strike == null ||
    !Number.isFinite(spot) ||
    !Number.isFinite(strike)
  ) {
    reasons.push("SPOT_OR_STRIKE_MISSING");
    return {
      decision: "NO_TRADE",
      netEdge: null,
      modelProbability: null,
      marketProbability: marketP,
      reasons,
    };
  }

  // Display-only soft model (never used to emit YES/NO)
  const rel = (spot - strike) / strike;
  const modelP = Math.max(0.05, Math.min(0.95, 0.5 + rel * 20));
  const costBuffer = 0.03;
  const netEdge =
    marketP != null
      ? Number((modelP - marketP - costBuffer).toFixed(4))
      : null;

  reasons.push("PUBLIC_PROXY_NO_CFB");
  reasons.push("YES_NO_REQUIRES_CFB_DIRECT");

  if (netEdge != null && netEdge >= 0.03) {
    reasons.push("EDGE_PRESENT_BUT_ESTIMATED_ONLY");
    return {
      decision: "WATCH",
      netEdge,
      modelProbability: modelP,
      marketProbability: marketP,
      reasons,
    };
  }

  return {
    decision: "NO_TRADE",
    netEdge,
    modelProbability: modelP,
    marketProbability: marketP,
    reasons,
  };
}
