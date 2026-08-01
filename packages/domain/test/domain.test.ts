import { describe, expect, it } from 'vitest';
import {
  allocation,
  behaviorMetrics,
  normalizeSymbol,
  projectAverageCost,
  projectFifo,
  simulateAStockExecution,
  ttwror,
  xirr,
  evaluateV01Rule,
  evaluateCompleteRule,
  checkPointInTime,
  compareBenchmark,
  parameterGrid,
  periodMetrics,
  splitSample,
  tradeMetrics,
  walkForwardWindows,
  counterfactualStop,
  detectBehavior,
  extractShadowStrategy,
  rebalanceGap,
  concentratedExposure,
  crossed,
  currentDrawdown,
  pearsonCorrelation,
  ratioThreshold,
  trailingStopTriggered,
  holdingPeriodMetrics,
  plannedVsActual,
  positionDeviation,
  tradingActivityMetrics,
  type LedgerEvent,
  projectCashBalance,
  checkUniverseCompleteness,
  runBacktest,
  quantStatsAnalytics,
  plannedVsActualStop,
  counterfactualReplay,
  reviewWindow,
} from '../src/index.js';

describe('证券代码标准化', () => {
  it.each([
    ['600519', '600519.SH', 'stock'],
    ['SZ000001', '000001.SZ', 'stock'],
    ['510300.SH', '510300.SH', 'etf'],
    ['159919', '159919.SZ', 'etf'],
    ['830799', '830799.BJ', 'stock'],
  ])('%s → %s', (input, symbol, assetType) =>
    expect(normalizeSymbol(input)).toMatchObject({ symbol, assetType }),
  );
  it.each(['123', 'ABCDEF', '700000', '600519.HK'])('拒绝非法代码 %s', (input) =>
    expect(() => normalizeSymbol(input)).toThrow(),
  );
});

const trades: LedgerEvent[] = [
  {
    id: '1',
    accountId: 'a',
    type: 'BUY',
    symbol: '600519.SH',
    quantity: 100,
    price: 10,
    fee: 5,
    occurredAt: '2025-01-01T00:00:00Z',
  },
  {
    id: '2',
    accountId: 'a',
    type: 'BUY',
    symbol: '600519.SH',
    quantity: 100,
    price: 20,
    fee: 5,
    occurredAt: '2025-01-02T00:00:00Z',
  },
  {
    id: '3',
    accountId: 'a',
    type: 'SELL',
    symbol: '600519.SH',
    quantity: 100,
    price: 30,
    fee: 5,
    tax: 3,
    occurredAt: '2025-01-03T00:00:00Z',
  },
];

describe('Ledger 投影', () => {
  it('AVG 成本和已实现收益可重建', () =>
    expect(projectAverageCost(trades)[0]).toEqual({
      accountId: 'a',
      symbol: '600519.SH',
      quantity: 100,
      averageCost: 15.05,
      realizedPnl: 1487,
    }));
  it('FIFO 成本和已实现收益可重建', () =>
    expect(projectFifo(trades)[0]).toEqual({
      accountId: 'a',
      symbol: '600519.SH',
      quantity: 100,
      averageCost: 20.05,
      realizedPnl: 1987,
    }));
  it('拒绝超卖', () =>
    expect(() => projectAverageCost([{ ...trades[0]!, type: 'SELL' }])).toThrow('超过持仓'));
  it('公司行动保持总成本并调整数量', () => {
    const actions: LedgerEvent[] = [
      trades[0]!,
      {
        ...trades[0]!,
        id: 'bonus',
        type: 'BONUS',
        quantity: 10,
        occurredAt: '2025-01-02T00:00:00Z',
      },
      {
        ...trades[0]!,
        id: 'split',
        type: 'SPLIT',
        quantity: 2,
        occurredAt: '2025-01-03T00:00:00Z',
      },
      {
        ...trades[0]!,
        id: 'merge',
        type: 'MERGE',
        quantity: 2,
        occurredAt: '2025-01-04T00:00:00Z',
      },
    ];
    expect(projectAverageCost(actions)[0]).toMatchObject({
      quantity: 110,
      averageCost: 9.1364,
    });
    expect(projectFifo(actions)[0]).toMatchObject({ quantity: 110, averageCost: 9.1364 });
  });
  it('开仓与回滚通过受控 Adjustment 重建持仓', () => {
    const events: LedgerEvent[] = [
      {
        id: 'opening',
        accountId: 'a',
        type: 'ADJUSTMENT',
        symbol: '600519.SH',
        quantity: 100,
        price: 12,
        correctionOf: 'draft',
        occurredAt: '2025-01-01T00:00:00Z',
        metadata: { kind: 'opening-balance', quantity: 100, costPrice: 12 },
      },
      {
        id: 'rollback',
        accountId: 'a',
        type: 'ADJUSTMENT',
        symbol: '600519.SH',
        quantity: 80,
        price: 10,
        correctionOf: 'opening',
        occurredAt: '2025-01-02T00:00:00Z',
        metadata: { kind: 'rollback', quantity: 80, costPrice: 10 },
      },
    ];
    expect(projectAverageCost(events)[0]).toMatchObject({ quantity: 80, averageCost: 10 });
    expect(projectFifo(events)[0]).toMatchObject({ quantity: 80, averageCost: 10 });
  });
  it('从 Ledger 重建现金余额并区分买卖费用', () =>
    expect(
      projectCashBalance([
        {
          id: 'deposit',
          accountId: 'a',
          type: 'CASH_DEPOSIT',
          amount: 1000,
          occurredAt: '2025-01-01T00:00:00Z',
        },
        { ...trades[0]!, accountId: 'a' },
        { ...trades[2]!, accountId: 'a' },
      ]).get('a'),
    ).toBe(2987));
});

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
});

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

