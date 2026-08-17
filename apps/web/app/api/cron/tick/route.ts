import { executeTick } from "@/lib/server/tick";
import { type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  // If CRON_SECRET is not configured yet, allow execution so initial setup is smooth
  if (!cronSecret) return true;

  // Vercel Cron header
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (isVercelCron) return true;

  // Bearer token authorization
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader === `Bearer ${cronSecret}`) return true;

  // Query parameter fallback for manual testing
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === cronSecret) return true;

  return false;
}

async function handleTick(req: NextRequest) {
  if (!isAuthorized(req)) {
    return Response.json(
      { error: "unauthorized", message: "Invalid or missing authorization token" },
      { status: 401 }
    );
  }

  try {
    const state = await executeTick();
    return Response.json({
      ok: true,
      price: state.price,
      bars: state.candles?.length ?? 0,
      timestamp: state.lastUpdate,
      source: state.source,
      regime: state.regime.regime,
      signal: state.signal?.label,
      dataQuality: state.dataQuality,
    });
  } catch (err) {
    console.error("[cron/tick] Execution failed", err);
    return Response.json(
      {
        ok: false,
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleTick(req);
}

export async function POST(req: NextRequest) {
  return handleTick(req);
}
