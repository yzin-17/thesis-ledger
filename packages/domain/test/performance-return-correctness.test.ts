import { describe, expect, it } from 'vitest';
import { rebalanceGap, ttwror, xirr } from '../src/index.js';

describe('收益修复的经济反例', () => {
  it('没有现金流边界估值时不能把100→入金100→220称为精确20%', () => {
    expect(() =>
      ttwror([
        { date: '2025-01-01', value: 100 },
        { date: '2025-01-03', value: 220, externalFlow: 100 },
      ]),
    ).toThrow('边界');
  });
  it('明确入金前后估值后得到10%，不是20%', () => {
    expect(
      ttwror([
        { date: '2025-01-01', value: 100 },
        {
          date: '2025-01-02',
          value: 200,
          externalFlow: 100,
          flowBoundary: { before: 100, after: 200 },
        },
        { date: '2025-01-03', value: 220 },
      ]),
    ).toBeCloseTo(0.1, 12);
  });
  it('零净额仍有现金流时不能绕过缺边界保护', () => {
    expect(() =>
      ttwror([
        { date: '2025-01-01', value: 100 },
        { date: '2025-01-02', value: 110, externalFlow: 0, externalFlowCount: 2 },
      ]),
    ).toThrow('边界');
  });
  it('严重亏损的有效 XIRR 必须在原365.25天口径满足残差', () => {
    const rate = xirr([
      { date: '2025-01-01', amount: -100 },
      { date: '2026-01-01', amount: 10 },
    ]);
    expect(Number.isFinite(rate)).toBe(true);
    expect(rate).toBeGreaterThan(-1);
    expect(Math.abs(-100 + 10 / (1 + rate) ** (365 / 365.25))).toBeLessThan(1e-7);
  });
  it('明确多根时不按单个 Newton 初值挑一个收益率', () => {
    const day = 365.25 * 86400000;
    const date = (n: number) => new Date(Date.UTC(2024, 0, 1) + day * n).toISOString();
    expect(() =>
      xirr([
        { date: date(0), amount: -100 },
        { date: date(1), amount: 230 },
        { date: date(2), amount: -132 },
      ]),
    ).toThrow('多个');
  });
  it('再平衡同时表达股票增加500与现金减少500', () => {
    expect(
      rebalanceGap(
        [
          { category: 'stock', marketValue: 500 },
          { category: 'cash', marketValue: 500 },
        ],
        { stock: 1 },
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'stock', amountGap: 500 }),
        expect.objectContaining({ category: 'cash', amountGap: -500 }),
      ]),
    );
  });

  it('XIRR排序合并同一时间戳，极端合法初值不改变唯一解', () => {
    const flows = [
      { date: '2026-01-01', amount: 50 },
      { date: '2025-01-01', amount: -100 },
      { date: '2026-01-01', amount: 60 },
    ];
    for (const guess of [-0.9999, 0, 1e200]) {
      const rate = xirr(flows, guess);
      expect(Math.abs(-100 + 110 / (1 + rate) ** (365 / 365.25))).toBeLessThan(1e-7);
    }
  });

  it('XIRR无效输入和有界搜索不足使用准确失败原因', () => {
    const flows = [
      { date: '2025-01-01', amount: -100 },
      { date: '2026-01-01', amount: 110 },
    ];
    expect(() => xirr(flows, -1)).toThrow('初值');
    expect(() => xirr([{ date: 'bad', amount: -100 }, flows[1]!])).toThrow('输入');
    expect(() => xirr([{ ...flows[0]!, amount: Infinity }, flows[1]!])).toThrow('输入');
    expect(() =>
      xirr([
        { date: '2025-01-01T00:00:00Z', amount: -1 },
        { date: '2025-01-01T00:00:01Z', amount: 2 },
      ]),
    ).toThrow('有界范围');
    expect(() =>
      xirr([
        { date: '2025-01-01', amount: -1 },
        { date: '2025-01-01', amount: 1 },
      ]),
    ).toThrow('不同时间');
  });

  it('再平衡合并别名、保留零目标和未持有目标，并披露守恒尾差', () => {
    const rows = rebalanceGap([{ category: '股票', marketValue: 0.05 }], {
      stock: 1 / 3,
      ETF: 1 / 3,
      fund: 1 / 3,
      cash: 0,
    });
    expect(rows.map((row) => row.category)).toEqual(['stock', 'etf', 'fund', 'cash']);
    expect(rows.reduce((total, row) => total + row.amountGap, 0)).toBeCloseTo(0, 12);
    expect(rows.some((row) => row.roundingAdjustment !== undefined)).toBe(true);
    expect(rows.find((row) => row.category === 'etf')!.currentWeight).toBe(0);
  });

  it('非法分母与不一致现金流边界不会成为零收益或建议', () => {
    expect(() => rebalanceGap([], { stock: 1 })).toThrow('分母');
    expect(() =>
      ttwror([
        { date: '2025-01-01', value: 0 },
        { date: '2025-01-02', value: 1 },
      ]),
    ).toThrow('分母');
    expect(() =>
      ttwror([
        { date: '2025-01-01', value: 100 },
        {
          date: '2025-01-02',
          value: 200,
          externalFlow: 100,
          flowBoundary: { before: 150, after: 200 },
        },
      ]),
    ).toThrow('不一致');
    expect(
      ttwror([
        { date: '2025-01-01', value: 100 },
        { date: '2025-01-02', value: 0 },
      ]),
    ).toBe(-1);
  });
});
