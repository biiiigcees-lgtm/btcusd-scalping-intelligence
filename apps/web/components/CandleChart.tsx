"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";

export type ChartCandle = {
  openTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Props = {
  candles?: ChartCandle[];
  /** Fallback closes if full OHLCV not yet available */
  closes?: number[];
  timeframe?: string;
  height?: number;
};

function toChartData(candles: ChartCandle[]): CandlestickData<Time>[] {
  const out: CandlestickData<Time>[] = [];
  for (const c of candles) {
    const t = Math.floor(Date.parse(c.openTime) / 1000);
    if (!Number.isFinite(t)) continue;
    if (
      ![c.open, c.high, c.low, c.close].every((n) => Number.isFinite(n) && n > 0)
    ) {
      continue;
    }
    out.push({
      time: t as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    });
  }
  out.sort((a, b) => (a.time as number) - (b.time as number));
  const dedup: CandlestickData<Time>[] = [];
  for (const bar of out) {
    if (dedup.length && dedup[dedup.length - 1].time === bar.time) {
      dedup[dedup.length - 1] = bar;
    } else {
      dedup.push(bar);
    }
  }
  return dedup;
}

/** Synthesize OHLC from closes when worker has not yet closed many bars */
function closesToCandles(closes: number[]): CandlestickData<Time>[] {
  if (closes.length < 1) return [];
  const now = Math.floor(Date.now() / 1000);
  const step = 15 * 60;
  return closes.map((close, i) => {
    const prev = i > 0 ? closes[i - 1] : close;
    const time = (now - (closes.length - 1 - i) * step) as Time;
    return {
      time,
      open: prev,
      high: Math.max(prev, close),
      low: Math.min(prev, close),
      close,
    };
  });
}

export function CandleChart({
  candles,
  closes,
  timeframe = "15m",
  height = 280,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#71717a",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(39, 39, 42, 0.6)" },
        horzLines: { color: "rgba(39, 39, 42, 0.6)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(113, 113, 122, 0.5)",
          labelBackgroundColor: "#27272a",
        },
        horzLine: {
          color: "rgba(113, 113, 122, 0.5)",
          labelBackgroundColor: "#27272a",
        },
      },
      rightPriceScale: {
        borderColor: "#27272a",
        scaleMargins: { top: 0.08, bottom: 0.12 },
      },
      timeScale: {
        borderColor: "#27272a",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#34d399",
      downColor: "#f87171",
      borderUpColor: "#34d399",
      borderDownColor: "#f87171",
      wickUpColor: "#34d399",
      wickDownColor: "#f87171",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    });
    ro.observe(containerRef.current);
    chart.applyOptions({ width: containerRef.current.clientWidth });

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    let data: CandlestickData<Time>[] = [];
    if (candles && candles.length >= 1) {
      data = toChartData(candles);
      // lightweight-charts needs ≥2 points for a sensible scale — pad if needed
      if (data.length === 1) {
        const only = data[0];
        const t0 = (only.time as number) - 15 * 60;
        data = [
          {
            time: t0 as Time,
            open: only.open,
            high: only.high,
            low: only.low,
            close: only.open,
          },
          only,
        ];
      }
    } else if (closes && closes.length >= 1) {
      data = closesToCandles(closes);
      if (data.length === 1) {
        const only = data[0];
        data = [
          {
            time: ((only.time as number) - 15 * 60) as Time,
            open: only.open,
            high: only.high,
            low: only.low,
            close: only.open,
          },
          only,
        ];
      }
    }

    if (data.length < 1) return;

    seriesRef.current.setData(data);
    chartRef.current.timeScale().fitContent();
  }, [candles, closes]);

  const barCount = candles?.length ?? closes?.length ?? 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          Chart · {timeframe} candles
        </span>
        <span className="text-[10px] text-zinc-600 tabular-nums">
          {barCount > 0 ? `${barCount} bars` : "waiting for history"}
        </span>
      </div>
      <div
        ref={containerRef}
        className="w-full rounded-lg border border-zinc-800/80 bg-zinc-950/50 overflow-hidden"
        style={{ height }}
      />
      {barCount < 2 ? (
        <p className="text-[11px] text-zinc-600 mt-2">
          Collecting {timeframe} bars from worker… restart worker to bootstrap
          history from public klines.
        </p>
      ) : null}
    </div>
  );
}
