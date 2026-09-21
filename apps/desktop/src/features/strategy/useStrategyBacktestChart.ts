import { useEffect, useRef, useState } from 'react';
import {
  CrosshairMode,
  LineSeries,
  createChart,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { formatDateTimeInTimeZone } from '@/lib/date-display';
import type { BacktestChartModel } from './strategy-backtest-chart.model.js';
import { nextBacktestLogicalRange } from './strategy-backtest-chart.model.js';

type ChartApi = ReturnType<typeof createChart>;
type SeriesApi = ReturnType<ChartApi['addSeries']>;
type RangeAction = 'zoomIn' | 'zoomOut' | 'earlier' | 'later';

export const backtestChartTime = (milliseconds: number) =>
  Math.floor(milliseconds / 1_000) as UTCTimestamp;

const milliseconds = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value * 1_000 : null;

const currencyFormatter = (currency: BacktestChartModel['currency']) => {
  if (!currency)
    return (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const formatter = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  });
  return (value: number) => formatter.format(value);
};

export const useStrategyBacktestChart = ({
  model,
  resetKey,
  onRangeChange,
}: {
  model: BacktestChartModel;
  resetKey: string;
  onRangeChange: (range: { from: number; to: number } | null) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartApi | null>(null);
  const equitySeriesRef = useRef<SeriesApi | null>(null);
  const drawdownSeriesRef = useRef<SeriesApi | null>(null);
  const onRangeChangeRef = useRef(onRangeChange);
  const lockedTimeRef = useRef<number | null>(null);
  const lastResetKeyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [themeRevision, setThemeRevision] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [lockedTime, setLockedTime] = useState<number | null>(null);
  onRangeChangeRef.current = onRangeChange;
  lockedTimeRef.current = lockedTime;

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setThemeRevision((value) => value + 1));
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      autoSize: true,
      height: 430,
      layout: {
        background: { color: 'transparent' },
        textColor: '#64748b',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.14)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.14)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.35)',
        timeVisible: true,
        secondsVisible: false,
      },
    });
    const equitySeries = chart.addSeries(LineSeries, { lineWidth: 2 }, 0);
    const drawdownSeries = chart.addSeries(LineSeries, { lineWidth: 2 }, 1);
    chart.panes()[0]?.setStretchFactor(3);
    chart.panes()[1]?.setStretchFactor(1);
    const crosshairHandler = (param: { time?: unknown }) => {
      if (lockedTimeRef.current === null) setHoverTime(milliseconds(param.time));
    };
    const clickHandler = (param: { time?: unknown }) => {
      const selected = milliseconds(param.time);
      setLockedTime((current) => (current === selected ? null : selected));
    };
    const rangeHandler = () => {
      const range = chart.timeScale().getVisibleRange();
      const from = milliseconds(range?.from);
      const to = milliseconds(range?.to);
      onRangeChangeRef.current(from !== null && to !== null ? { from, to } : null);
    };
    chart.subscribeCrosshairMove(crosshairHandler);
    chart.subscribeClick(clickHandler);
    chart.timeScale().subscribeVisibleTimeRangeChange(rangeHandler);
    chartRef.current = chart;
    equitySeriesRef.current = equitySeries;
    drawdownSeriesRef.current = drawdownSeries;
    setReady(true);
    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.unsubscribeClick(clickHandler);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(rangeHandler);
      chart.remove();
      chartRef.current = null;
      equitySeriesRef.current = null;
      drawdownSeriesRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const equitySeries = equitySeriesRef.current;
    const drawdownSeries = drawdownSeriesRef.current;
    if (!chart || !equitySeries || !drawdownSeries || !ready) return;
    const css = (name: string, fallback: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    chart.applyOptions({
      layout: {
        background: { color: 'transparent' },
        textColor: css('--muted-foreground', '#64748b'),
        attributionLogo: false,
      },
      localization: {
        timeFormatter: (time: Time) => {
          const value = milliseconds(time);
          return value === null ? '' : formatDateTimeInTimeZone(value, model.timezone, '');
        },
      },
    });
    equitySeries.applyOptions({
      color: css('--chart-1', '#2563eb'),
      lineWidth: 2,
      pointMarkersVisible: model.equity.length <= 1,
      priceFormat: { type: 'custom', formatter: currencyFormatter(model.currency) },
      title: `组合权益 ${model.currency ?? ''}`.trim(),
    });
    drawdownSeries.applyOptions({
      color: css('--color-market-down', '#2f7a66'),
      lineWidth: 2,
      pointMarkersVisible: model.drawdown.length <= 1,
      priceFormat: { type: 'custom', formatter: (value: number) => `${(value * 100).toFixed(2)}%` },
      title: model.drawdownSource === 'authoritative' ? '回撤' : '回撤（展示派生）',
    });
    equitySeries.setData(
      model.equity.map((point) => ({ time: backtestChartTime(point.time), value: point.value })),
    );
    drawdownSeries.setData(
      model.drawdown.map((point) => ({ time: backtestChartTime(point.time), value: point.value })),
    );
    if (lastResetKeyRef.current !== resetKey) {
      chart.timeScale().fitContent();
      lastResetKeyRef.current = resetKey;
      setLockedTime(null);
    }
  }, [model, ready, resetKey, themeRevision]);

  useEffect(() => {
    const chart = chartRef.current;
    const equitySeries = equitySeriesRef.current;
    if (!chart || !equitySeries) return;
    const point = model.equity.find((candidate) => candidate.time === lockedTime);
    if (!point) chart.clearCrosshairPosition();
    else chart.setCrosshairPosition(point.value, backtestChartTime(point.time), equitySeries);
  }, [lockedTime, model.equity]);

  const changeRange = (action: RangeAction) => {
    const chart = chartRef.current;
    const range = chart?.timeScale().getVisibleLogicalRange();
    if (!chart || !range || model.equity.length < 2) return;
    chart
      .timeScale()
      .setVisibleLogicalRange(
        nextBacktestLogicalRange(
          { from: Number(range.from), to: Number(range.to) },
          model.equity.length,
          action,
        ),
      );
  };
  const reset = () => chartRef.current?.timeScale().fitContent();
  const selectPreset = (days: number | null) => {
    const chart = chartRef.current;
    const first = model.equity[0];
    const last = model.equity.at(-1);
    if (!chart || !first || !last) return;
    const from = days === null ? first.time : Math.max(first.time, last.time - days * 86_400_000);
    chart.timeScale().setVisibleRange({
      from: backtestChartTime(from),
      to: backtestChartTime(last.time),
    });
  };

  return {
    containerRef,
    activeTime: lockedTime ?? hoverTime,
    lockedTime,
    changeRange,
    reset,
    selectPreset,
  };
};
