import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CrosshairMode,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
  type Time,
} from 'lightweight-charts';
import { backtestChartTime, paintBacktestChart } from './backtest-chart-paint.js';
import type { BacktestChartModel } from './strategy-backtest-chart.model.js';
import { nextBacktestLogicalRange } from './strategy-backtest-chart.model.js';

type ChartApi = ReturnType<typeof createChart>;
type SeriesApi = ReturnType<ChartApi['addSeries']>;
type RangeAction = 'zoomIn' | 'zoomOut' | 'earlier' | 'later';
type ChartPointer = { time?: unknown; hoveredObjectId?: unknown };

const milliseconds = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value * 1_000 : null;

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
  const instrumentSeriesRef = useRef<SeriesApi | null>(null);
  const tradeMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const markerTimesRef = useRef(new Map<string, number>());
  const onRangeChangeRef = useRef(onRangeChange);
  const lockedTimeRef = useRef<number | null>(null);
  const lastResetKeyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [themeRevision, setThemeRevision] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [lockedTime, setLockedTime] = useState<number | null>(null);
  const hasEquity = model.equity.length > 0;
  onRangeChangeRef.current = onRangeChange;
  lockedTimeRef.current = lockedTime;

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setThemeRevision((value) => value + 1));
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme', 'style', 'data-market-color-scheme'] });
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
      leftPriceScale: { visible: false },
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
    const instrumentSeries = chart.addSeries(LineSeries, { lineWidth: 2, priceScaleId: 'left', visible: false }, 0);
    const tradeMarkers = createSeriesMarkers(instrumentSeries, [], { autoScale: true });
    tradeMarkersRef.current = tradeMarkers;
    chart.panes()[0]?.setStretchFactor(3);
    chart.panes()[1]?.setStretchFactor(1);
    const eventTime = (param: ChartPointer) => {
      if (typeof param.hoveredObjectId === 'string') {
        const markerTime = markerTimesRef.current.get(param.hoveredObjectId);
        if (markerTime !== undefined) return markerTime;
      }
      return milliseconds(param.time);
    };
    const crosshairHandler = (param: ChartPointer) => {
      if (lockedTimeRef.current === null) setHoverTime(eventTime(param));
    };
    const clickHandler = (param: ChartPointer) => {
      const selected = eventTime(param);
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
    instrumentSeriesRef.current = instrumentSeries;
    setReady(true);
    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.unsubscribeClick(clickHandler);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(rangeHandler);
      tradeMarkers.detach();
      tradeMarkersRef.current = null;
      markerTimesRef.current.clear();
      chart.remove();
      chartRef.current = null;
      equitySeriesRef.current = null;
      drawdownSeriesRef.current = null;
      instrumentSeriesRef.current = null;
      lastResetKeyRef.current = null;
      setReady(false);
    };
  }, [hasEquity]);

  useEffect(() => {
    const chart = chartRef.current;
    const equitySeries = equitySeriesRef.current;
    const drawdownSeries = drawdownSeriesRef.current;
    if (!chart || !equitySeries || !drawdownSeries || !ready) return;
    const visibleRange = chart.timeScale().getVisibleRange();
    markerTimesRef.current = new Map(model.tradeMarkers.map((group) => [group.id, group.time]));
    paintBacktestChart(chart, equitySeries, drawdownSeries, tradeMarkersRef.current, model, instrumentSeriesRef.current);
    if (lastResetKeyRef.current !== resetKey) {
      chart.timeScale().fitContent();
      lastResetKeyRef.current = resetKey;
      setLockedTime(null);
      setHoverTime(null);
    } else if (visibleRange) {
      chart.timeScale().setVisibleRange(visibleRange);
    }
  }, [model, ready, resetKey, themeRevision]);

  useEffect(() => {
    const chart = chartRef.current;
    const equitySeries = equitySeriesRef.current;
    if (!chart || !equitySeries) return;
    const drawdown = model.drawdown.find((candidate) => candidate.time === lockedTime);
    const instrument = model.instrument?.status === 'available'
      ? model.instrument.points.find((candidate) => candidate.time === lockedTime)
      : null;
    if (instrument?.value !== null && instrument?.value !== undefined && instrumentSeriesRef.current) {
      chart.setCrosshairPosition(instrument.value, backtestChartTime(instrument.time), instrumentSeriesRef.current);
      return;
    }
    const point = model.equity.find((candidate) => candidate.time === lockedTime);
    if (point) {
      chart.setCrosshairPosition(point.value, backtestChartTime(point.time), equitySeries);
      return;
    }
    if (drawdown && drawdownSeriesRef.current) {
      chart.setCrosshairPosition(drawdown.value, backtestChartTime(drawdown.time), drawdownSeriesRef.current);
    } else {
      chart.clearCrosshairPosition();
    }
  }, [lockedTime, model.equity, model.drawdown, model.instrument]);

  const timeline = useMemo(
    () => [...new Set([...model.equity, ...model.drawdown, ...(model.instrument?.status === 'available' ? model.instrument.points : [])].map((point) => point.time))].sort((a, b) => a - b),
    [model.equity, model.drawdown, model.instrument],
  );
  const activeTime = lockedTime ?? hoverTime;
  const stepPoint = (direction: -1 | 1) => {
    const range = chartRef.current?.timeScale().getVisibleRange();
    const from = milliseconds(range?.from);
    const to = milliseconds(range?.to);
    const times = timeline.filter((time) =>
      (from === null || time >= from) && (to === null || time < to + 1_000),
    );
    if (direction < 0) times.reverse();
    const next = times.find((time) => activeTime === null || (time - activeTime) * direction > 0);
    setLockedTime(next ?? times.at(-1) ?? null);
  };
  const clearPoint = () => {
    setLockedTime(null);
    setHoverTime(null);
  };

  const changeRange = (action: RangeAction) => {
    const chart = chartRef.current;
    const range = chart?.timeScale().getVisibleLogicalRange();
    if (!chart || !range || timeline.length < 2) return;
    chart
      .timeScale()
      .setVisibleLogicalRange(
        nextBacktestLogicalRange(
          { from: Number(range.from), to: Number(range.to) },
          timeline.length,
          action,
        ),
      );
  };
  const reset = () => chartRef.current?.timeScale().fitContent();
  const selectPreset = (days: number | null) => {
    const chart = chartRef.current;
    const first = timeline[0];
    const last = timeline.at(-1);
    if (!chart || first === undefined || last === undefined) return;
    const from = days === null ? first : Math.max(first, last - days * 86_400_000);
    chart.timeScale().setVisibleRange({
      from: backtestChartTime(from),
      to: backtestChartTime(last),
    });
  };

  return {
    containerRef,
    activeTime,
    stepPoint,
    clearPoint,
    lockedTime,
    changeRange,
    reset,
    selectPreset,
  };
};