describe('QuantStats period analytics', () => {
  it('从固定收益序列生成可复现的结构化指标', () => {
    expect(quantStatsAnalytics([0.01, -0.005, 0.02])).toMatchObject({
      sharpe: expect.any(Number),
      sortino: expect.any(Number),
      calmar: expect.any(Number),
    });
  });
});

describe('复盘与反事实', () => {
  const trade = {
    symbol: '600519.SH',
    entryAt: '2025-01-01',
    exitAt: '2025-01-05',
    pnl: -20,
    entryPrice: 10,
    actualExit: 9,
    plannedStop: 9.5,
  };
  it('识别计划止损触发与延迟执行', () =>
    expect(
      plannedVsActualStop(
        {
          triggeredAt: '2025-01-02',
          plannedStop: 9.5,
          actualExitAt: '2025-01-05',
          actualExitPrice: 9,
        },
        -20,
      ),
    ).toMatchObject({ executed: true, delayDays: 3, plannedStop: 9.5 }));
  it('反事实结果保留假设并与真实收益分开', () =>
    expect(
      counterfactualReplay({ trades: [trade], enforceStop: true, stopPrice: 9.5 }),
    ).toMatchObject({
      actualPnl: -20,
      counterfactualPnl: -0.5,
      assumptions: { enforceStop: true },
    }));
  it('周期复盘只包含窗口内交易', () =>
    expect(reviewWindow({ trades: [trade], start: '2025-01-01', end: '2025-01-04' })).toMatchObject(
      {
        tradeCount: 0,
        start: '2025-01-01',
      },
    ));
});

describe('行为指标', () => {
  it('计算胜率、盈亏比、持有期和未执行止损', () =>
    expect(
      behaviorMetrics([
        {
          symbol: 'A',
          entryAt: '2025-01-01',
          exitAt: '2025-01-11',
          pnl: 20,
          plannedStop: 9,
          actualExit: 8,
        },
        { symbol: 'B', entryAt: '2025-01-01', exitAt: '2025-01-06', pnl: -10 },
      ]),
    ).toEqual({ winRate: 0.5, profitLossRatio: 2, averageHoldingDays: 7.5, missedStops: 1 }));
});

describe('V0.1 风险规则', () => {
  const rule = {
    id: 'r1',
    version: 1,
    scope: 'security' as const,
    severity: 'warning' as const,
    enabled: true,
    threshold: 9,
  };
  it('固定价止损只在严格低于阈值时触发', () => {
    expect(
      evaluateV01Rule({ ...rule, kind: 'fixed-stop' }, { symbol: 'x', price: 8, marketTime: 't' })
        ?.triggered,
    ).toBe(true);
    expect(
      evaluateV01Rule({ ...rule, kind: 'fixed-stop' }, { symbol: 'x', price: 9, marketTime: 't' })
        ?.triggered,
    ).toBe(false);
  });
  it('成本百分比止损由确定性代码计算', () =>
    expect(
      evaluateV01Rule(
        { ...rule, kind: 'cost-stop', threshold: 0.08 },
        { symbol: 'x', price: 91, costPrice: 100, marketTime: 't' },
      )?.triggered,
    ).toBe(true));
  it('成本为零时不误触发', () =>
    expect(
      evaluateV01Rule(
        { ...rule, kind: 'cost-stop' },
        { symbol: 'x', price: 1, costPrice: 0, marketTime: 't' },
      ),
    ).toBeNull());
  it('集中度使用同一快照权重', () =>
    expect(
      evaluateV01Rule(
        { ...rule, kind: 'position-concentration', threshold: 0.2 },
        { symbol: 'x', weight: 0.3, marketTime: 't' },
      )?.triggered,
    ).toBe(true));
});

