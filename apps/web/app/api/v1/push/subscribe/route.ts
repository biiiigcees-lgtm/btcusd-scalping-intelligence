import { NextRequest, NextResponse } from "next/server";
import { REDIS_PUSH_SUBS_KEY } from "@btc/shared";
import { createRedisClient } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint, keys } = body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
    }
    const sub = JSON.stringify({ endpoint, keys });
    const r = createRedisClient();
    await r.connect();
    await r.sadd(REDIS_PUSH_SUBS_KEY, sub);
    await r.quit();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[push/subscribe]", err);
    return NextResponse.json(
      { error: "subscribe_failed", message: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint, keys } = body || {};
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint required" }, { status: 400 });
    }
    const sub = JSON.stringify({ endpoint, keys });
    const r = createRedisClient();
    await r.connect();
    await r.srem(REDIS_PUSH_SUBS_KEY, sub);
    const all = await r.smembers(REDIS_PUSH_SUBS_KEY);
    for (const raw of all) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.endpoint === endpoint) await r.srem(REDIS_PUSH_SUBS_KEY, raw);
      } catch {
        /* skip */
      }
    }
    await r.quit();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[push/unsubscribe]", err);
    return NextResponse.json(
      { error: "unsubscribe_failed", message: (err as Error).message },
      { status: 500 }
    );
  }
}
