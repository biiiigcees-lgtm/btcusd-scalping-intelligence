"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

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
        setMode("worker-stream");
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("status", (ev) => {
      try {
        const s = JSON.parse(ev.data);
        if (s.mode) setMode(s.mode);
        if (s.error || s.message) setError(s.error || s.message);
        else if (s.note && s.mode === "degraded") setError(s.note);
        else if (s.mode === "worker-stream") setError(null);
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
  const features = state?.features;
  const history = state?.priceHistory ?? state?.candles?.map((c) => c.close);
  const timeframe = state?.timeframe ?? "15m";

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
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                connected && mode === "worker-stream"
                  ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-400"
                  : mode === "degraded"
                    ? "border-amber-900/60 bg-amber-950/40 text-amber-400"
                    : "border-zinc-700 bg-zinc-900 text-zinc-400"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected && mode === "worker-stream"
                    ? "bg-emerald-400 animate-pulse"
                    : mode === "degraded"
                      ? "bg-amber-400"
                      : "bg-zinc-500"
                }`}
              />
              {mode === "worker-stream"
                ? "Live"
                : mode === "degraded"
                  ? "Degraded"
                  : connected
                    ? "Connected"
                    : "Offline"}
            </div>
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
              {mode === "worker-stream"
                ? "Worker stream"
                : mode === "degraded"
                  ? "Redis unavailable"
                  : mode}
            </span>
          </div>
        </header>

        {error ? (
          <div className="text-amber-400/90 text-xs border border-amber-900/40 bg-amber-950/20 rounded-lg px-3 py-2">
            {error}
          </div>
        ) : null}

        {/* Hero price */}
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
                {prevPrice != null && flash ? (
                  <span className="text-zinc-600 ml-2 text-xs">
                    was ${fmtPrice(prevPrice)}
                  </span>
                ) : null}
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-zinc-800/80">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">24h high</div>
              <div className="tabular-nums text-sm mt-0.5">{fmtPrice(state?.high24h)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">24h low</div>
              <div className="tabular-nums text-sm mt-0.5">{fmtPrice(state?.low24h)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">Volume</div>
              <div className="tabular-nums text-sm mt-0.5">
                {state?.volume24h != null
                  ? state.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">Quote vol</div>
              <div className="tabular-nums text-sm mt-0.5">
                {state?.quoteVolume24h != null
                  ? `$${(state.quoteVolume24h / 1e9).toFixed(2)}B`
                  : "—"}
              </div>
            </div>
          </div>
        </section>

        {/* Chart — full width */}
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
            sub={`${timeframe} · research locked`}
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
              Bot analysis · {timeframe}
            </h2>
            <div className="space-y-3">
              <FeatureRow
                label={`1-bar return (${timeframe})`}
                value={features?.return_1 != null ? fmtPct(features.return_1 * 100) : "—"}
              />
              <FeatureRow
                label={`Realized vol (${timeframe})`}
                value={
                  features?.realized_vol != null
                    ? `${(features.realized_vol * 100).toFixed(3)}%`
                    : "—"
                }
              />
              <FeatureRow
                label={`5-bar momentum (${timeframe})`}
                value={
                  features?.momentum_5 != null ? fmtPct(features.momentum_5 * 100) : "—"
                }
              />
              <FeatureRow
                label="Volume intensity"
                value={
                  features?.volume_intensity != null
                    ? `${features.volume_intensity.toFixed(2)}×`
                    : "—"
                }
              />
              <FeatureRow
                label="Range position"
                value={
                  features?.range_position != null
                    ? `${(features.range_position * 100).toFixed(0)}% of local range`
                    : "—"
                }
              />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5 flex flex-col">
            <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
              Signal · {timeframe}
            </h2>
            <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-4 py-1.5 text-sm font-medium text-zinc-300">
                <span className="h-2 w-2 rounded-full bg-zinc-500" />
                {signalLabel}
              </div>
              <p className="text-zinc-400 text-sm mt-4 max-w-sm leading-relaxed">
                {state?.signal?.explanation?.what ??
                  "Signals must earn the right to appear. Baseline emits no directional bias."}
              </p>
              {state?.signal?.explanation?.why?.length ? (
                <ul className="mt-4 text-left w-full space-y-1.5">
                  {state.signal.explanation.why.map((line) => (
                    <li key={line} className="text-xs text-zinc-500 flex gap-2">
                      <span className="text-zinc-700">·</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {state?.signal?.explanation?.supporting?.length ? (
                <ul className="mt-3 text-left w-full space-y-1.5">
                  {state.signal.explanation.supporting.map((line) => (
                    <li key={line} className="text-xs text-emerald-600/80 flex gap-2">
                      <span>+</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {state?.signal?.explanation?.contradictory?.length ? (
                <ul className="mt-3 text-left w-full space-y-1.5">
                  {state.signal.explanation.contradictory.map((line) => (
                    <li key={line} className="text-xs text-amber-600/80 flex gap-2">
                      <span>!</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-[10px] text-zinc-700 mt-4">
                {state?.signal?.explanation?.calibrationNote ??
                  "Human remains final decision maker"}
              </p>
            </div>
          </div>
        </section>

        <footer className="pt-2 pb-6 text-center text-[11px] text-zinc-700">
          Foundation 00–04 locked · Primary TF {timeframe} · Public data only · No execution · Worker = single source of truth
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

function FeatureRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm border-b border-zinc-800/60 pb-2 last:border-0 last:pb-0">
      <span className="text-zinc-500 text-xs">{label}</span>
      <span className="tabular-nums text-zinc-200 font-medium">{value}</span>
    </div>
  );
}