describe('完整风险计算', () => {
  const rule = {
    id: 'rule',
    version: 1,
    scope: 'security' as const,
    severity: 'warning' as const,
    threshold: 0.1,
    enabled: true,
  };
  const context = { symbol: '600519.SH', marketTime: '2025-01-01T01:00:00Z' };
  it('移动止损和回撤使用明确峰值', () => {
    expect(trailingStopTriggered(105, 120, 0.1)).toMatchObject({ triggered: true });
    expect(currentDrawdown([100, 120, 110, 105])).toBeCloseTo(-0.125);
  });
  it('识别 MA/MACD 上下穿边界', () => {
    expect(crossed(9, 10, 11, 10, 'above')).toBe(true);
    expect(crossed(11, 10, 9, 10, 'below')).toBe(true);
    expect(crossed(11, 10, 12, 10, 'below')).toBe(false);
  });
  it('数据不足时波动和量能比例不可用', () => {
    expect(ratioThreshold(5, 0, 2)).toBeNull();
    expect(ratioThreshold(5, 2, 2)).toEqual({ ratio: 2.5, triggered: true });
  });
  it('行业与资产类型集中度暴露覆盖率', () =>
    expect(
      concentratedExposure(
        [{ key: '消费', weight: 0.6 }, { key: '消费', weight: 0.1 }, { weight: 0.3 }],
        0.5,
      ),
    ).toMatchObject({
      coverage: 0.7,
      missingCount: 1,
      exposures: [{ key: '消费', triggered: true }],
    }));
  it('计算组合收益相关性并拒绝历史不足', () => {
    expect(pearsonCorrelation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearsonCorrelation([1], [1])).toBeNull();
  });
  it('回归移动止损、组合回撤与数据不足', () => {
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'trailing-stop' },
        { ...context, price: 105, holdingPeak: 120 },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'drawdown' },
        { ...context, portfolioValues: [100, 120, 105] },
      )?.triggered,
    ).toBe(true);
    expect(evaluateCompleteRule({ ...rule, kind: 'drawdown' }, context)).toBeNull();
  });
  it('回归 MA、RSI 和 MACD 交叉规则', () => {
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'ma', parameters: { direction: 'above' } },
        { ...context, price: 11, indicators: { ma: 10, previousPrice: 9, previousMa: 10 } },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'rsi', threshold: 70, parameters: { direction: 'above' } },
        { ...context, indicators: { rsi: 71 } },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'macd', parameters: { direction: 'below' } },
        { ...context, indicators: { dif: -1, dea: 0, previousDif: 1, previousDea: 0 } },
      )?.triggered,
    ).toBe(true);
  });
  it('回归 ATR 与成交量异常并拒绝缺失分母', () => {
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'atr', threshold: 0.05 },
        { ...context, price: 100, indicators: { atr: 6 } },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'volume', threshold: 2 },
        { ...context, indicators: { volume: 500, averageVolume: 100 } },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'volume' },
        { ...context, indicators: { volume: 500, averageVolume: 0 } },
      ),
    ).toBeNull();
  });
  it('回归筹码峰、比例时间一致性与峰值迁移', () => {
    const chip = {
      mainPeak: 100,
      profitRatio: 0.8,
      concentration: 0.7,
      previousMainPeaks: [110],
      engineVersion: 'v1',
      calculatedAt: context.marketTime,
    };
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'chip-peak', threshold: 0.05 },
        { ...context, price: 90, chip },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule({ ...rule, kind: 'chip-ratio', threshold: 0.75 }, { ...context, chip })
        ?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'chip-ratio' },
        { ...context, chip: { ...chip, calculatedAt: '2025-01-02T01:00:00Z' } },
      ),
    ).toBeNull();
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'chip-migration', threshold: 0.05 },
        { ...context, chip },
      )?.triggered,
    ).toBe(true);
  });
  it('回归组合集中度、高波动暴露和相关性', () => {
    const positions = [
      { symbol: 'A', weight: 0.6, sector: '消费', assetType: 'stock', volatility: 0.4 },
      { symbol: 'B', weight: 0.2, sector: '消费', assetType: 'stock', volatility: 0.1 },
      { symbol: 'C', weight: 0.2 },
    ];
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'sector-concentration', threshold: 0.7 },
        { ...context, positions },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'asset-concentration', threshold: 0.7 },
        { ...context, positions },
      )?.context.inputs.coverage,
    ).toBeCloseTo(0.8);
    expect(
      evaluateCompleteRule(
        {
          ...rule,
          kind: 'volatility-exposure',
          threshold: 0.5,
          parameters: { assetThreshold: 0.3 },
        },
        { ...context, positions },
      )?.triggered,
    ).toBe(true);
    expect(
      evaluateCompleteRule(
        { ...rule, kind: 'correlation', threshold: 0.9 },
        { ...context, returns: { A: [1, 2, 3], B: [2, 4, 6], C: [3, 2, 1] } },
      )?.triggered,
    ).toBe(true);
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

