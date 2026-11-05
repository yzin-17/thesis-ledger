import { describe, expect, it } from 'vitest';
import {
  pnlChartGeometry,
  portfolioPnlPoints,
} from '../src/features/performance/performance-pnl-model.js';
import type { Portfolio } from '../src/features/portfolio/portfolio.types.js';
import type { PerformancePnlPoint } from '@thesis-ledger/schemas';

const portfolio = {
  valuedAt: '2026-11-04T10:00:00Z',
  cumulativePnl: -58.9,
  realizedPnl: 0,
  unrealizedPnl: -58.9,
} as Portfolio;
const point = (at: string, value: number | null): PerformancePnlPoint => ({
  at,
  value,
  realizedPnl: 0,
  unrealizedPnl: value,
  sourceSnapshotId: at,
  reason: value === null ? 'price_unavailable' : null,
});

describe('盈亏曲线展示投影', () => {
  it('当前点使用卡片累计金额，历史缺口断开，不补零或连接跨越缺口', () => {
    const points = portfolioPnlPoints(
      [
        point('2026-11-01T08:00:00Z', 10),
        point('2026-11-02T08:00:00Z', null),
        point('2026-11-03T08:00:00Z', -20),
      ],
      portfolio,
    );
    expect(points.at(-1)).toMatchObject({ value: -58.9, current: true });
    const chart = pnlChartGeometry(points, 720);
    expect(chart.segments.map((segment) => segment.map((p) => p.index))).toEqual([[0], [2, 3]]);
    expect(chart.coordinates[1]?.y).toBeNull();
    expect(chart.zeroY).toBeGreaterThan(0);
  });
  it('零值、单点与全缺失不会生成无效坐标', () => {
    for (const value of [0, -58.9, null]) {
      const points = portfolioPnlPoints([], { ...portfolio, cumulativePnl: value });
      const chart = pnlChartGeometry(points, 320);
      expect(Number.isFinite(chart.zeroY)).toBe(true);
      expect(
        chart.coordinates.every(
          (point) => Number.isFinite(point.x) && (point.y === null || Number.isFinite(point.y)),
        ),
      ).toBe(true);
      expect(chart.segments).toHaveLength(value === null ? 0 : 1);
    }
  });
});
