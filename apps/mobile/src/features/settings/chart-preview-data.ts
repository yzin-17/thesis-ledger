import type { ChartData } from '../../platform/charts/chart-document';

export function exampleChartWindow(count: number): ChartData {
  const days = Array.from({ length: count }, (_, index) => 90 - count + index);
  return {
    candles: days.map((index) => ({
      time: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
      open: 10 + index * 0.1,
      high: 10.5 + index * 0.1,
      low: 9.7 + index * 0.1,
      close: 10.2 + index * 0.1,
    })),
    lines: [
      {
        name: '示例指标',
        values: days.map((index) => ({
          time: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
          value: 10 + index * 0.09,
        })),
      },
    ],
  };
}
