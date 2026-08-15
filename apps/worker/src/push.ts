/**
 * Web Push sender — only called after the same gates as the UI signal panel.
 * Subscriptions stored in Redis set REDIS_PUSH_SUBS_KEY.
 */
import webpush from "web-push";
import type Redis from "ioredis";
import { REDIS_PUSH_SUBS_KEY, PUSH_ANTICIPATION_THRESHOLD } from "@btc/shared";

let configured = false;

export function initPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:ops@localhost";
  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID keys not set — web push disabled");
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  console.log("[push] Web push enabled");
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPushToAll(redis: Redis, redisReady: boolean, payload: PushPayload) {
  if (!configured || !redisReady) return;
  try {
    const members = await redis.smembers(REDIS_PUSH_SUBS_KEY);
    if (!members.length) return;
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || "/",
      tag: payload.tag || "btc-signal",
    });
    await Promise.all(
      members.map(async (raw) => {
        try {
          const sub = JSON.parse(raw);
          await webpush.sendNotification(sub, body);
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          // Gone / expired subscription
          if (status === 404 || status === 410) {
            await redis.srem(REDIS_PUSH_SUBS_KEY, raw);
          } else {
            console.warn("[push] send failed", status || (err as Error).message);
          }
        }
      })
    );
  } catch (err) {
    console.error("[push] broadcast error", err);
  }
}

/** Fire only for qualifying directional labels */
export async function notifyDirectional(
  redis: Redis,
  redisReady: boolean,
  label: "LONG" | "SHORT",
  confidence: number,
  price: number
) {
  await sendPushToAll(redis, redisReady, {
    title: `BTCUSD ${label}`,
    body: `Confidence ${(confidence * 100).toFixed(0)}% · $${price.toLocaleString(undefined, { maximumFractionDigits: 0 })} · human decides`,
    tag: `dir-${label}`,
  });
}

/** Fire only when anticipation is high (default ≥ 0.75) */
export async function notifyAnticipation(
  redis: Redis,
  redisReady: boolean,
  score: number,
  label: string
) {
  if (score < PUSH_ANTICIPATION_THRESHOLD) return;
  await sendPushToAll(redis, redisReady, {
    title: "BTCUSD — expansion setup",
    body: `Anticipation ${label} (${(score * 100).toFixed(0)}%) · not directional`,
    tag: "anticipation",
  });
}
