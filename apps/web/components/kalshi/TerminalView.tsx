"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type BookLevel = { price: number; quantity: number };

type Snapshot = {
  market?: {
    ticker?: string;
    status?: string;
    title?: string;
    strike?: number | null;
    closeTimestampMs?: number | null;
    rules?: string;
  };
  orderBook?: {
    yesBest?: number | null;
    noBest?: number | null;
    yesAsk?: number | null;
    noAsk?: number | null;
    status?: string;
    yesDepth?: BookLevel[];
    noDepth?: BookLevel[];
  };
  spot?: { value?: number; source?: string } | null;
  model?: {
    pYes?: number | null;
    regime?: string;
    version?: string;
    note?: string;
  };
  decision?: {
    decision?: string;
    netEdge?: number | null;
    modelProbability?: number | null;
    marketProbability?: number | null;
    dataMode?: string;
    settlementConfidence?: string;
    reasons?: string[];
  };
  health?: {
    global?: string;
    sources?: Record<string, string>;
  };
  clock?: { serverNowMs?: number };
  dataMode?: string;
  error?: string;
  message?: string;
};

/* -------------------------------------------------------------------------- */
/* Formatters                                                                  */
/* -------------------------------------------------------------------------- */

function fmtUsd(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtPp(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = n * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}pp`;
}

function fmtMmSs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function decisionColor(d: string): string {
  switch (d) {
    case "YES":
      return "text-emerald-400";
    case "NO":
      return "text-rose-400";
    case "WATCH":
      return "text-amber-400";
    case "INVALID":
      return "text-red-400";
    default:
      return "text-zinc-400";
  }
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

const POLL_MS = 5_000;
const STALE_MS = 20_000;

export function TerminalView() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (manual = false) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (manual) setRefreshing(true);

    try {
      const res = await fetch("/api/v1/kalshi/snapshot", {
        cache: "no-store",
        signal: ctrl.signal,
      });
      const data = (await res.json()) as Snapshot;
      if (!mountedRef.current) return;

      if (!res.ok) {
        setErr(data.message || data.error || `HTTP ${res.status}`);
        // Keep last good snap if we have one
        if (!snap) setSnap(null);
      } else {
        setErr(null);
        setSnap(data);
        setLastFetchAt(Date.now());
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      if (!mountedRef.current) return;
      setErr(e instanceof Error ? e.message : "fetch failed");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  /* Derived */
  const strike = snap?.market?.strike ?? null;
  const spot = snap?.spot?.value ?? null;
  const settlement = spot; // PUBLIC_PROXY: spot stands in for settlement ref
  const distance =
    settlement != null && strike != null ? settlement - strike : null;
  const distancePct =
    distance != null && strike != null && strike !== 0
      ? distance / strike
      : null;

  const remainingMs =
    snap?.market?.closeTimestampMs != null
      ? snap.market.closeTimestampMs - now
      : null;

  const modelP = snap?.decision?.modelProbability ?? snap?.model?.pYes ?? null;
  const marketP = snap?.decision?.marketProbability ?? null;
  const edge = snap?.decision?.netEdge ?? null;
  const decision = (snap?.decision?.decision ?? "NO_TRADE").replace(/_/g, " ");
  const decisionRaw = snap?.decision?.decision ?? "NO_TRADE";

  const isLive =
    snap?.health?.sources?.KALSHI_PUBLIC === "LIVE" ||
    (!!snap && !err);
  const isStale =
    lastFetchAt != null && Date.now() - lastFetchAt > STALE_MS;

  const yesDepth = snap?.orderBook?.yesDepth ?? [];
  const noDepth = snap?.orderBook?.noDepth ?? [];

  const narrative = useMemo(() => {
    if (!snap) return "Waiting for market data…";
    const parts: string[] = [];

    if (distance != null && remainingMs != null) {
      const dir = distance >= 0 ? "above" : "below";
      parts.push(
        `BTC is ${fmtUsd(Math.abs(distance))} ${dir} the target with ${fmtMmSs(Math.max(0, remainingMs))} remaining.`
      );
    }

    if (modelP != null) {
      parts.push(
        `Model estimates a ${(modelP * 100).toFixed(0)}% probability of YES.`
      );
    }

    if (marketP != null) {
      parts.push(`Market-implied YES is around ${(marketP * 100).toFixed(0)}%.`);
    }

    if (edge != null) {
      parts.push(
        edge >= 0.03
          ? `Estimated net edge after cost buffer is ${fmtPp(edge)}.`
          : `No actionable edge after costs (${fmtPp(edge)}).`
      );
    }

    const reasons = snap.decision?.reasons ?? [];
    if (reasons.includes("YES_NO_REQUIRES_CFB_DIRECT")) {
      parts.push(
        "Settlement is estimated (public proxy). Actionable YES/NO requires CFB Direct."
      );
    }
    if (reasons.includes("SETTLEMENT_WINDOW_ACTIVE")) {
      parts.push("Settlement averaging window is active — signals suppressed.");
    }
    if (reasons.includes("MARKET_CLOSED")) {
      parts.push("Market is closed.");
    }

    return parts.join(" ");
  }, [snap, distance, remainingMs, modelP, marketP, edge]);

  return (
    <div className="min-h-dvh bg-[#0a0a0b] text-zinc-100 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0a0a0b]/95 backdrop-blur border-b border-zinc-900/80 flex items-center justify-between px-4 pt-3 pb-2">
        <button
          type="button"
          className="h-9 w-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 text-lg leading-none"
          aria-label="Back"
          onClick={() => {
            if (typeof window !== "undefined") {
              if (window.history.length > 1) window.history.back();
              else window.location.href = "/";
            }
          }}
        >
          ×
        </button>
        <div className="flex-1 px-3 min-w-0">
          <div className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase">
            BTC / KALSHI
          </div>
          <div className="text-base font-semibold tracking-tight truncate">
            15M Terminal
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-md border ${
              isLive && !isStale
                ? "bg-emerald-900/60 text-emerald-400 border-emerald-800/60"
                : isStale
                  ? "bg-amber-900/40 text-amber-400 border-amber-800/50"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700"
            }`}
          >
            {isStale ? "STALE" : isLive ? "LIVE" : "OFF"}
          </span>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="h-9 w-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 disabled:opacity-50"
            aria-label="Refresh"
          >
            <span className={refreshing ? "animate-spin inline-block" : ""}>
              ↻
            </span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-8">
        {loading && !snap ? (
          <div className="py-24 text-center text-zinc-500 text-sm">
            Loading terminal…
          </div>
        ) : !snap && err ? (
          <div className="py-16 text-center space-y-3">
            <div className="text-red-400 text-sm">{err}</div>
            <button
              type="button"
              onClick={() => void load(true)}
              className="text-xs text-emerald-400 underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {err && (
              <div className="mt-3 text-[11px] text-amber-400/90 bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
                Last refresh failed: {err}. Showing cached snapshot.
              </div>
            )}

            {/* Settlement / Target */}
            <section className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  Settlement BTC
                </div>
                <div className="text-2xl font-semibold tabular-nums tracking-tight">
                  {fmtUsd(settlement)}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {snap?.dataMode === "PUBLIC_PROXY" ||
                  snap?.spot?.source === "coinbase_public"
                    ? "Coinbase spot (proxy)"
                    : "CF Benchmarks BRTI"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  Target
                </div>
                <div className="text-2xl font-semibold tabular-nums tracking-tight">
                  {fmtUsd(strike)}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  greater_or_equal
                </div>
              </div>
            </section>

            {/* Distance / Time */}
            <section className="grid grid-cols-2 gap-4 mt-5">
              <div>
                <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  Distance
                </div>
                <div
                  className={`text-lg font-semibold tabular-nums ${
                    distance == null
                      ? "text-zinc-400"
                      : distance >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                  }`}
                >
                  {distance != null ? (
                    <>
                      {distance >= 0 ? "+" : "−"}
                      {fmtUsd(Math.abs(distance))}
                      {distancePct != null && (
                        <span className="text-sm font-medium">
                          {" "}
                          / {distancePct >= 0 ? "+" : ""}
                          {(distancePct * 100).toFixed(2)}%
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">vs target</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  Time Remaining
                </div>
                <div
                  className={`text-lg font-semibold tabular-nums ${
                    remainingMs != null && remainingMs < 60_000
                      ? "text-amber-400"
                      : ""
                  }`}
                >
                  {remainingMs != null ? fmtMmSs(remainingMs) : "—"}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5 uppercase">
                  {remainingMs != null && remainingMs <= 0
                    ? "CLOSED"
                    : snap?.market?.status === "active"
                      ? "OPEN"
                      : snap?.market?.status ?? "—"}
                </div>
              </div>
            </section>

            {/* Meta */}
            <section className="mt-4 text-[10px] text-zinc-500 leading-relaxed tracking-wide uppercase break-all">
              <span className="text-zinc-400">Market</span>{" "}
              {snap?.market?.ticker ?? "—"}
              <span className="mx-1.5 text-zinc-700">·</span>
              <span className="text-zinc-400">Spot</span> {fmtUsd(spot)}
              <span className="mx-1.5 text-zinc-700">·</span>
              {snap?.dataMode ?? "PUBLIC_PROXY"}
              <br />
              <span className="text-zinc-400">Model</span>{" "}
              {snap?.model?.version ?? "public-proxy-v1"}
              <span className="mx-1.5 text-zinc-700">·</span>
              <span className="text-zinc-400">Book</span>{" "}
              {snap?.orderBook?.status ?? "—"}
            </section>

            {/* Signal */}
            <section className="mt-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
              <div className="flex items-center justify-between text-[10px] tracking-widest uppercase text-zinc-500 mb-3">
                <span>Model</span>
                <span>
                  {snap?.decision?.settlementConfidence === "ESTIMATED" ||
                  snap?.dataMode === "PUBLIC_PROXY"
                    ? "Estimate — not certain"
                    : "Estimate"}
                </span>
              </div>

              <div className="rounded-xl bg-zinc-950/80 border border-zinc-800 py-8 px-4 text-center mb-4">
                <div className="text-[10px] tracking-[0.25em] text-zinc-500 uppercase mb-2">
                  Signal
                </div>
                <div
                  className={`text-4xl font-semibold tracking-tight ${decisionColor(decisionRaw)}`}
                >
                  {decision}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-2">
                <Metric label="Yes P" value={fmtPct(modelP)} />
                <Metric
                  label="No P"
                  value={fmtPct(modelP != null ? 1 - modelP : null)}
                />
                <Metric
                  label="Mode"
                  value={
                    snap?.dataMode === "PUBLIC_PROXY" ? "Proxy" : snap?.dataMode ?? "—"
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Mkt Yes" value={fmtPct(marketP)} />
                <Metric label="Edge" value={fmtPp(edge)} />
                <Metric label="After Fees" value={fmtPp(edge)} />
              </div>

              <p className="mt-4 text-[12px] leading-relaxed text-zinc-400">
                {narrative}
              </p>
            </section>

            {/* Order book (inline) */}
            <section className="mt-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  Order Book
                </div>
                <div className="text-[10px] text-zinc-500 uppercase">
                  {snap?.orderBook?.status ?? "—"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm tabular-nums mb-4">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase mb-1">
                    Yes best / ask
                  </div>
                  <div className="font-semibold">
                    {snap?.orderBook?.yesBest ?? "—"}
                    <span className="text-zinc-600 mx-1">/</span>
                    {snap?.orderBook?.yesAsk ?? "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-zinc-500 uppercase mb-1">
                    No best / ask
                  </div>
                  <div className="font-semibold">
                    {snap?.orderBook?.noBest ?? "—"}
                    <span className="text-zinc-600 mx-1">/</span>
                    {snap?.orderBook?.noAsk ?? "—"}
                  </div>
                </div>
              </div>

              {(yesDepth.length > 0 || noDepth.length > 0) && (
                <div className="grid grid-cols-2 gap-3 text-[11px] tabular-nums">
                  <DepthSide title="Yes depth" levels={yesDepth} tone="yes" />
                  <DepthSide title="No depth" levels={noDepth} tone="no" />
                </div>
              )}
            </section>

            {/* Health / reasons */}
            <section className="mt-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
              <div className="text-[10px] tracking-widest text-zinc-500 uppercase mb-3">
                Health
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <HealthRow
                  label="Kalshi"
                  value={snap?.health?.sources?.KALSHI_PUBLIC ?? "—"}
                />
                <HealthRow
                  label="Spot"
                  value={snap?.health?.sources?.COINBASE_SPOT ?? "—"}
                />
                <HealthRow
                  label="CFB RTI"
                  value={snap?.health?.sources?.CFB_RTI ?? "UNAVAILABLE"}
                />
                <HealthRow
                  label="Global"
                  value={snap?.health?.global ?? "—"}
                />
              </div>
              {(snap?.decision?.reasons?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {snap!.decision!.reasons!.map((r) => (
                    <span
                      key={r}
                      className="text-[9px] tracking-wide uppercase px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-500"
                    >
                      {r.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Disclaimer */}
            <p className="mt-6 text-[10px] text-zinc-600 leading-relaxed text-center px-2">
              Decision-support only. No orders are placed. Public-proxy mode does
              not use CF Benchmarks BRTI for settlement authority.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Subcomponents                                                               */
/* -------------------------------------------------------------------------- */

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-950/70 border border-zinc-800/80 px-2 py-3 text-center min-w-0">
      <div className="text-[9px] tracking-wider text-zinc-500 uppercase mb-1 truncate">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums text-zinc-100 truncate">
        {value}
      </div>
    </div>
  );
}

function DepthSide({
  title,
  levels,
  tone,
}: {
  title: string;
  levels: BookLevel[];
  tone: "yes" | "no";
}) {
  const rows = levels.slice(-5).reverse();
  return (
    <div>
      <div
        className={`text-[9px] uppercase tracking-wider mb-1 ${
          tone === "yes" ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {title}
      </div>
      <div className="space-y-0.5 font-mono">
        {rows.length === 0 ? (
          <div className="text-zinc-600">—</div>
        ) : (
          rows.map((l, i) => (
            <div
              key={`${l.price}-${i}`}
              className="flex justify-between gap-2 text-zinc-400"
            >
              <span>{l.price.toFixed(2)}</span>
              <span className="text-zinc-600">
                {Number.isFinite(l.quantity)
                  ? l.quantity >= 1000
                    ? `${(l.quantity / 1000).toFixed(1)}k`
                    : l.quantity.toFixed(0)
                  : "—"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  const ok = value === "LIVE" || value === "HEALTHY";
  const warn = value === "DEGRADED" || value === "EMPTY";
  return (
    <div className="flex items-center justify-between rounded-lg bg-zinc-950/60 border border-zinc-800/60 px-2.5 py-1.5">
      <span className="text-zinc-500">{label}</span>
      <span
        className={
          ok
            ? "text-emerald-400"
            : warn
              ? "text-amber-400"
              : "text-zinc-400"
        }
      >
        {value}
      </span>
    </div>
  );
}
