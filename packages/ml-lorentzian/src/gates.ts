import type { SignalDirection } from "@btc/shared";
import { DATA_QUALITY_THRESHOLD } from "@btc/shared";
import type { ClassLabel } from "./labels";
import type { LorentzianInference } from "./classifier";
import {
  CONFIDENCE_THRESHOLD,
  SIGNAL_COOLDOWN_MINUTES,
  CONFIDENCE_DELTA_REFIRE,
  MODEL_VERSION,
} from "./constants";

export type GatedSignal = {
  direction: SignalDirection;
  label: "NO TRADE" | "LONG" | "SHORT";
  confidence: number;
  modelVersion: string;
  explanation: {
    what: string;
    why: string[];
    supporting: string[];
    contradictory: string[];
    calibrationNote: string;
  };
};

type LastSignal = {
  direction: "long" | "short";
  confidence: number;
  atMs: number;
};

let lastSignal: LastSignal | null = null;

export function resetSignalMemory() {
  lastSignal = null;
}

function classToDirection(c: ClassLabel): SignalDirection {
  if (c === "long") return "long";
  if (c === "short") return "short";
  return null;
}

/**
 * Apply hard gates: quality, readiness, confidence threshold, cooldown/hysteresis.
 * Always returns a full GatedSignal (defaults to NO TRADE).
 */
export function gateInference(
  inference: LorentzianInference,
  dataQuality: number,
  nowMs = Date.now()
): GatedSignal {
  const why: string[] = [
    `Model ${MODEL_VERSION} (Lorentzian KNN)`,
    `Pool ${inference.poolSize} · k=${inference.neighborCount}`,
  ];
  const supporting: string[] = [];
  const contradictory: string[] = [];

  const noTrade = (
    what: string,
    extraContradictory: string[] = []
  ): GatedSignal => ({
    direction: null,
    label: "NO TRADE",
    confidence: 0,
    modelVersion: inference.modelVersion,
    explanation: {
      what,
      why,
      supporting,
      contradictory: [...contradictory, ...extraContradictory],
      calibrationNote:
        "Wilson lower-bound on neighbor class vote; human remains final decision maker",
    },
  });

  if (dataQuality < DATA_QUALITY_THRESHOLD) {
    return noTrade("NO TRADE — data quality below threshold", [
      `data_quality ${(dataQuality * 100).toFixed(0)}% < ${(DATA_QUALITY_THRESHOLD * 100).toFixed(0)}%`,
    ]);
  }
  supporting.push(`Data quality ${(dataQuality * 100).toFixed(0)}% ≥ threshold`);

  if (!inference.ready) {
    return noTrade("NO TRADE — classifier not ready", [
      inference.reason ?? "not_ready",
    ]);
  }

  const dir = classToDirection(inference.topClass);
  if (dir == null) {
    return noTrade("NO TRADE — neutral majority among neighbors", [
      `P(neutral)=${(inference.distribution.neutral * 100).toFixed(0)}%`,
    ]);
  }

  why.push(
    `P(long)=${(inference.distribution.long * 100).toFixed(0)}% · P(short)=${(inference.distribution.short * 100).toFixed(0)}% · P(neutral)=${(inference.distribution.neutral * 100).toFixed(0)}%`
  );
  why.push(
    `Wilson LB confidence ${(inference.confidence * 100).toFixed(1)}% (threshold ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%)`
  );

  if (inference.confidence < CONFIDENCE_THRESHOLD) {
    return noTrade("NO TRADE — confidence below hard threshold", [
      `Wilson ${(inference.confidence * 100).toFixed(1)}% < ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%`,
    ]);
  }
  supporting.push(
    `Wilson confidence ${(inference.confidence * 100).toFixed(1)}% clears ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}% gate`
  );

  // Cooldown / hysteresis
  if (lastSignal) {
    const elapsedMin = (nowMs - lastSignal.atMs) / 60_000;
    const sameDir = lastSignal.direction === dir;
    const confDelta = inference.confidence - lastSignal.confidence;
    const flipped = !sameDir;

    if (elapsedMin < SIGNAL_COOLDOWN_MINUTES) {
      if (sameDir && confDelta < CONFIDENCE_DELTA_REFIRE) {
        return noTrade("NO TRADE — cooldown (same direction, confidence flat)", [
          `${elapsedMin.toFixed(1)}m < ${SIGNAL_COOLDOWN_MINUTES}m cooldown`,
          `Δconf ${(confDelta * 100).toFixed(1)}pp < ${(CONFIDENCE_DELTA_REFIRE * 100).toFixed(0)}pp`,
        ]);
      }
      if (flipped && inference.confidence < CONFIDENCE_THRESHOLD + 0.05) {
        return noTrade("NO TRADE — cooldown (flip needs higher confidence)", [
          `Flip inside ${SIGNAL_COOLDOWN_MINUTES}m requires conf ≥ ${((CONFIDENCE_THRESHOLD + 0.05) * 100).toFixed(0)}%`,
        ]);
      }
      supporting.push(
        flipped
          ? "Direction flip with elevated confidence — cooldown override"
          : `Confidence rose ${(confDelta * 100).toFixed(1)}pp — cooldown override`
      );
    }
  }

  lastSignal = { direction: dir, confidence: inference.confidence, atMs: nowMs };

  return {
    direction: dir,
    label: dir === "long" ? "LONG" : "SHORT",
    confidence: inference.confidence,
    modelVersion: inference.modelVersion,
    explanation: {
      what: `${dir.toUpperCase()} — Lorentzian KNN on 15m features`,
      why,
      supporting,
      contradictory,
      calibrationNote:
        "Wilson lower-bound on k-NN class votes; walk-forward labels only; human remains final decision maker",
    },
  };
}
