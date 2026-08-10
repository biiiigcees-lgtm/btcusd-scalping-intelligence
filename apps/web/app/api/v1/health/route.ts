import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "btc-scalping-web",
    timestamp: new Date().toISOString(),
    foundation: "00-04 locked",
  });
}
