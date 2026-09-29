"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
};

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

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function fmtPp(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = n * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}pp`;
}

function fmtMmSs(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

type Tab = "terminal" | "chart" | "book" | "history" | "more";

export function TerminalView() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("terminal");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/kalshi/snapshot", { cache: "no-store" });
      const data = (await res.json()) as Snapshot;
      if (!res.ok) {
        setErr(data.error || `HTTP ${res.status}`);
        setSnap(null);
      } else {
        setErr(null);
        setSnap(data);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 5_000);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const strike = snap?.market?.strike ?? null;
  const spot = snap?.spot?.value ?? null;
  // Settlement display: prefer spot as proxy when no CFB RTI
  const settlement = snap?.spot?.value ?? null;
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
  const decision = snap?.decision?.decision ?? "NO_TRADE";
  const isLive =
    snap?.health?.sources?.KALSHI_PUBLIC === "LIVE" ||
    snap?.dataMode === "PUBLIC_PROXY";

  const narrative = useMemo(() => {
    if (!snap) return "Waiting for market data…";
    const parts: string[] = [];
    if (distance != null && remainingMs != null) {
      const dir = distance >= 0 ? "above" : "below";
      parts.push(
        `BTC is ${fmtUsd(Math.abs(distance))} ${dir} the target with ${fmtMmSs(remainingMs)} remaining.`
      );
    }
    if (modelP != null) {
      parts.push(
        `The model currently estimates a ${(modelP * 100).toFixed(0)}% probability of YES.`
      );
    }
    if (edge != null) {
      parts.push(
        edge >= 0
          ? `Estimated net edge after cost buffer is ${fmtPp(edge)}.`
          : `No positive edge after costs (${fmtPp(edge)}).`
      );
    }
    const reasons = snap.decision?.reasons ?? [];
    if (reasons.includes("YES_NO_REQUIRES_CFB_DIRECT")) {
      parts.push(
        "Settlement reference is estimated (public proxy); actionable YES/NO requires CFB Direct."
      );
    }
    if (reasons.includes("SETTLEMENT_WINDOW_ACTIVE")) {
      parts.push("Settlement averaging window is active — no new signals.");
    }
    return parts.join(" ") || "No narrative available.";
  }, [snap, distance, remainingMs, modelP, edge]);

  return (
    <div className="min-h-dvh bg-[#0a0a0b] text-zinc-100 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-3 pb-2">
        <button
          type="button"
          className="h-9 w-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400"
          aria-label="Close"
          onClick={() => {
            if (typeof window !== "undefined") window.history.back();
          }}
        >
          ×
        </button>
        <div className="flex-1 px-3">
          <div className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase">
            BTC / KALSHI
          </div>
          <div className="text-base font-semibold tracking-tight">
            15M Terminal
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-md ${
              isLive
                ? "bg-emerald-900/60 text-emerald-400 border border-emerald-800/60"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700"
            }`}
          >
            {isLive ? "LIVE" : "OFF"}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="h-9 w-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400"
            aria-label="Refresh"
          >
            ↻
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-24">
        {loading && !snap ? (
          <div className="py-20 text-center text-zinc-500 text-sm">
            Loading terminal…
          </div>
        ) : err && !snap ? (
          <div className="py-12 text-center text-red-400 text-sm">{err}</div>
        ) : (
          <>
            {/* Settlement / Target */}
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  Settlement BTC
                </div>
                <div className="text-2xl font-semibold tabular-nums tracking-tight">
                  {fmtUsd(settlement)}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {snap?.dataMode === "PUBLIC_PROXY"
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
            </div>

            {/* Distance / Time */}
            <div className="grid grid-cols-2 gap-4 mt-5">
              <div>
                <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  Distance
                </div>
                <div
                  className={`text-lg font-semibold tabular-nums ${
                    distance != null && distance >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {distance != null
                    ? `${distance >= 0 ? "+" : ""}${fmtUsd(distance)} / ${
                        distancePct != null
                          ? `${distancePct >= 0 ? "+" : ""}${(distancePct * 100).toFixed(2)}%`
                          : ""
                      }`
                    : "—"}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  vs target
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] tracking-widest text-zinc-500 uppercase">
                  Time Remaining
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {remainingMs != null ? fmtMmSs(remainingMs) : "—"}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5 uppercase">
                  {snap?.market?.status === "active" ? "OPEN" : snap?.market?.status ?? "—"}
                </div>
              </div>
            </div>

            {/* Meta strip */}
            <div className="mt-4 text-[10px] text-zinc-500 leading-relaxed tracking-wide uppercase">
              <span className="text-zinc-400">Market</span>{" "}
              {snap?.market?.ticker ?? "—"}
              <span className="mx-2 text-zinc-700">·</span>
              <span className="text-zinc-400">Spot</span> {fmtUsd(spot)}
              <span className="mx-2 text-zinc-700">·</span>
              {snap?.dataMode ?? "PUBLIC_PROXY"}
              <br />
              <span className="text-zinc-400">Model</span>{" "}
              {snap?.model?.version ?? "public-proxy-v1"}
            </div>

            {/* Signal card */}
            <div className="mt-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
              <div className="flex items-center justify-between text-[10px] tracking-widest uppercase text-zinc-500 mb-3">
                <span>Model</span>
                <span>
                  {snap?.decision?.settlementConfidence === "ESTIMATED"
                    ? "Estimate — not certain"
                    : "Estimate"}
                </span>
              </div>

              <div className="rounded-xl bg-zinc-950/80 border border-zinc-800 py-8 px-4 text-center mb-4">
                <div className="text-[10px] tracking-[0.25em] text-zinc-500 uppercase mb-2">
                  Signal
                </div>
                <div
                  className={`text-4xl font-semibold tracking-tight ${
                    decision === "YES"
                      ? "text-emerald-400"
                      : decision === "NO"
                        ? "text-rose-400"
                        : decision === "WATCH"
                          ? "text-amber-400"
                          : "text-zinc-400"
                  }`}
                >
                  {decision.replace("_", " ")}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-2">
                <Metric label="Yes P" value={fmtPct(modelP)} />
                <Metric
                  label="No P"
                  value={fmtPct(modelP != null ? 1 - modelP : null)}
                />
                <Metric
                  label="Confidence"
                  value={
                    snap?.decision?.settlementConfidence === "ESTIMATED"
                      ? "—"
                      : "—"
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Mkt Yes" value={fmtPct(marketP)} />
                <Metric label="Edge" value={fmtPp(edge)} />
                <Metric
                  label="After Fees"
                  value={
                    edge != null
                      ? fmtPp(edge)
                      : "—"
                  }
                />
              </div>

              <p className="mt-4 text-[12px] leading-relaxed text-zinc-400">
                {narrative}
              </p>
            </div>

            {tab === "book" && (
              <div className="mt-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
                <div className="text-[10px] tracking-widest text-zinc-500 uppercase mb-3">
                  Order Book
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm tabular-nums">
                  <div>
                    <div className="text-zinc-500 text-xs mb-1">Yes best</div>
                    <div>{snap?.orderBook?.yesBest ?? "—"}</div>
                    <div className="text-zinc-500 text-xs mt-2 mb-1">Yes ask</div>
                    <div>{snap?.orderBook?.yesAsk ?? "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-zinc-500 text-xs mb-1">No best</div>
                    <div>{snap?.orderBook?.noBest ?? "—"}</div>
                    <div className="text-zinc-500 text-xs mt-2 mb-1">No ask</div>
                    <div>{snap?.orderBook?.noAsk ?? "—"}</div>
                  </div>
                </div>
                <div className="text-[11px] text-zinc-500 mt-3">
                  Status: {snap?.orderBook?.status ?? "—"}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-800/80 bg-[#0a0a0b]/90 backdrop-blur">
        <div className="max-w-md mx-auto flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {(
            [
              ["terminal", "Terminal"],
              ["chart", "Chart"],
              ["book", "Book"],
              ["history", "History"],
              ["more", "More"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] ${
                tab === id ? "text-zinc-100" : "text-zinc-500"
              }`}
            >
              <span className="text-base leading-none">
                {id === "terminal"
                  ? "▦"
                  : id === "chart"
                    ? "⬡"
                    : id === "book"
                      ? "☰"
                      : id === "history"
                        ? "◷"
                        : "∿"}
              </span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-950/70 border border-zinc-800/80 px-2 py-3 text-center">
      <div className="text-[9px] tracking-wider text-zinc-500 uppercase mb-1">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums text-zinc-100">
        {value}
      </div>
    </div>
  );
}
