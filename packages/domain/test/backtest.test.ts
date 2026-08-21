import { describe, expect, it } from 'vitest';
import {
  simulateAStockExecution,
  checkPointInTime,
  compareBenchmark,
  parameterGrid,
  periodMetrics,
  splitSample,
  tradeMetrics,
  walkForwardWindows,
  checkUniverseCompleteness,
  runBacktest,
} from '../src/index.js';

describe('A 股执行约束', () => {
  const constraint = {
    tPlusOne: true,
    lotSize: 100,
    commissionRate: 0.0003,
    minimumCommission: 5,
    stampDutyRate: 0.0005,
    slippageRate: 0.001,
  };
  it('拒绝当日卖出', () =>
    expect(
      simulateAStockExecution(
        {
          side: 'sell',
          quantity: 100,
          price: 10,
          previousClose: 10,
          boughtAt: '2025-01-01',
          tradingDate: '2025-01-01',
        },
        constraint,
      ),
    ).toMatchObject({ accepted: false, reason: 'T+1 限制' }));
  it('拒绝停牌', () =>
    expect(
      simulateAStockExecution(
        {
          side: 'buy',
          quantity: 100,
          price: 10,
          previousClose: 10,
          tradingDate: '2025-01-01',
          suspended: true,
        },
        constraint,
      ),
    ).toMatchObject({ accepted: false, reason: '停牌' }));
  it('向下取整最小交易单位并计费', () =>
    expect(
      simulateAStockExecution(
        { side: 'buy', quantity: 250, price: 10, previousClose: 10, tradingDate: '2025-01-01' },
        constraint,
      ),
    ).toMatchObject({ accepted: true, quantity: 200, fees: 5 }));
  it('拆分费用明细并保留滑点成本', () =>
    expect(
      simulateAStockExecution(
        { side: 'sell', quantity: 100, price: 10, previousClose: 10, tradingDate: '2025-01-02' },
        constraint,
      ),
    ).toMatchObject({
      commission: 5,
      stampDuty: expect.any(Number),
      slippageCost: expect.any(Number),
    }));
});

