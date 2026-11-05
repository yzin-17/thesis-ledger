import type { BacktestNavRunResponseV3, BacktestRunDetailRead } from '@thesis-ledger/schemas';
import type { ChartData } from '../../platform/charts/chart-document';
type Result =
  NonNullable<BacktestRunDetailRead['result']> | NonNullable<BacktestNavRunResponseV3['result']>;
export function mobileEquityChart(
  result: Result,
  range: 'all' | 'month' | 'quarter' = 'all',
): ChartData {
  const points = result.equityCurve;
  const last = points.at(-1);
  const end = last ? Date.parse(last.occurredAt) : 0;
  let windowStart = -Infinity;
  if (range === 'month') windowStart = end - 30 * 86400000;
  else if (range === 'quarter') windowStart = end - 90 * 86400000;
  const byTime = new Map<
    number,
    { time: number; open: number; high: number; low: number; close: number }
  >();
  for (const point of points) {
    const epoch = Date.parse(point.occurredAt);
    const value = Number(point.value.amount);
    if (epoch < windowStart || !Number.isFinite(value) || !Number.isFinite(epoch)) continue;
    const time = Math.floor(epoch / 1000);
    byTime.set(time, { time, open: value, high: value, low: value, close: value });
  }
  const candles = [...byTime.values()].sort((a, b) => a.time - b.time);
  const drawdowns = new Map<number, { time: number; value: number }>();
  for (const point of result.drawdownCurve ?? []) {
    const epoch = Date.parse(point.occurredAt);
    const value = Number(point.drawdown);
    if (epoch >= windowStart && Number.isFinite(epoch) && Number.isFinite(value))
      drawdowns.set(Math.floor(epoch / 1000), { time: Math.floor(epoch / 1000), value });
  }
  return {
    candles: candles.slice(-3000),
    main: 'line',
    lines: drawdowns.size
      ? [
          {
            name: '回撤',
            pane: 1,
            values: [...drawdowns.values()].sort((a, b) => a.time - b.time).slice(-3000),
          },
        ]
      : [],
  };
}
export function mobileEquityCsv(
  result: Result,
  timezone: string,
  currency: string,
  range: 'all' | 'month' | 'quarter' = 'all',
) {
  const end = Date.parse(result.equityCurve.at(-1)?.occurredAt ?? '');
  let start = -Infinity;
  if (range === 'month') start = end - 30 * 86400000;
  else if (range === 'quarter') start = end - 90 * 86400000;
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const rows = [
    [`时间（${timezone}）`, `组合权益（${currency}）`, '现金', '持仓市值'],
    ...result.equityCurve
      .filter((p) => Date.parse(p.occurredAt) >= start)
      .map((p) => [p.occurredAt, p.value.amount, '', '']),
  ];
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\n')}`;
}
