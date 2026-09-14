import { useEffect, useMemo, useRef, useState } from 'react';
import type { BarV1, IndicatorV1 } from '@thesis-ledger/schemas';
import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
} from 'lightweight-charts';
import { buildChartPoints, indicatorComparable, indicatorValue } from './market-chart-model.js';
import type { ChartPreference } from './market-chart-preferences.js';

export const rangeMonths = (range: number): number | null => {
  if (range === 30) return 1;
  if (range === 90) return 3;
  if (range === 180) return 6;
  if (range === 365) return 12;
  return null;
};

export const visibleBarsForRange = (bars: BarV1[], range: number) => {
  const latest = bars.at(-1);
  if (!latest) return [];
  const months = rangeMonths(range);
  if (months === null) return bars;
  const cutoffDate = new Date(latest.timestamp);
  cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - months);
  const cutoff = cutoffDate.getTime();
  return bars.filter((bar) => Date.parse(bar.timestamp) >= cutoff);
};

export const rangeCoverage = (bars: BarV1[], range: number) => {
  const months = rangeMonths(range);
  const earliest = bars[0];
  const latest = bars.at(-1);
  if (months === null || !earliest || !latest) return null;
  const cutoffDate = new Date(latest.timestamp);
  cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - months);
  return {
    available: Date.parse(earliest.timestamp) <= cutoffDate.getTime(),
    earliest: earliest.timestamp.slice(0, 10),
    latest: latest.timestamp.slice(0, 10),
    months,
  };
};

