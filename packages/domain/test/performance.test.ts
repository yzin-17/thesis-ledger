import { describe, expect, it } from 'vitest';
import {
  allocation,
  normalizeAllocationCategory,
  normalizeAllocationTargets,
  ttwror,
  xirr,
  rebalanceGap,
  quantStatsAnalytics,
} from '../src/index.js';

describe('收益与配置', () => {
  it('计算 TTWROR', () =>
    expect(
      ttwror([
        { date: '2025-01-01', value: 100 },
        { date: '2025-01-02', value: 110 },
        { date: '2025-01-03', value: 130, externalFlow: 20 },
      ]),
    ).toBeCloseTo(0.1));
  it('计算 XIRR', () =>
    expect(
      xirr([
        { date: '2024-01-01', amount: -100 },
        { date: '2025-01-01', amount: 110 },
      ]),
    ).toBeCloseTo(0.1, 3));
  it('按分类配置', () =>
    expect(
      allocation([
        { category: '股票', marketValue: 60 },
        { category: '现金', marketValue: 40 },
      ]),
    ).toEqual([
      { category: '股票', value: 60, weight: 0.6 },
      { category: '现金', value: 40, weight: 0.4 },
    ]));
  it('计算再平衡差额并校验目标权重', () => {
    expect(
      rebalanceGap(
        [
          { category: '股票', marketValue: 70 },
          { category: '现金', marketValue: 30 },
        ],
        { 股票: 0.6, 现金: 0.4 },
      ),
    ).toMatchObject([
      { category: '股票', amountGap: -10, direction: 'decrease' },
      { category: '现金', amountGap: 10, direction: 'increase' },
    ]);
    expect(() => rebalanceGap([], { 股票: 0.8 })).toThrow('100%');
  });
  it('规范化配置类别并允许无持仓指数目标', () => {
    expect(normalizeAllocationCategory(' ETF ')).toBe('etf');
    expect(normalizeAllocationCategory('现金')).toBe('cash');
    expect(normalizeAllocationCategory('legacy')).toBeNull();
    expect(
      rebalanceGap([{ category: 'stock', marketValue: 100 }], { stock: 0.6, index: 0.4 }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'index', currentWeight: 0, targetWeight: 0.4 }),
      ]),
    );
  });
  it('规范化目标时保留零权重分类并合并别名', () => {
    expect(normalizeAllocationTargets({ 股票: 0, stock: 0, ETF: 1 })).toEqual({
      targets: { stock: 0, etf: 1 },
      unknown: [],
    });
  });
});

describe('QuantStats period analytics', () => {
  it('从固定收益序列生成可复现的结构化指标', () => {
    expect(quantStatsAnalytics([0.01, -0.005, 0.02])).toMatchObject({
      sharpe: expect.any(Number),
      sortino: expect.any(Number),
      calmar: expect.any(Number),
    });
  });
});
