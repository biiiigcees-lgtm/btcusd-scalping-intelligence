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
      } catch { /* ignore */ }
    });
    es.addEventListener("status", (ev) => {
      try {
        const s = JSON.parse(ev.data);
        if (s.redis === "unavailable" || s.redis === "error") {
          setError(s.note || s.message || "Redis unavailable");
        }
      } catch { /* ignore */ }
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
    <main className="min-h-screen p-6">
      <header className="border-b border-zinc-800 pb-4 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            BTCUSD AI Scalping Intelligence Assistant
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Non-executing · Explainable · Human-supervised · Default = NO TRADE
          </p>
        </div>
        <div className="text-xs text-zinc-500">
          SSE: {connected ? "connected" : "disconnected"}
          {error ? ` · ${error}` : ""}
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="border border-zinc-800 rounded p-4">
          <div className="text-zinc-500 text-xs uppercase tracking-wider">Live Price</div>
          <div className="text-2xl mt-1 tabular-nums">
            {price != null ? price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
          </div>
        </div>
        <div className="border border-zinc-800 rounded p-4">
          <div className="text-zinc-500 text-xs uppercase tracking-wider">Regime</div>
          <div className="text-2xl mt-1">{regime}</div>
        </div>
        <div className="border border-zinc-800 rounded p-4">
          <div className="text-zinc-500 text-xs uppercase tracking-wider">Data Quality</div>
          <div className="text-2xl mt-1">
            {quality != null ? `${(quality * 100).toFixed(0)}%` : "—"}
          </div>
        </div>
        <div className="border border-zinc-800 rounded p-4">
          <div className="text-zinc-500 text-xs uppercase tracking-wider">System</div>
          <div className="text-2xl mt-1">{health}</div>
        </div>
      </section>

      <section className="border border-zinc-800 rounded p-6 text-center">
        <div className="text-zinc-400 text-lg font-medium">NO TRADE</div>
        <p className="text-zinc-600 text-sm mt-2 max-w-md mx-auto">
          Signals must earn the right to appear. Baseline model emits no directional
          bias until research promotes a validated model.
        </p>
      </section>

      <footer className="mt-12 text-zinc-700 text-xs">
        Foundation 00–04 locked · Open AGENTS.md for engineering workflow
      </footer>
    </main>
  );
}
