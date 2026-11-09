import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { MarketChartViewportController } from './market-chart-viewport-controller.js';
import { type ChartRange } from './market-chart-range.js';
import { toChartTime, chartTimeData, chartInteractionKey, chartVisibleRange, marketChartTimeOptions } from './market-chart-time.js';
export { rangeMonths, rangeCoverage, visibleBarsForRange } from './market-chart-range.js';
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
import { attachTradingOverlays } from './market-trading-overlay-resources.js';
import type { TradingOverlayModel } from './market-trading-overlay-model.js';
import { applyMacdSeriesOrder } from './market-macd-series-order.js';

export const auxiliaryLatestValueOptions = {
  lastValueVisible: false,
  priceLineVisible: false,
} as const;

export const marketChartLayoutOptions = {
  background: { color: 'transparent' },
  textColor: '#64748b',
  attributionLogo: false,
} as const;

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
  tradingOverlays,
}: {
  bars: MarketChartBar[];
  indicators: MarketChartIndicator[];
  chartPoints?: ChartPoint[];
  visibleRange: ChartRange;
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
  tradingOverlays?: TradingOverlayModel | undefined;
}) {
  type ChartApi = ReturnType<typeof createChart>;
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
  const viewportRef = useRef(new MarketChartViewportController());
  const viewportControlsRef = useRef({ range: visibleRange, reset: resetRevision, focus: focusLatestRevision });
  const viewActionRef = useRef(viewAction);
  viewportControlsRef.current = { range: visibleRange, reset: resetRevision, focus: focusLatestRevision };
  viewActionRef.current = viewAction;
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
      return;
    }
    const primarySeries = seriesRef.current.get(
      chartModeRef.current === 'candles' ? 'candles' : 'close',
    );
    const barsInfo = primarySeries?.barsInLogicalRange(range);
    const hasBlank = hasLeftHistoryBlank(barsInfo?.barsBefore);
    const reachedLatest = hasReachedLatestBoundary(barsInfo?.barsAfter);
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
    viewportRef.current.reset(viewActionRef.current?.revision ?? 0);
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
      timeScale: { minBarSpacing: 0.01, lockVisibleTimeRangeOnResize: true, borderColor: 'rgba(148, 163, 184, 0.35)', timeVisible: false },
    });
    const crosshairHandler = (param: { time?: unknown }) => {
      if (lockedTimestampRef.current) return;
      onHoverRef.current(chartInteractionKey(param.time));
    };
    const clickHandler = (param: { time?: unknown }) =>
      onClickRef.current(chartInteractionKey(param.time));
    chart.subscribeCrosshairMove(crosshairHandler);
    chart.subscribeClick(clickHandler);
    const visibleRangeHandler = () => {
      const range = chart.timeScale().getVisibleRange();
      const from = chartInteractionKey(range?.from), to = chartInteractionKey(range?.to);
      if (range && from && to) {
        onVisibleRangeChangeRef.current?.({ from, to });
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
      paneWatermarksRef.current.forEach((watermark) => watermark.detach());
      paneWatermarksRef.current = [];
      chart.remove();
      chartRef.current = null;
      seriesRef.current.clear();
      historyDragStateRef.current = endHistoryDrag();
      setChartReady(false);
    };
  }, [updateHistoryBoundary]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady || chartPoints.length === 0) return;
    const viewportBeforeUpdate = viewportRef.current.snapshot(chart);
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
    const setData = (series: DataSeries, data: unknown[]) => series.setData(chartTimeData(data) as never[]);
    chart.applyOptions(marketChartTimeOptions(chartPoints[0]?.bar));

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
        point.bar && point.bar.volume !== null
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

    applyMacdSeriesOrder(seriesRef.current);
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

    viewportRef.current.commit(chart, chartPoints,
      JSON.stringify([bars[0]?.symbol, bars[0]?.timeframe, bars[0]?.adjustment]),
      viewportControlsRef.current, viewportBeforeUpdate);
    onVisibleRangeChangeRef.current?.(chartVisibleRange(chart.timeScale().getVisibleRange()));
    updateHistoryBoundary(chart, chart.timeScale().getVisibleLogicalRange());
  }, [
    activePane,
    bars,
    chartIndicators,
    chartMode,
    chartPoints,
    chartReady,
    rsiPeriod,
    showBothPanes,
    visibleIndicators,
    visibleMA,
    themeRevision,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chartReady || !chart) return;
    viewportRef.current.updateControls(chart, { range: visibleRange, reset: resetRevision, focus: focusLatestRevision });
  }, [chartReady, visibleRange, resetRevision, focusLatestRevision]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chartReady || !chart) return;
    viewportRef.current.action(chart, viewAction);
  }, [chartReady, viewAction]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !lockedTimestamp) {
      if (chart && !lockedTimestamp) chart.clearCrosshairPosition();
      return;
    }
    const point = chartPoints.find((item) => item.date === lockedTimestamp);
    const bar = point?.bar;
    const series = seriesRef.current.get(chartMode === 'candles' ? 'candles' : 'close');
    if (point && bar && series) chart.setCrosshairPosition(bar.close, toChartTime(point.date), series);
  }, [chartMode, chartPoints, lockedTimestamp]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current.get(chartMode === 'candles' ? 'candles' : 'close');
    if (!chartReady || !chart || !series || !tradingOverlays ||
      (!tradingOverlays.arenaMarkers?.length && !tradingOverlays.markers.length && !tradingOverlays.lines.length && !tradingOverlays.measurement)) return;
    const detach = attachTradingOverlays(chart, series, tradingOverlays);
    return () => { if (chartRef.current === chart) detach(); };
  }, [chartReady, chartMode, chartPoints, tradingOverlays, themeRevision]);

  return (
    <ListRefreshRegion refreshing={Boolean(historyLoading || latestLoading)} label="正在读取行情图数据">
      <div
        ref={containerRef}
        className="h-[390px] max-h-[390px] min-h-0 min-w-0 w-full max-w-full overflow-hidden [&_table]:h-auto [&_table]:min-w-0 [&_table]:w-auto [&_td]:min-w-0 [&_td]:p-0"
        data-market-lightweight-chart
      />
    </ListRefreshRegion>
  );
}
