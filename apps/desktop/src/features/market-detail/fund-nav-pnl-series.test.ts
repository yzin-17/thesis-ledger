import { describe, expect, it } from 'vitest';
import { navPnlData } from './fund-nav-pnl-series.js';
import type { PnlChartPoint } from '../performance/performance-pnl-model.js';

const point = (at: string, value: number | null): PnlChartPoint => ({
  at,
  value,
  unrealizedPnl: value,
  realizedPnl: 0,
  current: false,
  reason: value === null ? 'price_unavailable' : null,
});
describe('净值图中的累计盈亏序列', () => {
  it('缺失时点断开曲线，不连接缺口；零盈亏保留有效值', () => {
    const result = navPnlData([
      point('2026-11-01T08:00:00Z', 0),
      point('2026-11-02T08:00:00Z', null),
      point('2026-11-03T08:00:00Z', 10),
    ]);
    expect(result.segments).toEqual([
      [{ time: '2026-11-01', value: 0 }],
      [{ time: '2026-11-03', value: 10 }],
    ]);
  });
  it('按上海日期对齐，共享日期上的当前点替换当日较早快照', () => {
    const result = navPnlData([
      point('2026-11-03T08:00:00Z', 5),
      point('2026-11-03T16:30:00Z', 10),
      point('2026-11-04T01:00:00Z', 12),
    ]);
    expect(result.segments).toEqual([
      [
        { time: '2026-11-03', value: 5 },
        { time: '2026-11-04', value: 12 },
      ],
    ]);
  });
});
