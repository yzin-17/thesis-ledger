import { describe, expect, it } from 'vitest';
import {
  backtestErrorCodes,
  backtestErrorSchema,
  backtestRunCreateSchemaV2,
  backtestTradeSchemaV2,
  backtestResultSchemaV2,
  expressionSchemaV2,
  runConfigSchemaV2,
  strategySchemaV2,
  validateStrategyRunConfig,
} from '../src/backtest-v2.js';

const exchangeStrategy = {
  schemaVersion: '2' as const,
  name: '多源均线策略',
  signalSources: [
    {
      id: 'execution',
      asset: { symbol: '600519.SH', market: 'CN' as const, assetType: 'stock' as const },
      timeframe: '1d' as const,
      series: ['close', 'volume'] as const,
    },
    {
      id: 'benchmark',
      asset: { symbol: '000300.SH', market: 'CN' as const, assetType: 'etf' as const },
      timeframe: '1d' as const,
      series: ['close'] as const,
    },
  ],
  executionInstrument: { symbol: '600519.SH', market: 'CN' as const, assetType: 'stock' as const },
  primaryTimeframe: '1d' as const,
  entry: {
    type: 'compare' as const,
    operator: 'gt' as const,
    left: {
      type: 'indicator' as const,
      name: 'MA' as const,
      input: { type: 'series' as const, sourceId: 'execution', field: 'close' as const },
      params: { period: 5 },
    },
    right: { type: 'constant' as const, value: '10.00' },
  },
  exit: { type: 'positionState' as const, field: 'isOpen' as const },
  sizing: { type: 'fixedAmount' as const, amount: '10000' },
  risk: [{ type: 'fixedStop' as const, percent: '0.1' }],
  execution: {
    mode: 'exchange' as const,
    orderType: 'market' as const,
    timeInForce: 'DAY' as const,
    timing: 'nextEligibleBarOpen' as const,
  },
  cost: { commissionRate: '0.0003', slippageRate: '0.001' },
};