export function LightweightMarketChart({
  bars,
  indicators,
  visibleRange,
  chartMode,
  activePane,
  visibleIndicators,
  visibleMA,
  rsiPeriod,
  showBothPanes,
  focusLatestRevision,
  resetRevision,
  viewAction,
  onVisibleRangeChange,
  onHover,
  onClick,
  lockedTimestamp,
}: {
  bars: BarV1[];
  indicators: IndicatorV1[];
  visibleRange: number;
  chartMode: 'candles' | 'close';
  activePane: 'MACD' | 'RSI';
  visibleIndicators: ChartPreference['visibleIndicators'];
  visibleMA: ChartPreference['visibleMA'];
  rsiPeriod: ChartPreference['rsiPeriod'];
  showBothPanes: boolean;
  focusLatestRevision: number;
  resetRevision: number;
  viewAction?: { type: 'zoomIn' | 'zoomOut' | 'panEarlier' | 'panLater'; revision: number };
  onVisibleRangeChange?: (range: { from: string; to: string } | null) => void;
  onHover: (timestamp: string | null) => void;
  onClick: (timestamp: string | null) => void;
  lockedTimestamp?: string | null;
}) {
  type ChartApi = ReturnType<typeof createChart>;
  type TimeScaleApi = ReturnType<ChartApi['timeScale']>;
  type SeriesHandle = Parameters<ChartApi['removeSeries']>[0];
  type DataSeries = SeriesHandle & {
    setData: (data: never[]) => void;
    applyOptions: (options: never) => void;
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartApi | null>(null);
  const seriesRef = useRef<Map<string, DataSeries>>(new Map());
  const previousVisibleRangeRef = useRef<ReturnType<TimeScaleApi['getVisibleRange']>>(null);
  const requestedInitialRangeRef = useRef<ReturnType<TimeScaleApi['getVisibleRange']>>(null);
  const firstLayoutPendingRef = useRef(true);
  const lastFocusLatestRevisionRef = useRef(focusLatestRevision);
  const lastResetRevisionRef = useRef(resetRevision);
  const lastVisibleRangeRef = useRef(visibleRange);
  const lastViewActionRevisionRef = useRef(viewAction?.revision ?? 0);
  const onHoverRef = useRef(onHover);
  const onClickRef = useRef(onClick);
  const onVisibleRangeChangeRef = useRef(onVisibleRangeChange);
  const lockedTimestampRef = useRef(lockedTimestamp);
  onHoverRef.current = onHover;
  onClickRef.current = onClick;
  onVisibleRangeChangeRef.current = onVisibleRangeChange;
  lockedTimestampRef.current = lockedTimestamp;
  const [chartReady, setChartReady] = useState(false);
  const [themeRevision, setThemeRevision] = useState(0);
  const chartIndicators = useMemo(
    () =>
      indicators.filter((item) => visibleIndicators.includes(item.name as 'MA' | 'MACD' | 'RSI')),
    [indicators, visibleIndicators],
  );
  const chartPoints = useMemo(
    () => buildChartPoints(bars, chartIndicators),
    [bars, chartIndicators],
  );

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
      height: 390,
      layout: { background: { color: 'transparent' }, textColor: '#64748b' },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.16)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.16)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
      timeScale: { borderColor: 'rgba(148, 163, 184, 0.35)', timeVisible: false },
    });
    const crosshairHandler = (param: { time?: unknown }) => {
      if (lockedTimestampRef.current) return;
      onHoverRef.current(typeof param.time === 'string' ? param.time : null);
    };
    const clickHandler = (param: { time?: unknown }) =>
      onClickRef.current(typeof param.time === 'string' ? param.time : null);
    chart.subscribeCrosshairMove(crosshairHandler);
    chart.subscribeClick(clickHandler);
    const visibleRangeHandler = () => {
      const range = chart.timeScale().getVisibleRange();
      if (range && typeof range.from === 'string' && typeof range.to === 'string') {
        if (firstLayoutPendingRef.current) return;
        previousVisibleRangeRef.current = range;
        onVisibleRangeChangeRef.current?.({ from: range.from, to: range.to });
      }
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(visibleRangeHandler);
    const resizeObserver = new ResizeObserver(() => {
      const requested = firstLayoutPendingRef.current
        ? requestedInitialRangeRef.current
        : previousVisibleRangeRef.current;
      if (!requested) return;
      chart.timeScale().setVisibleRange(requested);
      previousVisibleRangeRef.current = requested;
      firstLayoutPendingRef.current = false;
      onVisibleRangeChangeRef.current?.({ from: requested.from as string, to: requested.to as string });
    });
    resizeObserver.observe(container);
    chartRef.current = chart;
    setChartReady(true);
    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.unsubscribeClick(clickHandler);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(visibleRangeHandler);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current.clear();
      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady || chartPoints.length === 0) return;
    const cssColor = (name: string, fallback: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    const positiveColor = cssColor('--color-positive', '#2f7a66');
    const negativeColor = cssColor('--color-negative', '#b64c5b');
    const chartPrimary = cssColor('--chart-1', '#2563eb');
    const chartWarning = cssColor('--chart-4', '#f59e0b');
    const chartMuted = cssColor('--chart-5', '#94a3b8');
    const usedSeries = new Set<string>();
    const addSeries = (key: string, definition: unknown, options: unknown, pane?: number) => {
      let series = seriesRef.current.get(key);
      if (!series) {
        series = pane === undefined
          ? chart.addSeries(definition as never, options as never)
          : chart.addSeries(definition as never, options as never, pane);
        seriesRef.current.set(key, series);
      } else {
        series.applyOptions(options as never);
      }
      usedSeries.add(key);
      return series;
    };
    const setData = (series: DataSeries, data: unknown[]) => series.setData(data as never[]);

    const candles = addSeries('candles', CandlestickSeries, {
      upColor: positiveColor,
      downColor: negativeColor,
      borderUpColor: positiveColor,
      borderDownColor: negativeColor,
      wickUpColor: positiveColor,
      wickDownColor: negativeColor,
      visible: chartMode === 'candles',
    });
    setData(
      candles,
      chartPoints.map((point) =>
        point.bar
          ? {
              time: point.date,
              open: point.bar.open,
              high: point.bar.high,
              low: point.bar.low,
              close: point.bar.close,
            }
          : { time: point.date },
      ),
    );
    const close = addSeries('close', LineSeries, {
      color: chartPrimary,
      lineWidth: 2,
      visible: chartMode === 'close',
    });
    setData(
      close,
      chartPoints.map((point) =>
        point.bar ? { time: point.date, value: point.bar.close } : { time: point.date },
      ),
    );
    const volume = addSeries(
      'volume',
      HistogramSeries,
      { color: 'rgba(100, 116, 139, 0.45)', priceFormat: { type: 'volume' }, priceScaleId: '' },
      1,
    );
    setData(
      volume,
      chartPoints.map((point) =>
        point.bar
          ? {
              time: point.date,
              value: point.bar.volume,
              color: point.bar.close >= point.bar.open ? positiveColor : negativeColor,
            }
          : { time: point.date },
      ),
    );

    const maIndicator = chartIndicators.find((item) => item.name === 'MA');
    if (maIndicator?.points) {
      ['ma5', 'ma10', 'ma20', 'ma60']
        .filter((name) => visibleMA.includes(name as ChartPreference['visibleMA'][number]))
        .forEach((name, index) => {
          const color = [chartPrimary, chartWarning, cssColor('--chart-2', '#9333ea'), cssColor('--chart-3', '#0891b2')][index] ?? chartPrimary;
          const line = addSeries(`ma-${name}`, LineSeries, { color, lineWidth: 2 }, 0);
          setData(
            line,
            chartPoints.map((point) => {
              const value = indicatorComparable(point, 'MA')
                ? indicatorValue(point.indicators.MA, [name])
                : null;
              return value === null ? { time: point.date } : { time: point.date, value };
            }),
          );
        });
    }

    const paneIndicators = (showBothPanes ? (['MACD', 'RSI'] as const) : [activePane])
      .map((name) => chartIndicators.find((item) => item.name === name))
      .filter((item): item is IndicatorV1 => Boolean(item?.points));
    const hasMacdPane = paneIndicators.some((item) => item.name === 'MACD');
    paneIndicators.forEach((selected) => {
      const paneName = selected.name as 'MACD' | 'RSI';
      const pane = paneName === 'MACD' || !hasMacdPane ? 2 : 3;
      const names =
        paneName === 'MACD'
          ? [['dif'], ['dea'], ['histogram', 'hist', 'macdbar']]
          : [[`rsi${rsiPeriod}`, 'rsi']];
      names.forEach((name, index) => {
        const color =
          paneName === 'MACD' ? ([chartPrimary, chartWarning, chartMuted][index] ?? chartPrimary) : chartPrimary;
        const line = addSeries(
          `${paneName}-${pane}-${index}`,
          paneName === 'MACD' && index === 2 ? HistogramSeries : LineSeries,
          {
            color,
            ...(paneName === 'RSI'
              ? {
                  priceScaleId: 'right',
                  autoscaleInfoProvider: () => ({
                    priceRange: { minValue: 0, maxValue: 100 },
                    margins: { above: 0, below: 0 },
                  }),
                }
              : {}),
            ...(paneName === 'MACD' && index === 2
              ? { base: 0, priceFormat: { type: 'price' } }
              : {}),
            ...(paneName === 'RSI'
              ? { lastValueVisible: false, priceLineVisible: false }
              : {}),
          },
          pane,
        );
        setData(
          line,
          chartPoints.map((point) => {
            const value = indicatorComparable(point, paneName)
              ? indicatorValue(point.indicators[paneName], name)
              : null;
            return value === null
              ? { time: point.date }
              : {
                  time: point.date,
                  value,
                  ...(paneName === 'MACD' && index === 2
                    ? { color: value >= 0 ? positiveColor : negativeColor }
                    : {}),
                };
          }),
        );
      });
      if (paneName === 'RSI') {
        chart.priceScale('right', pane).applyOptions({
          visible: true,
          autoScale: true,
          scaleMargins: { top: 0, bottom: 0 },
        });
        [0, 30, 50, 70, 100].forEach((reference) => {
          const referenceLine = addSeries(
            `${paneName}-${pane}-reference-${reference}`,
            LineSeries,
            {
              color:
                reference === 0 || reference === 100
                  ? 'rgba(0,0,0,0)'
                  : 'rgba(100, 116, 139, 0.45)',
              lineWidth: 1,
              lineStyle: 2,
              priceScaleId: 'right',
              lastValueVisible: false,
              priceLineVisible: false,
            },
            pane,
          );
          setData(
            referenceLine,
            chartPoints.map((point) => ({ time: point.date, value: reference })),
          );
        });
      }
      if (paneName === 'MACD') {
        const zeroLine = addSeries(`MACD-${pane}-zero`, LineSeries, {
          color: chartMuted,
          lineWidth: 1,
          lineStyle: 2,
          lastValueVisible: false,
          priceLineVisible: false,
        }, pane);
        setData(zeroLine, chartPoints.map((point) => ({ time: point.date, value: 0 })));
      }
    });

    for (const [key, series] of seriesRef.current) {
      if (!usedSeries.has(key)) {
        chart.removeSeries(series);
        seriesRef.current.delete(key);
      }
    }

    chart.panes().forEach((pane, index) => {
      pane.setStretchFactor([5, 1, 2, 2][index] ?? 2);
    });

    const previous = previousVisibleRangeRef.current;
    const shouldReset = resetRevision !== lastResetRevisionRef.current;
    const shouldFocusLatest = focusLatestRevision !== lastFocusLatestRevisionRef.current;
    const shouldChangeRange = visibleRange !== lastVisibleRangeRef.current;
    lastResetRevisionRef.current = resetRevision;
    lastFocusLatestRevisionRef.current = focusLatestRevision;
    lastVisibleRangeRef.current = visibleRange;
    const latestDate = chartPoints.at(-1)?.date;
    if (!latestDate) return;
    if (shouldReset || shouldChangeRange || !previous) {
      const cutoffDate = new Date(`${latestDate}T00:00:00Z`);
      const months = rangeMonths(visibleRange);
      if (months === null) {
        const firstDate = chartPoints[0]?.date;
        if (firstDate) {
          chart.timeScale().setVisibleRange({ from: firstDate, to: latestDate });
          requestedInitialRangeRef.current = { from: firstDate, to: latestDate };
        }
      } else {
        cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - months);
        chart
          .timeScale()
          .setVisibleRange({ from: cutoffDate.toISOString().slice(0, 10), to: latestDate });
        requestedInitialRangeRef.current = {
          from: cutoffDate.toISOString().slice(0, 10),
          to: latestDate,
        };
      }
      if (previous) firstLayoutPendingRef.current = false;
    } else if (shouldFocusLatest) {
      const logical = chart.timeScale().getVisibleLogicalRange();
      if (logical) {
        const width = Math.max(logical.to - logical.from, 1);
        const to = chartPoints.length - 1;
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, to - width), to });
      }
    } else {
      chart.timeScale().setVisibleRange(previous);
    }
    previousVisibleRangeRef.current = chart.timeScale().getVisibleRange();
    if (viewAction && viewAction.revision !== lastViewActionRevisionRef.current) {
      const logical = chart.timeScale().getVisibleLogicalRange();
      if (logical) {
        const width = Math.max(logical.to - logical.from, 1);
        let from = Number(logical.from);
        let to = Number(logical.to);
        if (viewAction.type === 'zoomIn' || viewAction.type === 'zoomOut') {
          const factor = viewAction.type === 'zoomIn' ? 0.8 : 1.25;
          const nextWidth = Math.max(2, Math.min(chartPoints.length - 1, width * factor));
          const center = (from + to) / 2;
          from = Math.max(0, center - nextWidth / 2);
          to = Math.min(chartPoints.length - 1, center + nextWidth / 2);
        } else {
          const shift = width * 0.25 * (viewAction.type === 'panEarlier' ? -1 : 1);
          from = Math.max(0, Math.min(chartPoints.length - width, from + shift));
          to = from + width;
        }
        chart.timeScale().setVisibleLogicalRange({
          from,
          to,
        });
      }
      lastViewActionRevisionRef.current = viewAction.revision;
      previousVisibleRangeRef.current = chart.timeScale().getVisibleRange();
    }
    const range = previousVisibleRangeRef.current;
    if (range && typeof range.from === 'string' && typeof range.to === 'string') {
      onVisibleRangeChangeRef.current?.({ from: range.from, to: range.to });
    }
  }, [
    activePane,
    bars,
    chartIndicators,
    chartMode,
    chartPoints,
    chartReady,
    focusLatestRevision,
    resetRevision,
    rsiPeriod,
    showBothPanes,
    visibleIndicators,
    visibleMA,
    visibleRange,
    themeRevision,
    viewAction,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !lockedTimestamp) {
      if (chart && !lockedTimestamp) chart.clearCrosshairPosition();
      return;
    }
    const point = chartPoints.find((item) => item.date === lockedTimestamp);
    const bar = point?.bar;
    const series = seriesRef.current.get(chartMode === 'candles' ? 'candles' : 'close');
    if (point && bar && series) chart.setCrosshairPosition(bar.close, point.date, series);
  }, [chartMode, chartPoints, lockedTimestamp]);

  return (
    <div
      ref={containerRef}
      className="h-[390px] max-h-[390px] min-h-0 min-w-0 w-full max-w-full overflow-hidden [&_table]:h-auto [&_table]:min-w-0 [&_table]:w-auto [&_td]:min-w-0 [&_td]:p-0"
      data-market-lightweight-chart
    />
  );
}
