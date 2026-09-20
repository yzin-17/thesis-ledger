import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MarketChartBar, MarketChartIndicator } from './market-chart-types.js';
import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  createTextWatermark,
} from 'lightweight-charts';
import {
  buildChartPoints,
  indicatorComparable,
  indicatorValue,
  type ChartPoint,
} from './market-chart-model.js';
import type { ChartPreference } from './market-chart-preferences.js';
import {
  beginHistoryDrag,
  endHistoryDrag,
  idleHistoryDragState,
  markHistoryDragMovement,
  transitionHistoryBoundary,
} from './market-chart-history-gesture.js';
import { hasLeftHistoryBlank, hasReachedLatestBoundary } from './market-chart-viewport.js';
import { marketChartPaneLabels } from './market-chart-pane-labels.js';

export const auxiliaryLatestValueOptions = {
  lastValueVisible: false,
  priceLineVisible: false,
} as const;

export const marketChartLayoutOptions = {
  background: { color: 'transparent' },
  textColor: '#64748b',
  attributionLogo: false,
} as const;

export const rangeMonths = (range: number): number | null => {
  if (range === 30) return 1;
  if (range === 90) return 3;
  if (range === 180) return 6;
  if (range === 365) return 12;
  return null;
};

export const visibleBarsForRange = (bars: MarketChartBar[], range: number) => {
  const latest = bars.at(-1);
  if (!latest) return [];
  const months = rangeMonths(range);
  if (months === null) return bars;
  const cutoffDate = new Date(latest.timestamp);
  cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - months);
  const cutoff = cutoffDate.getTime();
  return bars.filter((bar) => Date.parse(bar.timestamp) >= cutoff);
};

