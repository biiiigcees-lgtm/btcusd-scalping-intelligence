export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      series: "KXBTC15M",
      dataMode: "PUBLIC_PROXY",
      feeScheduleVersion: "kalshi-standard-quadratic-v1",
      roundingVersion: "half-up-2dp-v1",
      decisionEngineVersion: "public-proxy-v1",
      actionableYesNo: false,
      settlementAuthority: "none",
      endpoints: [
        "GET /api/v1/kalshi/health",
        "GET /api/v1/kalshi/markets",
        "GET /api/v1/kalshi/snapshot",
        "GET /api/v1/kalshi/snapshot?ticker=",
        "GET /api/v1/kalshi/config",
      ],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
