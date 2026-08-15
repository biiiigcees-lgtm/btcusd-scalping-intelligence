/**
 * Opt-in Telegram notifier.
 * Fires only when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.
 * Callers must already have applied signal/anticipation gates — this module
 * only enforces its own delivery cooldown to prevent burst spam.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const ENABLED = Boolean(BOT_TOKEN && CHAT_ID);

/** Min seconds between any two messages */
const DELIVERY_COOLDOWN_SEC = Number(process.env.NOTIFY_COOLDOWN_SEC || 60);

let lastSentAt = 0;

export function isNotifyEnabled(): boolean {
  return ENABLED;
}

export async function sendTelegram(text: string): Promise<boolean> {
  if (!ENABLED) return false;

  const now = Date.now();
  if (now - lastSentAt < DELIVERY_COOLDOWN_SEC * 1000) {
    console.log("[notify] skipped — delivery cooldown");
    return false;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[notify] Telegram API error", res.status, body.slice(0, 200));
      return false;
    }
    lastSentAt = now;
    console.log("[notify] Telegram message sent");
    return true;
  } catch (err) {
    console.error("[notify] Telegram send failed", (err as Error).message);
    return false;
  }
}

export function formatDirectionalAlert(opts: {
  label: "LONG" | "SHORT";
  confidence: number;
  price: number;
  timeframe: string;
  modelVersion: string;
  what: string;
}): string {
  const conf = (opts.confidence * 100).toFixed(1);
  return [
    `<b>BTCUSD ${opts.label}</b> · ${opts.timeframe}`,
    `Price: <code>$${opts.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</code>`,
    `Wilson conf: <b>${conf}%</b>`,
    `Model: ${opts.modelVersion}`,
    "",
    opts.what,
    "",
    "<i>Non-executing decision support · human remains final decision maker</i>",
  ].join("\n");
}

export function formatAnticipationAlert(opts: {
  label: string;
  score: number;
  price: number;
  timeframe: string;
  what: string;
}): string {
  const pct = (opts.score * 100).toFixed(0);
  return [
    `<b>BTCUSD anticipation: ${opts.label.toUpperCase()}</b> · ${opts.timeframe}`,
    `Expansion setup: <b>${pct}%</b>`,
    `Price: <code>$${opts.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</code>`,
    "",
    opts.what,
    "",
    "<i>Not a direction · non-executing · human decides</i>",
  ].join("\n");
}
