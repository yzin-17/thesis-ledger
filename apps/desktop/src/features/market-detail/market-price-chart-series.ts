import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type createChart,
  createTextWatermark,
} from 'lightweight-charts';
import { indicatorComparable, indicatorValue, type ChartPoint } from './market-chart-model.js';
import { marketChartPaneLabels } from './market-chart-pane-labels.js';
import type { ChartPreference } from './market-chart-preferences.js';
import { chartTimeData, chartVisibleRange, marketChartTimeOptions } from './market-chart-time.js';
import type { MarketChartBar, MarketChartIndicator } from './market-chart-types.js';
import type { MarketChartViewportController } from './market-chart-viewport-controller.js';
import { applyMacdSeriesOrder } from './market-macd-series-order.js';
export type ChartApi = ReturnType<typeof createChart>;
export type SeriesHandle = Parameters<ChartApi['removeSeries']>[0];
export type DataSeries = SeriesHandle & {
  setData: (data: never[]) => void;
  applyOptions: (options: never) => void;
  barsInLogicalRange: (range: { from: number; to: number }) => { barsBefore: number } | null;
};
export const auxiliaryLatestValueOptions = {
  lastValueVisible: false,
  priceLineVisible: false,
} as const;
export type MarketPriceSeriesInput = {
  chartRef: { current: ChartApi | null };
  chartReady: boolean;
  chartPoints: ChartPoint[];
  viewportRef: { current: MarketChartViewportController };
  paneWatermarksRef: { current: Array<{ detach: () => void }> };
  seriesRef: { current: Map<string, DataSeries> };
  chartIndicators: MarketChartIndicator[];
  chartMode: 'candles' | 'close';
  visibleMA: ChartPreference['visibleMA'];
  showBothPanes: boolean;
  activePane: 'MACD' | 'RSI';
  rsiPeriod: ChartPreference['rsiPeriod'];
  bars: MarketChartBar[];
  viewportControlsRef: { current: Parameters<MarketChartViewportController['commit']>[3] };
  onVisibleRangeChangeRef: {
    current: ((range: { from: string; to: string } | null) => void) | undefined;
  };
  updateHistoryBoundary: (chart: ChartApi, range: { from: number; to: number } | null) => void;
};
export function updateMarketPriceSeries(input: MarketPriceSeriesInput) {
  const {
    chartRef,
    chartReady,
    chartPoints,
    viewportRef,
    paneWatermarksRef,
    seriesRef,
    chartMode,
    showBothPanes,
    activePane,
    bars,
    viewportControlsRef,
    onVisibleRangeChangeRef,
    updateHistoryBoundary,
  } = input;

  const chart = chartRef.current;
  if (!chart || !chartReady || chartPoints.length === 0) return;
  const viewportBeforeUpdate = viewportRef.current.snapshot(chart);
  paneWatermarksRef.current.forEach((watermark) => watermark.detach());
  paneWatermarksRef.current = [];
  const context = createMarketPriceSeriesContext(chart, seriesRef);
  const { cssColor, usedSeries } = context;
  chart.applyOptions(marketChartTimeOptions(chartPoints[0]?.bar));

  applyMarketPricePrimarySeries(input, context);

  const { paneIndicators } = applyMarketPriceIndicatorSeries(input, context, chart);

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

  viewportRef.current.commit(
    chart,
    chartPoints,
    JSON.stringify([bars[0]?.symbol, bars[0]?.timeframe, bars[0]?.adjustment]),
    viewportControlsRef.current,
    viewportBeforeUpdate,
  );
  onVisibleRangeChangeRef.current?.(chartVisibleRange(chart.timeScale().getVisibleRange()));
  updateHistoryBoundary(chart, chart.timeScale().getVisibleLogicalRange());
}

function createMarketPriceSeriesContext(
  chart: ChartApi,
  seriesRef: MarketPriceSeriesInput['seriesRef'],
) {
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
  const setData = (series: DataSeries, data: unknown[]) =>
    series.setData(chartTimeData(data) as never[]);
  return {
    cssColor,
    positiveColor,
    negativeColor,
    chartPrimary,
    chartWarning,
    chartMuted,
    usedSeries,
    addSeries,
    setData,
  };
}

function applyMarketPricePrimarySeries(
  input: MarketPriceSeriesInput,
  context: ReturnType<typeof createMarketPriceSeriesContext>,
) {
  const { chartMode, chartPoints } = input;
  const { addSeries, setData, positiveColor, negativeColor, chartPrimary } = context;
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
}

function applyMarketPriceIndicatorSeries(
  input: MarketPriceSeriesInput,
  context: ReturnType<typeof createMarketPriceSeriesContext>,
  chart: ChartApi,
) {
  const { chartIndicators, chartPoints, visibleMA, showBothPanes, activePane, rsiPeriod } = input;
  const {
    addSeries,
    setData,
    cssColor,
    chartPrimary,
    chartWarning,
    chartMuted,
    positiveColor,
    negativeColor,
  } = context;

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
              reference === 0 || reference === 100 ? 'rgba(0,0,0,0)' : 'rgba(100, 116, 139, 0.45)',
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
  return { paneIndicators };
}
