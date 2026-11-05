import { useEffect, type MutableRefObject } from 'react';
import { LineSeries, type IChartApi, type AutoscaleInfo } from 'lightweight-charts';
import type { Currency } from '@thesis-ledger/schemas';
import type { PnlChartPoint } from '../performance/performance-pnl-model.js';

const calendarDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const navPnlDate = (at: string) => calendarDate.format(new Date(at));

export function navPnlData(points: PnlChartPoint[]) {
  const byDate = new Map(points.map((point) => [navPnlDate(point.at), point]));
  const dated = [...byDate].sort(([a], [b]) => a.localeCompare(b));
  const segments: Array<Array<{ time: string; value: number }>> = [];
  let segment: Array<{ time: string; value: number }> = [];
  for (const [time, point] of dated) {
    if (point.value === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push({ time, value: point.value });
  }
  if (segment.length) segments.push(segment);
  return { dated, segments };
}

export function useNavPnlSeries(
  chartRef: MutableRefObject<IChartApi | null>,
  points: PnlChartPoint[] | undefined,
  currency: Currency | undefined,
) {
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({ leftPriceScale: { visible: Boolean(points), borderVisible: false } });
    if (!points || !currency) return;
    const money = new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    });
    const segments = navPnlData(points).segments;
    const lines = segments.map((segment, index) => {
      const line = chart.addSeries(LineSeries, {
        priceScaleId: 'left',
        color: '#59636e',
        lineWidth: 2,
        lineStyle: 2,
        pointMarkersVisible: segment.length === 1,
        pointMarkersRadius: 4,
        priceLineVisible: false,
        lastValueVisible: index === segments.length - 1,
        autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
          const info = original();
          if (!info?.priceRange) return info;
          return { ...info, priceRange: { minValue: Math.min(0, info.priceRange.minValue), maxValue: Math.max(0, info.priceRange.maxValue) } };
        },
        priceFormat: {
          type: 'custom',
          formatter: (value: number) => money.format(value),
          minMove: 0.01,
        },
      });
      line.setData(segment);
      return line;
    });
    lines
      .at(-1)
      ?.createPriceLine({
        price: 0,
        color: '#9ca3af',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: '',
      });
    return () => {
      if (chartRef.current === chart) lines.forEach((line) => chart.removeSeries(line));
    };
  }, [chartRef, points, currency]);
}
