import { describe, expect, it } from 'vitest';
import {
  backtestChartTimezone,
  backtestEquityCsv,
  backtestRangePresets,
  buildBacktestChartModel,
  deriveDisplayDrawdown,
  nextBacktestLogicalRange,
  parseBacktestEquityPoints,
  visibleBacktestPoints,
} from '../src/features/strategy/strategy-backtest-chart.model.js';
import type { BacktestJob, BacktestJobResult } from '../src/features/strategy/strategy.types.js';

const job = (overrides: Partial<BacktestJob> = {}): BacktestJob => ({
  id: 'job-chart',
  strategyVersionId: 'version-1',
  status: 'succeeded',
  input: {
    runConfig: {
      baseCurrency: 'USD',
      executionModel: { scope: { timezone: 'Asia/Shanghai' } },
    },
  },
  ...overrides,
});

const result = (overrides: Record<string, unknown> = {}) =>
  ({
    completeness: 'complete',
    equityCurve: [],
    ...overrides,
  }) as BacktestJobResult;

const equityPoint = (index: number, value: number) => ({
  occurredAt: new Date(Date.UTC(2026, 0, 1, 1, index)).toISOString(),
  value: { amount: String(value), currency: 'USD' },
});

describe('回测权益与回撤图表模型', () => {
  it('为空序列、单点和平直序列保留真实形状', () => {
    expect(parseBacktestEquityPoints(result())).toEqual([]);
    const single = parseBacktestEquityPoints(result({ equityCurve: [equityPoint(0, 100)] }));
    expect(single).toHaveLength(1);
    expect(deriveDisplayDrawdown(single).map((point) => point.value)).toEqual([0]);

    const flat = parseBacktestEquityPoints(
      result({ equityCurve: [equityPoint(0, 100), equityPoint(1, 100), equityPoint(2, 100)] }),
    );
    expect(deriveDisplayDrawdown(flat).map((point) => point.value)).toEqual([0, 0, 0]);
  });

  it('展示派生回撤始终使用完整序列历史高点，不随可见区间重置', () => {
    const equity = parseBacktestEquityPoints(
      result({
        equityCurve: [
          equityPoint(0, 100),
          equityPoint(1, 120),
          equityPoint(2, 90),
          equityPoint(3, 100),
        ],
      }),
    );
    const drawdown = deriveDisplayDrawdown(equity);
    expect(drawdown.map((point) => Number(point.value.toFixed(4)))).toEqual([0, 0, -0.25, -0.1667]);
    expect(visibleBacktestPoints(drawdown, { from: equity[2]!.time, to: equity[3]!.time })).toEqual(
      drawdown.slice(2),
    );
  });

  it('优先采用权威回撤曲线并保留负收益与分钟级真实时间', () => {
    const model = buildBacktestChartModel(
      job(),
      result({
        equityCurve: [equityPoint(0, 100), equityPoint(1, 80)],
        drawdownCurve: [
          { occurredAt: equityPoint(0, 100).occurredAt, drawdown: '0' },
          { occurredAt: equityPoint(1, 80).occurredAt, drawdown: '-0.19' },
        ],
      }),
    );
    expect(model.drawdownSource).toBe('authoritative');
    expect(model.drawdown.map((point) => point.value)).toEqual([0, -0.19]);
    expect(model.equity[1]!.time - model.equity[0]!.time).toBe(60_000);
  });

  it('不根据日期间隔猜测缺口，只呈现服务端完整性限制', () => {
    const model = buildBacktestChartModel(
      job(),
      result({
        completeness: 'partial',
        equityCurve: [
          { occurredAt: '2026-01-01T00:00:00.000Z', value: 100 },
          { occurredAt: '2026-06-01T00:00:00.000Z', value: 105 },
        ],
      }),
    );
    expect(model.equity).toHaveLength(2);
    expect(model.limitation).toContain('缺口位置未记录');
  });

  it.each([50, 250, 5_000])('完整保留 %i 个真实点用于绘制、悬停和导出', (count) => {
    const points = Array.from({ length: count }, (_, index) =>
      equityPoint(index, 100 + (index % 7)),
    );
    const model = buildBacktestChartModel(job(), result({ equityCurve: points }));
    expect(model.equity).toHaveLength(count);
    expect(model.equity[0]!.value).toBe(100);
    expect(model.equity.at(-1)!.value).toBe(100 + ((count - 1) % 7));
  });

  it('区间快捷项只在真实跨度足够时出现', () => {
    const short = parseBacktestEquityPoints(
      result({ equityCurve: [equityPoint(0, 100), equityPoint(10, 110)] }),
    );
    expect(backtestRangePresets(short).map((preset) => preset.label)).toEqual(['全部']);
    const long = parseBacktestEquityPoints(
      result({
        equityCurve: [
          { occurredAt: '2025-01-01T00:00:00.000Z', value: 100 },
          { occurredAt: '2026-01-02T00:00:00.000Z', value: 110 },
        ],
      }),
    );
    expect(backtestRangePresets(long).map((preset) => preset.label)).toEqual([
      '近 1 月',
      '近 3 月',
      '近 1 年',
      '全部',
    ]);
  });

  it('缩放和平移共享同一逻辑范围并保持在真实点边界内', () => {
    expect(nextBacktestLogicalRange({ from: 20, to: 60 }, 100, 'zoomIn')).toEqual({
      from: 25,
      to: 55,
    });
    expect(nextBacktestLogicalRange({ from: 0, to: 40 }, 100, 'earlier')).toEqual({
      from: 0,
      to: 40,
    });
    expect(nextBacktestLogicalRange({ from: 70, to: 99 }, 100, 'later')).toEqual({
      from: 70,
      to: 99,
    });
  });

  it('导出当前筛选区间的全部匹配行并明确时区与币种', () => {
    const model = buildBacktestChartModel(
      job(),
      result({ equityCurve: [equityPoint(0, 100), equityPoint(1, 101), equityPoint(2, 102)] }),
    );
    const csv = backtestEquityCsv(model, {
      from: model.equity[1]!.time,
      to: model.equity[2]!.time,
    });
    expect(csv).toContain('时间（Asia/Shanghai）');
    expect(csv).toContain('组合权益（USD）');
    expect(csv).not.toContain(',100,,');
    expect(csv).toContain(',101,,');
    expect(csv).toContain(',102,,');
    expect(csv.trim().split('\n')).toHaveLength(3);
  });

  it('无效或缺失时区明确回退 UTC', () => {
    expect(backtestChartTimezone(job({ input: null }))).toBe('UTC');
    expect(
      backtestChartTimezone(
        job({ input: { runConfig: { executionModel: { scope: { timezone: 'invalid-zone' } } } } }),
      ),
    ).toBe('UTC');
  });
});
