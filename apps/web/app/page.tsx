"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { PushToggle } from "@/components/PushToggle";

const CandleChart = dynamic(
  () => import("@/components/CandleChart").then((m) => m.CandleChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[280px] flex items-center justify-center text-zinc-600 text-xs border border-zinc-800/80 rounded-lg">
        Loading chart…
      </div>
    ),
  }
);

type Regime =
  | "trending_up"
  | "trending_down"
  | "ranging"
  | "high_volatility"
  | "low_liquidity"
  | "unknown";

type QualitySnapshot = {
  score?: number;
  latencyMs?: number;
  silenceMs?: number;
  reconnectsRecent?: number;
  reasons?: string[];
  lastHealthyAt?: string;
  activeSource?: string;
};

type AnticipationState = {
  score?: number;
  label?: "quiet" | "building" | "elevated" | "high";
  components?: {
    squeeze?: number;
    volumeAccel?: number;
    rangeExtreme?: number;
  };
  explanation?: {
    what?: string;
    why?: string[];
    supporting?: string[];
    contradictory?: string[];
  };
};

type MarketState = {
  symbol?: string;
  price?: number;
  change24h?: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  quoteVolume24h?: number;
  regime?: { regime?: Regime; confidence?: number; timestamp?: string };
  dataQuality?: number;
  qualitySnapshot?: QualitySnapshot;
  systemHealth?: string;
  lastUpdate?: string;
  features?: {
    return_1?: number;
    realized_vol?: number;
    volume_intensity?: number;
    momentum_5?: number;
    range_position?: number;
  };
  signal?: {
    direction?: "long" | "short" | null;
    label?: string;
    confidence?: number;
    modelVersion?: string;
    explanation?: {
      what?: string;
      why?: string[];
      supporting?: string[];
      contradictory?: string[];
      calibrationNote?: string;
    };
  };
  anticipation?: AnticipationState;
  priceHistory?: number[];
  candles?: Array<{
    openTime: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  source?: string;
  timeframe?: string;
};

function fmtPrice(n?: number) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(n?: number, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function regimeLabel(r?: string) {
  if (!r) return "unknown";
  return r.replace(/_/g, " ");
}

export default function HomePage() {
  const [state, setState] = useState<MarketState | null>(null);
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState<string>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/v1/stream");

    es.addEventListener("hello", () => setConnected(true));

    es.addEventListener("market_state", (ev) => {
      try {
        const next = JSON.parse(ev.data) as MarketState;
        setState((prev) => {
          if (prev?.price != null && next.price != null && next.price !== prev.price) {
            setPrevPrice(prev.price);
            setFlash(next.price > prev.price ? "up" : "down");
            setTimeout(() => setFlash(null), 450);
          }
          return next;
        });
        setError(null);
        setConnected(true);
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("status", (ev) => {
      try {
        const s = JSON.parse(ev.data);
        if (s.mode) setMode(s.mode);
        if (s.mode === "vercel-cron" || s.mode === "worker-stream") {
          setError(null);
        } else if (s.mode === "degraded") {
          setError(s.note || s.error || s.message || "Redis unavailable");
        } else if (s.error || s.message) {
          setError(s.error || s.message);
        }
      } catch {
        /* ignore */
      }
    });

    es.onerror = () => {
      setConnected(false);
      setError("SSE connection lost — retrying…");
    };

    return () => es.close();
  }, []);

  const price = state?.price;
  const change = state?.change24h;
  const regime = state?.regime?.regime ?? "unknown";
  const quality = state?.dataQuality;
  const qSnap = state?.qualitySnapshot;

  const health = state?.systemHealth ?? "unknown";
  const signalLabel = state?.signal?.label ?? "NO TRADE";
  const signalConf = state?.signal?.confidence ?? 0;
  const features = state?.features;
  const history = state?.priceHistory ?? state?.candles?.map((c) => c.close);
  const timeframe = state?.timeframe ?? "15m";
  const ant = state?.anticipation;
  const antScore = ant?.score ?? 0;
  const antLabel = ant?.label ?? "quiet";

  const isLong = signalLabel === "LONG";
  const isShort = signalLabel === "SHORT";
  const hasDirection = isLong || isShort;

  const stateAgeSec = state?.lastUpdate
    ? Math.max(0, Math.round((Date.now() - Date.parse(state.lastUpdate)) / 1000))
    : null;
  const isStale = stateAgeSec != null && stateAgeSec > 180;
  const isLive = state != null && !isStale && mode !== "degraded";

  const priceClass =
    flash === "up"
      ? "text-emerald-400"
      : flash === "down"
        ? "text-rose-400"
        : "text-zinc-50";

  const changeClass =
    change == null ? "text-zinc-500" : change >= 0 ? "text-emerald-400" : "text-rose-400";

  const qualitySub =
    quality == null
      ? undefined
      : quality >= 0.85
        ? "above threshold"
        : qSnap?.reasons?.length
          ? qSnap.reasons.join(" · ")
          : "suppress directional";

  const signalPillClass = isLong
    ? "border-emerald-700/60 bg-emerald-950/50 text-emerald-300"
    : isShort
      ? "border-rose-700/60 bg-rose-950/50 text-rose-300"
      : "border-zinc-700 bg-zinc-950 text-zinc-300";

  const signalDotClass = isLong
    ? "bg-emerald-400"
    : isShort
      ? "bg-rose-400"
      : "bg-zinc-500";

  const antColor =
    antLabel === "high"
      ? "bg-amber-400"
      : antLabel === "elevated"
        ? "bg-amber-500/80"
        : antLabel === "building"
          ? "bg-yellow-600/70"
          : "bg-zinc-600";

  const statusLabel = isLive
    ? "Live"
    : isStale
      ? "Stale"
      : mode === "degraded"
        ? "Degraded"
        : connected
          ? "Connecting…"
          : "Offline";

  const statusSub = isLive
    ? mode === "vercel-cron"
      ? "Vercel Cron · Redis"
      : "Live stream"
    : isStale
      ? `Updated ${Math.round(stateAgeSec! / 60)}m ago`
      : mode === "degraded"
        ? "Redis unavailable"
        : "Initializing…";

  const statusPillClass = isLive
    ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-400"
    : isStale
      ? "border-amber-900/60 bg-amber-950/40 text-amber-400"
      : mode === "degraded"
        ? "border-rose-900/60 bg-rose-950/40 text-rose-400"
        : "border-zinc-700 bg-zinc-900 text-zinc-400";

  const statusDotClass = isLive
    ? "bg-emerald-400 animate-pulse"
    : isStale
      ? "bg-amber-400"
      : mode === "degraded"
        ? "bg-rose-400"
        : "bg-zinc-500";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-5 sm:p-6 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/80 pb-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">
              Decision support · non-executing · {timeframe} primary
            </p>
            <h1 className="text-lg sm:text-2xl font-semibold tracking-tight leading-snug">
              BTCUSD AI Scalping Intelligence
            </h1>
            <p className="text-zinc-500 text-xs sm:text-sm mt-1.5">
              Explainable · Human-supervised · Default = NO TRADE
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusPillClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
              {statusLabel}
            </div>
            <PushToggle />
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
              {statusSub}
            </span>
          </div>
        </header>

        {error ? (
          <div className="text-amber-400/90 text-xs border border-amber-900/40 bg-amber-950/20 rounded-lg px-3 py-2">
            {error}
          </div>
        ) : null}

        <section className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-zinc-950 p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-zinc-500 text-xs uppercase tracking-wider">
                {state?.symbol ?? "BTCUSDT"} · last
              </div>
              <div
                className={`text-3xl sm:text-5xl font-semibold tabular-nums tracking-tight mt-1 transition-colors duration-300 ${priceClass}`}
              >
                ${fmtPrice(price)}
              </div>
              <div className={`text-sm mt-2 font-medium tabular-nums ${changeClass}`}>
                {fmtPct(change)} <span className="text-zinc-600 font-normal">24h</span>
              </div>
            </div>
            <div className="text-right text-[10px] text-zinc-600 space-y-1">
              <div>
                {state?.lastUpdate
                  ? new Date(state.lastUpdate).toLocaleTimeString()
                  : "—"}
              </div>
              <div className="uppercase tracking-wider">{timeframe} primary</div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-3 sm:p-4">
          <CandleChart
            candles={state?.candles}
            closes={history}
            timeframe={timeframe}
            height={280}
          />
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label={`Regime · ${timeframe}`}
            value={regimeLabel(regime)}
            sub={
              state?.regime?.confidence != null
                ? `${(state.regime.confidence * 100).toFixed(0)}% conf`
                : undefined
            }
          />
          <MetricCard
            label="Data quality"
            value={quality != null ? `${(quality * 100).toFixed(0)}%` : "—"}
            sub={qualitySub}
          />
          <MetricCard label="System" value={health} sub={state?.source ?? "—"} />
          <MetricCard
            label="Model"
            value={state?.signal?.modelVersion ?? "baseline"}
            sub={`${timeframe} · gated KNN`}
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5 flex flex-col">
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
              Directional signal · {timeframe}
            </h2>
            <p className="text-[10px] text-zinc-600 mb-3">Which way — only if earned</p>
            <div className="flex-1 flex flex-col items-center justify-center text-center py-2">
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium ${signalPillClass}`}
              >
                <span className={`h-2 w-2 rounded-full ${signalDotClass}`} />
                {signalLabel}
              </div>
              <div className="w-full max-w-xs mt-4">
                <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                  <span>Wilson confidence</span>
                  <span className="tabular-nums">
                    {hasDirection ? `${(signalConf * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isLong
                        ? "bg-emerald-500"
                        : isShort
                          ? "bg-rose-500"
                          : "bg-zinc-600"
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(0, signalConf * 100))}%`,
                    }}
                  />
                </div>
              </div>
              <p className="text-zinc-400 text-sm mt-4 max-w-sm leading-relaxed">
                {state?.signal?.explanation?.what ??
                  "Signals must earn the right to appear. Default = NO TRADE."}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5 flex flex-col">
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
              Anticipation · {timeframe}
            </h2>
            <p className="text-[10px] text-zinc-600 mb-3">Something big coming? — not direction</p>
            <div className="flex-1 flex flex-col items-center justify-center text-center py-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-4 py-1.5 text-sm font-medium text-zinc-200 capitalize">
                <span className={`h-2 w-2 rounded-full ${antColor}`} />
                {antLabel}
              </div>
              <div className="w-full max-w-xs mt-4">
                <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                  <span>Expansion setup</span>
                  <span className="tabular-nums">{(antScore * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${antColor}`}
                    style={{
                      width: `${Math.min(100, Math.max(0, antScore * 100))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="pt-2 pb-6 text-center text-[11px] text-zinc-700">
          Redis OK · worker publishes market_state · no execution
        </footer>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3 sm:p-4">
      <div className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="text-base sm:text-lg font-medium mt-1 capitalize truncate">{value}</div>
      {sub ? <div className="text-[10px] text-zinc-600 mt-1 truncate">{sub}</div> : null}
    </div>
  );
}
