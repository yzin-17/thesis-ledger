import { useEffect, type RefObject } from 'react';
import type { IChartApi, ISeriesApi, SeriesType, Time, AutoscaleInfo } from 'lightweight-charts';
import type { FundNavHistory } from '@thesis-ledger/schemas';
import type { ChartMeasurement } from './chart-measurement-model.js';
import { attachTradingOverlays } from './market-trading-overlay-resources.js';

export function useFundNavReferenceResources(
  chartRef: RefObject<IChartApi | null>,
  lineRef: RefObject<ISeriesApi<SeriesType, Time> | null>,
  history: FundNavHistory,
  costPrice: number | undefined,
  measurement: ChartMeasurement | undefined,
) {
  useEffect(() => {
    const chart = chartRef.current, line = lineRef.current;
    if (!chart || !line || !history.length) return;
    if (costPrice !== undefined) {
      line.applyOptions({ autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const info = original();
        if (!info?.priceRange) return info;
        return { ...info, priceRange: {
          minValue: Math.min(info.priceRange.minValue, costPrice),
          maxValue: Math.max(info.priceRange.maxValue, costPrice),
        } };
      } });
      chart.applyOptions({ rightPriceScale: { autoScale: true } });
    }
    const detach = attachTradingOverlays(chart, line, {
      markers: [],
      lines: costPrice === undefined ? [] : [{ price: costPrice, kind: 'cost', title: '持仓单位成本' }],
      measurement,
    });
    return () => {
      if (chartRef.current !== chart) return;
      detach();
      if (costPrice !== undefined) line.applyOptions({ autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => original() });
    };
  }, [chartRef, lineRef, history, costPrice, measurement]);
}