describe('Backtest Engine', () => {
  const strategy = {
    universe: { symbols: ['600519.SH'], asOf: '2025-01-01T00:00:00Z' },
    entrySignals: [{ indicator: 'close', operator: 'gt', value: 9 }],
    exitSignals: [{ indicator: 'close', operator: 'lt', value: 9 }],
    stopLoss: { type: 'fixed' as const, value: 0.1 },
    sizing: { type: 'weight' as const, value: 0.5 },
    execution: { price: 'close' as const, tPlusOne: true, lotSize: 100 },
    cost: { commissionRate: 0.0003, minimumCommission: 5, stampDutyRate: 0.0005, slippageRate: 0 },
    benchmark: '000300.SH',
  };
  it('执行信号、止损、成本并保存数据限制', () => {
    const result = runBacktest({
      strategy,
      start: '2025-01-01',
      end: '2025-01-02',
      dataAsOf: '2025-01-03T00:00:00Z',
      initialCash: 10_000,
      bars: [
        {
          symbol: '600519.SH',
          date: '2025-01-01',
          open: 10,
          high: 10,
          low: 10,
          close: 10,
          previousClose: 10,
        },
        {
          symbol: '600519.SH',
          date: '2025-01-02',
          open: 9,
          high: 9,
          low: 9,
          close: 9,
          previousClose: 10,
        },
      ],
      inSampleEnd: '2025-01-01',
    });
    expect(result.trades.map((trade) => trade.reason)).toEqual(['signal', 'stop']);
    expect(result.metrics.tradeCount).toBe(1);
    expect(result.limitations).toContain('survivorship_coverage_unknown');
    expect(result.inSample).toBeDefined();
    expect(result.outOfSample).toBeDefined();
    expect(result.analytics).toHaveProperty('sharpe');
    expect(result.metadata.costModel).toEqual(strategy.cost);
  });
  it('PIT 和 Universe Completeness 不静默使用未来/缺失数据', () => {
    expect(checkUniverseCompleteness([], ['600519.SH'], '2025-01-01', '2025-01-02')).toEqual({
      complete: false,
      missingSymbols: ['600519.SH'],
      missingDates: [],
    });
    const result = runBacktest({
      strategy,
      start: '2025-01-01',
      end: '2025-01-02',
      dataAsOf: '2025-01-01T00:00:00Z',
      initialCash: 1000,
      bars: [
        {
          symbol: '600519.SH',
          date: '2025-01-02',
          open: 10,
          high: 10,
          low: 10,
          close: 10,
          availableAt: '2025-01-03T00:00:00Z',
        },
      ],
    });
    expect(result.trades).toHaveLength(0);
    expect(result.warnings[0]).toContain('Universe 缺少');
  });
  it('记录公司行动、仓位约束、拒单和基准超额收益', () => {
    const result = runBacktest({
      strategy: {
        ...strategy,
        riskConstraints: [{ kind: 'maxPositionWeight', threshold: 0.1 }],
      },
      start: '2025-01-01',
      end: '2025-01-03',
      dataAsOf: '2025-01-04T00:00:00Z',
      initialCash: 10_000,
      bars: [
        {
          symbol: '600519.SH',
          date: '2025-01-01',
          open: 10,
          high: 10,
          low: 10,
          close: 10,
          previousClose: 10,
        },
        {
          symbol: '600519.SH',
          date: '2025-01-02',
          open: 10,
          high: 11,
          low: 10,
          close: 11,
          previousClose: 10,
          dividend: 1,
          splitFactor: 2,
        },
        {
          symbol: '600519.SH',
          date: '2025-01-03',
          open: 11,
          high: 11,
          low: 11,
          close: 11,
          previousClose: 11,
        },
      ],
      benchmarkBars: [
        { symbol: '000300.SH', date: '2025-01-01', open: 10, high: 10, low: 10, close: 10 },
        { symbol: '000300.SH', date: '2025-01-02', open: 10, high: 10, low: 10, close: 10.5 },
        { symbol: '000300.SH', date: '2025-01-03', open: 10.5, high: 10.5, low: 10.5, close: 10.5 },
      ],
    });
    expect(result.rejectedOrders[0]?.reason).toContain('仓位');
    expect(result.benchmark).toBeDefined();
    expect(result.completeness.complete).toBe(true);
  });
});

describe('回测分析', () => {
  it('严格切分样本内外', () =>
    expect(splitSample([{ date: '2025-01-01' }, { date: '2025-02-01' }], '2025-01-15')).toEqual({
      inSample: [{ date: '2025-01-01' }],
      outOfSample: [{ date: '2025-02-01' }],
    }));
  it('生成 Walk Forward 窗口', () =>
    expect(walkForwardWindows(['1', '2', '3', '4', '5'], 3, 1)).toHaveLength(2));
  it('生成参数笛卡尔积', () =>
    expect(parameterGrid({ fast: [5, 10], slow: [20, 30] })).toHaveLength(4));
  it('计算 period 指标', () =>
    expect(periodMetrics([0.1, -0.05]).cumulativeReturn).toBeCloseTo(0.045));
  it('区分逐笔胜率和 period 指标', () =>
    expect(
      tradeMetrics([
        { pnl: 2, holdingDays: 2, turnover: 1 },
        { pnl: -1, holdingDays: 4, turnover: 2 },
      ]),
    ).toEqual({
      tradeCount: 2,
      tradeWinRate: 0.5,
      profitLossRatio: 2,
      averageHoldingDays: 3,
      turnover: 3,
    }));
  it('比较基准超额收益', () =>
    expect(compareBenchmark([0.1], [0.05]).excessReturn).toBeCloseTo(0.05));
  it('拒绝使用决策时点之后的数据', () =>
    expect(checkPointInTime([{ availableAt: '2025-02-01' }], '2025-01-01')).toBe(false));
});
