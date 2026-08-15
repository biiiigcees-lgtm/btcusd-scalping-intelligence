import type { GatedSignal } from "@btc/ml-lorentzian";
import type { AnticipationResult } from "@btc/features";
import {
  isNotifyEnabled,
  sendTelegram,
  formatDirectionalAlert,
  formatAnticipationAlert,
} from "./telegram";

/** Anticipation must clear this to notify (avoid quiet/building noise) */
const ANTICIPATION_NOTIFY_FLOOR = Number(
  process.env.NOTIFY_ANTICIPATION_FLOOR || 0.75
);

let lastDirectionalKey = "";
let lastAnticipationKey = "";

export { isNotifyEnabled };

/**
 * Notify on a newly earned directional signal only.
 * Caller must pass an already-gated LONG/SHORT signal.
 */
export async function notifyDirectional(
  signal: GatedSignal,
  price: number,
  timeframe: string
): Promise<void> {
  if (!isNotifyEnabled()) return;
  if (signal.direction == null || signal.label === "NO TRADE") return;

  const key = `${signal.label}:${signal.modelVersion}:${Math.round(signal.confidence * 100)}`;
  if (key === lastDirectionalKey) return;
  lastDirectionalKey = key;

  const text = formatDirectionalAlert({
    label: signal.label as "LONG" | "SHORT",
    confidence: signal.confidence,
    price,
    timeframe,
    modelVersion: signal.modelVersion,
    what: signal.explanation.what,
  });
  await sendTelegram(text);
}

/**
 * Notify only on high anticipation (default ≥ 75%).
 * Independent of directional — can fire even when NO TRADE.
 */
export async function notifyAnticipation(
  ant: AnticipationResult,
  price: number,
  timeframe: string
): Promise<void> {
  if (!isNotifyEnabled()) return;
  if (ant.score < ANTICIPATION_NOTIFY_FLOOR) return;
  if (ant.label !== "high" && ant.label !== "elevated") return;

  const bucket = Math.floor(ant.score * 10);
  const key = `${ant.label}:${bucket}`;
  if (key === lastAnticipationKey) return;
  lastAnticipationKey = key;

  const text = formatAnticipationAlert({
    label: ant.label,
    score: ant.score,
    price,
    timeframe,
    what: ant.explanation.what,
  });
  await sendTelegram(text);
}
