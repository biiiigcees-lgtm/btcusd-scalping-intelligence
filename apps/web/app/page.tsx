"use client";

import { useEffect, useState } from "react";

type MarketState = {
  symbol?: string;
  price?: number;
  regime?: { regime?: string; confidence?: number };
  dataQuality?: number;
  systemHealth?: string;
  lastUpdate?: string;
};

export default function HomePage() {
  const [state, setState] = useState<MarketState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/v1/stream");
    es.addEventListener("hello", () => setConnected(true));
    es.addEventListener("market_state", (ev) => {
      try {
        setState(JSON.parse(ev.data));
        setError(null);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("status", (ev) => {
      try {
        const s = JSON.parse(ev.data);
        if (s.redis === "unavailable" || s.redis === "error") {
          setError(s.note || s.message || "Redis unavailable");
        }
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => {
      setConnected(false);
      setError("SSE connection lost");
    };
    return () => es.close();
  }, []);

  const price = state?.price;
  const regime = state?.regime?.regime ?? "unknown";
  const quality = state?.dataQuality;
  const health = state?.systemHealth ?? "unknown";

  return (
    <main className="min-h-screen px-4 py-5 sm:p-6 max-w-6xl mx-auto">
      <header className="border-b border-zinc-800 pb-4 mb-6 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight leading-snug">
              BTCUSD AI Scalping Intelligence Assistant
            </h1>
            <p className="text-zinc-500 text-xs sm:text-sm mt-1.5 leading-relaxed">
              Non-executing · Explainable · Human-supervised · Default = NO TRADE
            </p>
          </div>
          <div
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              connected
                ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-400"
                : "border-zinc-700 bg-zinc-900 text-zinc-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connected ? "bg-emerald-400" : "bg-zinc-500"
              }`}
            />
            SSE {connected ? "connected" : "disconnected"}
          </div>
        </div>
        {error ? (
          <p className="text-amber-500/90 text-xs leading-relaxed border border-amber-900/40 bg-amber-950/20 rounded px-3 py-2">
            {error}
          </p>
        ) : null}
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="border border-zinc-800 rounded-lg p-3 sm:p-4">
          <div className="text-zinc-500 text-[10px] sm:text-xs uppercase tracking-wider">
            Live Price
          </div>
          <div className="text-xl sm:text-2xl mt-1 tabular-nums font-medium">
            {price != null
              ? price.toLocaleString(undefined, { maximumFractionDigits: 2 })
              : "—"}
          </div>
        </div>
        <div className="border border-zinc-800 rounded-lg p-3 sm:p-4">
          <div className="text-zinc-500 text-[10px] sm:text-xs uppercase tracking-wider">
            Regime
          </div>
          <div className="text-xl sm:text-2xl mt-1 font-medium capitalize">{regime}</div>
        </div>
        <div className="border border-zinc-800 rounded-lg p-3 sm:p-4">
          <div className="text-zinc-500 text-[10px] sm:text-xs uppercase tracking-wider">
            Data Quality
          </div>
          <div className="text-xl sm:text-2xl mt-1 tabular-nums font-medium">
            {quality != null ? `${(quality * 100).toFixed(0)}%` : "—"}
          </div>
        </div>
        <div className="border border-zinc-800 rounded-lg p-3 sm:p-4">
          <div className="text-zinc-500 text-[10px] sm:text-xs uppercase tracking-wider">
            System
          </div>
          <div className="text-xl sm:text-2xl mt-1 font-medium capitalize">{health}</div>
        </div>
      </section>

      <section className="border border-zinc-800 rounded-lg p-5 sm:p-6 text-center">
        <div className="text-zinc-300 text-base sm:text-lg font-medium tracking-wide">
          NO TRADE
        </div>
        <p className="text-zinc-600 text-xs sm:text-sm mt-2 max-w-md mx-auto leading-relaxed">
          Signals must earn the right to appear. Baseline model emits no directional
          bias until research promotes a validated model.
        </p>
      </section>

      <footer className="mt-10 sm:mt-12 text-zinc-700 text-[11px] sm:text-xs text-center sm:text-left">
        Foundation 00–04 locked · Open AGENTS.md for engineering workflow
      </footer>
    </main>
  );
}