export const rangeCoverage = (bars: MarketChartBar[], range: number) => {
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
  chartPoints: providedChartPoints,
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
  onLoadEarlier,
  onRetryEarlier,
  canLoadEarlier,
  historyLoading,
  historyError,
  onLoadLater,
  onRetryLater,
  canLoadLater,
  latestLoading,
  onHover,
  onClick,
  lockedTimestamp,
}: {
  bars: MarketChartBar[];
  indicators: MarketChartIndicator[];
  chartPoints?: ChartPoint[];
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
  onLoadEarlier?: (() => void) | undefined;
  onRetryEarlier?: (() => void) | undefined;
  canLoadEarlier?: boolean | undefined;
  historyLoading?: boolean | undefined;
  historyError?: string | null | undefined;
  onLoadLater?: (() => void) | undefined;
  onRetryLater?: (() => void) | undefined;
  canLoadLater?: boolean | undefined;
  latestLoading?: boolean | undefined;
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
    barsInLogicalRange: (range: { from: number; to: number }) => { barsBefore: number } | null;
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartApi | null>(null);
  const seriesRef = useRef<Map<string, DataSeries>>(new Map());
  const paneWatermarksRef = useRef<Array<{ detach: () => void }>>([]);
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
  const onLoadEarlierRef = useRef(onLoadEarlier);
  const onRetryEarlierRef = useRef(onRetryEarlier);
  const canLoadEarlierRef = useRef(canLoadEarlier);
  const historyLoadingRef = useRef(historyLoading);
  const historyErrorRef = useRef(historyError);
  const onLoadLaterRef = useRef(onLoadLater);
  const onRetryLaterRef = useRef(onRetryLater);
  const canLoadLaterRef = useRef(canLoadLater);
  const latestLoadingRef = useRef(latestLoading);
  const lockedTimestampRef = useRef(lockedTimestamp);
  const chartModeRef = useRef(chartMode);
  const historyDragStateRef = useRef(idleHistoryDragState);
  onHoverRef.current = onHover;
  onClickRef.current = onClick;
  onVisibleRangeChangeRef.current = onVisibleRangeChange;
  onLoadEarlierRef.current = onLoadEarlier;
  onRetryEarlierRef.current = onRetryEarlier;
  canLoadEarlierRef.current = canLoadEarlier;
  historyLoadingRef.current = historyLoading;
  historyErrorRef.current = historyError;
  onLoadLaterRef.current = onLoadLater;
  onRetryLaterRef.current = onRetryLater;
  canLoadLaterRef.current = canLoadLater;
  latestLoadingRef.current = latestLoading;
  lockedTimestampRef.current = lockedTimestamp;
  chartModeRef.current = chartMode;
  const [chartReady, setChartReady] = useState(false);
  const [themeRevision, setThemeRevision] = useState(0);
  const [isLeftHistoryBlank, setIsLeftHistoryBlank] = useState(false);
  const [isLatestBoundaryReached, setIsLatestBoundaryReached] = useState(false);
  const chartIndicators = useMemo(
    () =>
      indicators.filter((item) => visibleIndicators.includes(item.name)),
    [indicators, visibleIndicators],
  );
  const chartPoints = useMemo(
    () => providedChartPoints ?? buildChartPoints(bars, chartIndicators),
    [bars, chartIndicators, providedChartPoints],
  );

  const updateHistoryBoundary = useCallback((
    chart: ChartApi,
    range: { from: number; to: number } | null,
  ) => {
    if (!range) {
      setIsLeftHistoryBlank(false);
      setIsLatestBoundaryReached(false);
      return;
    }
    const primarySeries = seriesRef.current.get(
      chartModeRef.current === 'candles' ? 'candles' : 'close',
    );
    const barsInfo = primarySeries?.barsInLogicalRange(range);
    const hasBlank = hasLeftHistoryBlank(barsInfo?.barsBefore);
    const reachedLatest = hasReachedLatestBoundary(barsInfo?.barsAfter);
    setIsLeftHistoryBlank(hasBlank);
    setIsLatestBoundaryReached(reachedLatest);
    const transition = transitionHistoryBoundary(historyDragStateRef.current, {
      hasLeftHistoryBlank: hasBlank,
      canLoadEarlier: canLoadEarlierRef.current === true,
      historyLoading: historyLoadingRef.current === true,
      hasReachedLatestBoundary: reachedLatest,
      canLoadLater: canLoadLaterRef.current === true,
      latestLoading: latestLoadingRef.current === true,
    });
    historyDragStateRef.current = transition.state;
    if (transition.shouldLoadEarlier) {
      if (historyErrorRef.current && onRetryEarlierRef.current) {
        onRetryEarlierRef.current();
      } else {
        onLoadEarlierRef.current?.();
      }
    }
    if (transition.shouldLoadLater) onLoadLaterRef.current?.();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setThemeRevision((value) => value + 1));
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-market-color-scheme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      autoSize: true,
      height: 390,
      layout: marketChartLayoutOptions,
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
    const visibleLogicalRangeHandler = (range: { from: number; to: number } | null) =>
      updateHistoryBoundary(chart, range);
    const pointerDownHandler = () => {
      historyDragStateRef.current = beginHistoryDrag();
    };
    const pointerMoveHandler = () => {
      historyDragStateRef.current = markHistoryDragMovement(historyDragStateRef.current);
      updateHistoryBoundary(chart, chart.timeScale().getVisibleLogicalRange());
    };
    const pointerEndHandler = () => {
      historyDragStateRef.current = endHistoryDrag();
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(visibleRangeHandler);
    chart.timeScale().subscribeVisibleLogicalRangeChange(visibleLogicalRangeHandler);
    container.addEventListener('pointerdown', pointerDownHandler);
    container.addEventListener('pointermove', pointerMoveHandler);
    window.addEventListener('pointerup', pointerEndHandler);
    window.addEventListener('pointercancel', pointerEndHandler);
    const resizeObserver = new ResizeObserver(() => {
      const requested = firstLayoutPendingRef.current
        ? requestedInitialRangeRef.current
        : previousVisibleRangeRef.current;
      if (!requested) return;
      chart.timeScale().setVisibleRange(requested);
      previousVisibleRangeRef.current = requested;
      firstLayoutPendingRef.current = false;
      onVisibleRangeChangeRef.current?.({
        from: requested.from as string,
        to: requested.to as string,
      });
    });
    resizeObserver.observe(container);
    chartRef.current = chart;
    setChartReady(true);
    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.unsubscribeClick(clickHandler);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(visibleRangeHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(visibleLogicalRangeHandler);
      container.removeEventListener('pointerdown', pointerDownHandler);
      container.removeEventListener('pointermove', pointerMoveHandler);
      window.removeEventListener('pointerup', pointerEndHandler);
      window.removeEventListener('pointercancel', pointerEndHandler);
      resizeObserver.disconnect();
      paneWatermarksRef.current.forEach((watermark) => watermark.detach());
      paneWatermarksRef.current = [];
      chart.remove();
      chartRef.current = null;
      seriesRef.current.clear();
      historyDragStateRef.current = endHistoryDrag();
      setIsLeftHistoryBlank(false);
      setChartReady(false);
    };
  }, [updateHistoryBoundary]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady || chartPoints.length === 0) return;
    paneWatermarksRef.current.forEach((watermark) => watermark.detach());
    paneWatermarksRef.current = [];
    const cssColor = (name: string, fallback: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    const positiveColor = cssColor('--color-market-up', '#c7393c');
    const negativeColor = cssColor('--color-market-down', '#2f7a66');
    const chartPrimary = cssColor('--chart-1', '#2563eb');
    const chartWarning = cssColor('--chart-4', '#f59e0b');
    const chartMuted = cssColor('--chart-5', '#94a3b8');
    const usedSeries = new Set<string>();
    const addSeries = (key: string, definition: unknown, options: unknown, pane?: number) => {
      let series = seriesRef.current.get(key);
      if (!series) {
        series =
          pane === undefined
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
      lastValueVisible: chartMode === 'candles',
      priceLineVisible: chartMode === 'candles',
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
      lastValueVisible: chartMode === 'close',
      priceLineVisible: chartMode === 'close',
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
      {
        color: 'rgba(100, 116, 139, 0.45)',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        ...auxiliaryLatestValueOptions,
      },
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
          const color =
            [
              chartPrimary,
              chartWarning,
              cssColor('--chart-2', '#9333ea'),
              cssColor('--chart-3', '#0891b2'),
            ][index] ?? chartPrimary;
          const line = addSeries(
            `ma-${name}`,
            LineSeries,
            { color, lineWidth: 2, ...auxiliaryLatestValueOptions },
            0,
          );
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
      .filter((item): item is MarketChartIndicator => (item?.points?.length ?? 0) > 0);
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
          paneName === 'MACD'
            ? ([chartPrimary, chartWarning, chartMuted][index] ?? chartPrimary)
            : chartPrimary;
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
            ...auxiliaryLatestValueOptions,
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
              ...auxiliaryLatestValueOptions,
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
        const zeroLine = addSeries(
          `MACD-${pane}-zero`,
          LineSeries,
          {
            color: chartMuted,
            lineWidth: 1,
            lineStyle: 2,
            ...auxiliaryLatestValueOptions,
          },
          pane,
        );
        setData(
          zeroLine,
          chartPoints.map((point) => ({ time: point.date, value: 0 })),
        );
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

    paneWatermarksRef.current = marketChartPaneLabels({
      chartMode,
      activePane,
      showBothPanes,
      hasMacdPane: paneIndicators.some((item) => item.name === 'MACD'),
      hasRsiPane: paneIndicators.some((item) => item.name === 'RSI'),
    }).flatMap(({ pane, text }) => {
      const targetPane = chart.panes()[pane];
      if (!targetPane) return [];
      return [
        createTextWatermark(targetPane, {
          visible: true,
          horzAlign: 'left',
          vertAlign: 'top',
          lines: [
            {
              text,
              color: cssColor('--muted-foreground', '#64748b'),
              fontSize: 12,
              fontFamily: 'Inter, sans-serif',
              fontStyle: 'normal',
            },
          ],
        }),
      ];
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
    } else if (shouldFocusLatest || isLatestBoundaryReached) {
      // 最新探针返回时仅在用户仍贴着右边界才跟随新日期；离开边界后保留用户当前视口。
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
    updateHistoryBoundary(chart, chart.timeScale().getVisibleLogicalRange());
  }, [
    activePane,
    bars,
    chartIndicators,
    chartMode,
    chartPoints,
    chartReady,
    focusLatestRevision,
    isLatestBoundaryReached,
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
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[390px] max-h-[390px] min-h-0 min-w-0 w-full max-w-full overflow-hidden [&_table]:h-auto [&_table]:min-w-0 [&_table]:w-auto [&_td]:min-w-0 [&_td]:p-0"
        data-market-lightweight-chart
      />
      {isLeftHistoryBlank && historyLoading ? (
        <span className="pointer-events-none absolute top-3 left-3 text-xs text-muted-foreground">
          正在加载更早日线…
        </span>
      ) : null}
      {isLatestBoundaryReached && latestLoading ? (
        <span className="pointer-events-none absolute top-3 right-3 text-xs text-muted-foreground">
          正在检查更新日线…
        </span>
      ) : null}
    </div>
  );
}