describe('行为分析与反事实', () => {
  const trade = {
    symbol: 'A',
    entryAt: '2025-01-01',
    exitAt: '2025-01-10',
    pnl: -10,
    plannedStop: 9,
    actualExit: 8,
  };
  it('行为标签保存证据', () =>
    expect(detectBehavior(trade, { recentTradeCount: 12, entryGapRatio: 0.06 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'missed-stop', detected: true }),
        expect.objectContaining({ label: 'overtrading', detected: true }),
        expect.objectContaining({ label: 'chasing', detected: true }),
      ]),
    ));
  it('数据不足时不强行判断', () =>
    expect(detectBehavior({ ...trade, plannedStop: undefined }, {})[0]).toMatchObject({
      detected: null,
      reason: 'insufficient data',
    }));
  it('Shadow 只生成研究候选', () =>
    expect(extractShadowStrategy([trade]).kind).toBe('research-candidate'));
  it('反事实区分实际与假设收益', () =>
    expect(counterfactualStop(trade, -10, -5)).toMatchObject({
      actualPnl: -10,
      counterfactualPnl: -5,
      difference: 5,
    }));
  it('比较计划与实际价格、周期和仓位偏差', () => {
    const plannedTrade = {
      symbol: 'A',
      entryAt: '2025-01-01',
      exitAt: '2025-01-11',
      pnl: 10,
      plannedEntry: 10,
      entryPrice: 11,
      plannedExit: 15,
      exitPrice: 14,
      plannedHoldingDays: 8,
      targetWeight: 0.1,
      peakWeight: 0.25,
      turnover: 1000,
    };
    expect(plannedVsActual(plannedTrade)).toMatchObject({
      entryDeviation: 1,
      entryDeviationRatio: 0.1,
      exitDeviation: -1,
      holdingDayDeviation: 2,
    });
    expect(positionDeviation(plannedTrade)).toMatchObject({ deviation: 0.15, exceeded: true });
    expect(tradingActivityMetrics([plannedTrade])).toMatchObject({
      tradeCount: 1,
      turnover: 1000,
    });
  });
  it('计算平均与中位持仓周期', () =>
    expect(
      holdingPeriodMetrics([
        { symbol: 'A', entryAt: '2025-01-01', exitAt: '2025-01-03', pnl: 1 },
        { symbol: 'B', entryAt: '2025-01-01', exitAt: '2025-01-07', pnl: -1 },
      ]),
    ).toEqual({ average: 4, median: 4 }));
  it('过早止盈、追涨、锚定和处置效应均保存证据', () => {
    const evidence = detectBehavior(
      {
        symbol: 'A',
        entryAt: '2025-01-01',
        exitAt: '2025-01-02',
        pnl: 1,
        plannedExit: 15,
        actualExit: 12,
      },
      {
        entryGapRatio: 0.06,
        recentTradeCount: 11,
        anchoredPrice: 12,
        referencePrice: 10,
        winnerHoldingDays: 2,
        loserHoldingDays: 8,
      },
    );
    expect(evidence.filter((item) => item.detected).map((item) => item.label)).toEqual([
      'early-profit',
      'overtrading',
      'chasing',
      'anchoring',
      'disposition-effect',
    ]);
    expect(
      evidence
        .filter((item) => item.detected)
        .every((item) => Object.keys(item.evidence).length > 0),
    ).toBe(true);
  });
});
