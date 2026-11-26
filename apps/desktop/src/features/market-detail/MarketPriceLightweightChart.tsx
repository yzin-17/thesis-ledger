import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { CrosshairMode, createChart } from 'lightweight-charts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  beginHistoryDrag,
  endHistoryDrag,
  idleHistoryDragState,
  markHistoryDragMovement,
  transitionHistoryBoundary,
} from './market-chart-history-gesture.js';
import { buildChartPoints, type ChartPoint } from './market-chart-model.js';
import type { ChartPreference } from './market-chart-preferences.js';
import { type ChartRange } from './market-chart-range.js';
import { chartInteractionKey, toChartTime } from './market-chart-time.js';
import type { MarketChartBar, MarketChartIndicator } from './market-chart-types.js';
import { MarketChartViewportController } from './market-chart-viewport-controller.js';
import { hasLeftHistoryBlank, hasReachedLatestBoundary } from './market-chart-viewport.js';
import {
  updateMarketPriceSeries,
  type ChartApi,
  type DataSeries,
} from './market-price-chart-series.js';
import type { TradingOverlayModel } from './market-trading-overlay-model.js';
import { attachTradingOverlays } from './market-trading-overlay-resources.js';
export { rangeCoverage, rangeMonths, visibleBarsForRange } from './market-chart-range.js';

export { auxiliaryLatestValueOptions } from './market-price-chart-series.js';

export const marketChartLayoutOptions = {
  background: { color: 'transparent' },
  textColor: '#64748b',
  attributionLogo: false,
} as const;

export function LightweightMarketChart(props: LightweightMarketChartProps) {
  const {
    bars,
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
    historyLoading,
    latestLoading,
    lockedTimestamp,
    tradingOverlays,
  } = props;

  const state = useLightweightMarketChartState(props);
  const {
    containerRef,
    chartRef,
    seriesRef,
    paneWatermarksRef,
    viewportRef,
    viewportControlsRef,
    onVisibleRangeChangeRef,
    onLoadEarlierRef,
    onRetryEarlierRef,
    canLoadEarlierRef,
    historyLoadingRef,
    historyErrorRef,
    onLoadLaterRef,
    canLoadLaterRef,
    latestLoadingRef,
    chartModeRef,
    historyDragStateRef,
    chartReady,
    themeRevision,
    setThemeRevision,
    chartIndicators,
    chartPoints,
  } = state;

  const updateHistoryBoundary = useCallback(
    (chart: ChartApi, range: { from: number; to: number } | null) => {
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
    },
    [],
  );

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
    return mountMarketPriceChart(state, updateHistoryBoundary);
  }, [updateHistoryBoundary]);

  useEffect(() => {
    updateMarketPriceSeries({
      chartRef,
      chartReady,
      chartPoints,
      viewportRef,
      paneWatermarksRef,
      seriesRef,
      chartIndicators,
      chartMode,
      visibleMA,
      showBothPanes,
      activePane,
      rsiPeriod,
      bars,
      viewportControlsRef,
      onVisibleRangeChangeRef,
      updateHistoryBoundary,
    });
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
    viewportRef.current.updateControls(chart, {
      range: visibleRange,
      reset: resetRevision,
      focus: focusLatestRevision,
    });
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
    if (point && bar && series)
      chart.setCrosshairPosition(bar.close, toChartTime(point.date), series);
  }, [chartMode, chartPoints, lockedTimestamp]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current.get(chartMode === 'candles' ? 'candles' : 'close');
    if (
      !chartReady ||
      !chart ||
      !series ||
      !tradingOverlays ||
      (!tradingOverlays.arenaMarkers?.length &&
        !tradingOverlays.markers.length &&
        !tradingOverlays.lines.length &&
        !tradingOverlays.measurement)
    )
      return;
    const detach = attachTradingOverlays(chart, series, tradingOverlays);
    return () => {
      if (chartRef.current === chart) detach();
    };
  }, [chartReady, chartMode, chartPoints, tradingOverlays, themeRevision]);

  return (
    <ListRefreshRegion
      refreshing={Boolean(historyLoading || latestLoading)}
      label="正在读取行情图数据"
    >
      <div
        ref={containerRef}
        className="h-[390px] max-h-[390px] min-h-0 min-w-0 w-full max-w-full overflow-hidden [&_table]:h-auto [&_table]:min-w-0 [&_table]:w-auto [&_td]:min-w-0 [&_td]:p-0"
        data-market-lightweight-chart
      />
    </ListRefreshRegion>
  );
}

type LightweightMarketChartProps = {
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
};

function useLightweightMarketChartState(props: LightweightMarketChartProps) {
  const {
    bars,
    indicators,
    chartPoints: providedChartPoints,
    visibleRange,
    chartMode,
    visibleIndicators,
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
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartApi | null>(null);
  const seriesRef = useRef<Map<string, DataSeries>>(new Map());
  const paneWatermarksRef = useRef<Array<{ detach: () => void }>>([]);
  const viewportRef = useRef(new MarketChartViewportController());
  const viewportControlsRef = useRef({
    range: visibleRange,
    reset: resetRevision,
    focus: focusLatestRevision,
  });
  const viewActionRef = useRef(viewAction);
  viewportControlsRef.current = {
    range: visibleRange,
    reset: resetRevision,
    focus: focusLatestRevision,
  };
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
    () => indicators.filter((item) => visibleIndicators.includes(item.name)),
    [indicators, visibleIndicators],
  );
  const chartPoints = useMemo(
    () => providedChartPoints ?? buildChartPoints(bars, chartIndicators),
    [bars, chartIndicators, providedChartPoints],
  );
  return {
    containerRef,
    chartRef,
    seriesRef,
    paneWatermarksRef,
    viewportRef,
    viewportControlsRef,
    viewActionRef,
    onHoverRef,
    onClickRef,
    onVisibleRangeChangeRef,
    onLoadEarlierRef,
    onRetryEarlierRef,
    canLoadEarlierRef,
    historyLoadingRef,
    historyErrorRef,
    onLoadLaterRef,
    onRetryLaterRef,
    canLoadLaterRef,
    latestLoadingRef,
    lockedTimestampRef,
    chartModeRef,
    historyDragStateRef,
    chartReady,
    setChartReady,
    themeRevision,
    setThemeRevision,
    chartIndicators,
    chartPoints,
  };
}

function mountMarketPriceChart(
  state: ReturnType<typeof useLightweightMarketChartState>,
  updateHistoryBoundary: (chart: ChartApi, range: { from: number; to: number } | null) => void,
) {
  const {
    containerRef,
    viewportRef,
    viewActionRef,
    lockedTimestampRef,
    onHoverRef,
    onClickRef,
    onVisibleRangeChangeRef,
    historyDragStateRef,
    chartRef,
    setChartReady,
    paneWatermarksRef,
    seriesRef,
  } = state;

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
    timeScale: {
      minBarSpacing: 0.01,
      lockVisibleTimeRangeOnResize: true,
      borderColor: 'rgba(148, 163, 184, 0.35)',
      timeVisible: false,
    },
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
    const from = chartInteractionKey(range?.from),
      to = chartInteractionKey(range?.to);
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
}