describe('StrategySchemaV2', () => {
  it('accepts multi-source exchange strategy and typed AST', () => {
    expect(strategySchemaV2.parse(exchangeStrategy)).toMatchObject({ schemaVersion: '2' });
  });

  it('accepts CN NAV Fund only through daily NavExecution', () => {
    const strategy = {
      ...exchangeStrategy,
      signalSources: [
        {
          id: 'nav',
          asset: { symbol: '110011.OF', market: 'CN' as const, assetType: 'fund' as const },
          timeframe: '1d' as const,
          series: ['nav' as const],
        },
      ],
      executionInstrument: {
        symbol: '110011.OF',
        market: 'CN' as const,
        assetType: 'fund' as const,
      },
      entry: {
        type: 'compare' as const,
        operator: 'gt' as const,
        left: { type: 'series' as const, sourceId: 'nav', field: 'nav' as const },
        right: { type: 'constant' as const, value: '1' },
      },
      execution: {
        mode: 'nav' as const,
        requestTypes: ['subscribe' as const, 'redeem' as const],
        timing: 'nextAvailableNav' as const,
      },
    };
    expect(strategySchemaV2.parse(strategy).execution.mode).toBe('nav');
  });

  it('reports source, indicator, AST type, and non-goal errors with paths', () => {
    const result = strategySchemaV2.safeParse({
      ...exchangeStrategy,
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'missing', field: 'close' },
        right: {
          type: 'indicator',
          name: 'MACD',
          input: { type: 'constant', value: '1' },
          params: {},
        },
      },
      execution: {
        mode: 'exchange',
        orderType: 'limit',
        timeInForce: 'DAY',
        timing: 'nextEligibleBarOpen',
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((item) => item.path.join('.'));
      expect(paths).toContain('entry.left.sourceId');
      expect(paths).toContain('entry.right.params.fastPeriod');
      expect(paths.some((path) => path.startsWith('execution'))).toBe(true);
    }
  });

  it('rejects HK/US NAV and invalid source fields', () => {
    const result = strategySchemaV2.safeParse({
      ...exchangeStrategy,
      executionInstrument: { symbol: 'FUND.US', market: 'US', assetType: 'fund' },
      execution: { mode: 'nav', requestTypes: ['subscribe'], timing: 'nextAvailableNav' },
      signalSources: [
        {
          id: 'fund',
          asset: { symbol: 'FUND.US', market: 'US', assetType: 'fund' },
          timeframe: '1d',
          series: ['nav'],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('limits ratio-based sizing and risk values to 1', () => {
    for (const rule of [
      { type: 'percentOfEquity', percent: '1.01' },
      { type: 'targetWeight', weight: '2' },
    ]) {
      expect(strategySchemaV2.safeParse({ ...exchangeStrategy, sizing: rule }).success).toBe(false);
    }
    for (const rule of [
      { type: 'fixedStop', percent: '1.01' },
      { type: 'fixedTakeProfit', percent: '2' },
    ]) {
      expect(strategySchemaV2.safeParse({ ...exchangeStrategy, risk: [rule] }).success).toBe(false);
    }
    expect(
      strategySchemaV2.safeParse({
        ...exchangeStrategy,
        sizing: { type: 'targetWeight', weight: '1' },
        risk: [{ type: 'fixedStop', percent: '1' }],
        cost: {
          commissionRate: '0',
          slippageRate: '0',
          minimumCommission: { amount: '0', currency: 'CNY' },
        },
      }).success,
    ).toBe(true);
    expect(
      strategySchemaV2.safeParse({
        ...exchangeStrategy,
        cost: {
          commissionRate: '0',
          slippageRate: '0',
          minimumCommission: { amount: '-0.01', currency: 'CNY' },
        },
      }).success,
    ).toBe(false);
  });
});

describe('V2 public decimal and result contracts', () => {
  it('keeps DecimalString and Money values as strings', () => {
    expect(
      runConfigSchemaV2.parse({
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        dataAsOf: '2025-12-31T00:00:00Z',
        baseCurrency: 'CNY',
        initialCash: { CNY: '100000.00' },
        valuationPolicy: {
          baseTimezone: 'Asia/Shanghai',
          dailyValuationTime: '15:00',
          pricePolicy: 'latestAvailable',
          fxPolicy: 'latestAvailable',
        },
      }).initialCash.CNY,
    ).toBe('100000.00');
  });

  it('parses structured errors and rejects numeric public money', () => {
    expect(
      backtestErrorSchema.parse({
        code: 'UNKNOWN_SOURCE',
        message: '未知来源',
        path: ['entry', 'left', 'sourceId'],
      }),
    ).toMatchObject({ code: 'UNKNOWN_SOURCE' });
    for (const code of [
      'SNAPSHOT_HASH_MISMATCH',
      'FUTURE_DATA',
      'RULE_REJECTED',
      'NAV_DELAYED',
      'UNSUPPORTED_CORPORATE_ACTION',
    ] as const) {
      expect(backtestErrorCodes).toContain(code);
      expect(backtestErrorSchema.parse({ code, message: '诊断', path: [] }).code).toBe(code);
    }
    expect(() =>
      runConfigSchemaV2.parse({
        startDate: '2025-01-01',
        endDate: '2025-01-01',
        dataAsOf: '2025-01-01T00:00:00Z',
        baseCurrency: 'CNY',
        initialCash: { CNY: 100 },
        valuationPolicy: {
          baseTimezone: 'Asia/Shanghai',
          dailyValuationTime: '15:00',
          pricePolicy: 'latestAvailable',
          fxPolicy: 'latestAvailable',
        },
      }),
    ).toThrow();
  });

  it('checks execution-currency cash after parsing separate contracts', () => {
    const parsedStrategy = strategySchemaV2.parse(exchangeStrategy);
    const parsedRunConfig = runConfigSchemaV2.parse({
      startDate: '2025-01-01',
      endDate: '2025-01-01',
      dataAsOf: '2025-01-01T00:00:00Z',
      baseCurrency: 'CNY',
      initialCash: { HKD: '100' },
      valuationPolicy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '15:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
    });
    const invalid = validateStrategyRunConfig(parsedStrategy, parsedRunConfig);
    expect(invalid).toMatchObject({
      valid: false,
      errors: [{ code: 'INSUFFICIENT_CASH', path: ['runConfig', 'initialCash', 'CNY'] }],
    });
    const valid = validateStrategyRunConfig(parsedStrategy, {
      ...parsedRunConfig,
      initialCash: { CNY: '0.01' },
    });
    expect(valid).toEqual({ valid: true, errors: [] });
  });

  it('accepts independent BacktestResult metadata and fills', () => {
    const result = backtestResultSchemaV2.parse({
      source: 'BACKTEST',
      runId: 'run-1',
      strategyVersionId: 'strategy-1',
      snapshotId: 'snapshot-1',
      engineVersion: 'v2',
      schemaVersion: '2',
      marketRuleVersion: 'rules-1',
      calendarVersion: 'calendar-1',
      aggregationVersion: 'aggregation-1',
      contentHash: 'sha256:abc',
      resultChecksum: 'sha256:def',
      completeness: 'complete',
      warnings: [],
      rejectedOrders: [],
      simulationFills: [
        {
          fillId: 'fill-1',
          orderId: 'order-1',
          executionSymbol: '600519.SH',
          side: 'buy',
          quantity: '100',
          price: '100.00',
          charges: [{ amount: '1.00', currency: 'CNY' }],
          occurredAt: '2025-01-02T07:00:00Z',
          availableAt: '2025-01-02T07:00:00Z',
          reason: 'signal',
        },
      ],
      trades: [],
      equityCurve: [
        { occurredAt: '2025-01-02T07:00:00Z', value: { amount: '10000.00', currency: 'CNY' } },
      ],
      drawdownCurve: [
        {
          occurredAt: '2025-01-02T07:00:00Z',
          equity: { amount: '10000.00', currency: 'CNY' },
          peak: { amount: '10100.00', currency: 'CNY' },
          drawdown: '-0.0099009900990099',
        },
      ],
      metrics: { totalReturn: { status: 'available', value: '0.1' } },
    });
    expect(result.simulationFills[0]?.quantity).toBe('100');
    expect(result.drawdownCurve?.[0]?.drawdown).toBe('-0.0099009900990099');
  });

  it('requires closed-trade return and fill provenance fields', () => {
    expect(
      backtestTradeSchemaV2.parse({
        source: 'BACKTEST',
        executionSymbol: '600519.SH',
        openedAt: '2025-01-02T07:00:00Z',
        closedAt: '2025-01-03T07:00:00Z',
        entryQuantity: '100',
        exitQuantity: '100',
        entryValue: { amount: '10000', currency: 'CNY' },
        exitValue: { amount: '10100', currency: 'CNY' },
        realizedPnl: { amount: '100', currency: 'CNY' },
        charges: [],
        returnRate: '0.01',
        closeReason: 'signal',
        fillIds: ['fill-1'],
      }),
    ).toMatchObject({ returnRate: '0.01', fillIds: ['fill-1'] });
  });

  it('exposes standalone AST schema', () => {
    expect(expressionSchemaV2.parse({ type: 'positionState', field: 'isOpen' })).toMatchObject({
      type: 'positionState',
    });
  });

  it('keeps V2 Run creation strict and excludes Desktop bars/strategy payloads', () => {
    const runConfig = {
      startDate: '2025-01-01',
      endDate: '2025-01-03',
      dataAsOf: '2025-01-04T00:00:00Z',
      baseCurrency: 'CNY' as const,
      initialCash: { CNY: '10000' },
      valuationPolicy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '15:00',
        pricePolicy: 'latestAvailable' as const,
        fxPolicy: 'latestAvailable' as const,
      },
    };
    expect(
      backtestRunCreateSchemaV2.parse({
        strategyVersionId: '11111111-1111-4111-8111-111111111111',
        runConfig,
        idempotencyKey: 'run-once',
      }),
    ).toMatchObject({ idempotencyKey: 'run-once' });
    expect(() =>
      backtestRunCreateSchemaV2.parse({
        strategyVersionId: '11111111-1111-4111-8111-111111111111',
        runConfig,
        idempotencyKey: 'run-once',
        bars: [],
      }),
    ).toThrow();
  });
});
