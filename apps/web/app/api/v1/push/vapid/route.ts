import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public VAPID key for client subscribe — private key never leaves server/worker */
export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json(
      { enabled: false, error: "VAPID_PUBLIC_KEY not configured" },
      { status: 503 }
    );
  }
  return NextResponse.json({ enabled: true, publicKey: key });
}
