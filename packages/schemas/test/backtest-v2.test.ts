import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backtestErrorCodes,
  backtestErrorSchema,
  backtestTradeSchema,
  backtestResultSchemaV3,
  expressionSchema,
  runConfigSchemaV3,
  strategySchema,
  validateStrategyRunConfig,
} from '../src/backtest-contract.js';

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

const normalizedExecutionModel = () => {
  const model = JSON.parse(
    readFileSync(
      new URL('../fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url),
      'utf8',
    ),
  );
  model.segments[0].execution.price = {
    kind: 'noDailyLimit',
    reason: '归一化价格坐标不适用真实限制',
  };
  model.segments[0].execution.normalizedExecution = {
    priceCoordinate: 'continuous-decimal',
    quantityUnits: 'continuous-normalized-decimal',
    lotSizeConstraint: 'not-applied',
    tickSizeConstraint: 'not-applied',
    dailyPriceLimit: 'not-applied',
    feeBasis: 'simulatedTurnover',
  };
  return model;
};

const createV3BacktestResult = () => {
  const snapshot = JSON.parse(
    readFileSync(
      new URL('../fixtures/backtest-snapshot-v3.manifest.json', import.meta.url),
      'utf8',
    ),
  );
  return {
    source: 'BACKTEST',
    runId: 'run-v3-benchmark',
    strategyVersionId: 'strategy-v3',
    snapshotId: 'snapshot-v3',
    engineVersion: 'engine-v3',
    schemaVersion: '3',
    snapshotVersion: 'snapshot-manifest-v3',
    marketRuleVersion: 'rules-v3',
    calendarVersion: 'calendar-v3',
    aggregationVersion: 'aggregation-v3',
    contentHash: '1'.repeat(64),
    resultChecksum: '2'.repeat(64),
    completeness: 'complete',
    executionPriceProtocol: snapshot.executionPriceProtocol,
    comparableDataFingerprint: snapshot.comparableDataFingerprint,
    actualSources: snapshot.actualSources,
    warnings: [],
    rejectedOrders: [],
    simulationFills: [],
    trades: [],
    equityCurve: [],
    metrics: { totalReturn: { status: 'available', value: '0.1' } },
  };
};

describe('BacktestStrategy', () => {
  it('accepts multi-source exchange strategy and typed AST', () => {
    expect(strategySchema.parse(exchangeStrategy)).toMatchObject({ schemaVersion: '2' });
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
    expect(strategySchema.parse(strategy).execution.mode).toBe('nav');
  });

  it('reports source, indicator, AST type, and non-goal errors with paths', () => {
    const result = strategySchema.safeParse({
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
    const result = strategySchema.safeParse({
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
      expect(strategySchema.safeParse({ ...exchangeStrategy, sizing: rule }).success).toBe(false);
    }
    for (const rule of [
      { type: 'fixedStop', percent: '1.01' },
      { type: 'fixedTakeProfit', percent: '2' },
    ]) {
      expect(strategySchema.safeParse({ ...exchangeStrategy, risk: [rule] }).success).toBe(false);
    }
    expect(
      strategySchema.safeParse({
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
      strategySchema.safeParse({
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

describe('V3 benchmark compatibility reports', () => {
  it('keeps report fingerprints distinct from the SHA-256 data fingerprint', () => {
    const result = backtestResultSchemaV3.parse({
      ...createV3BacktestResult(),
      benchmarkCompatibility: {
        status: 'compatible',
        strategyFingerprint: 'a'.repeat(16),
        benchmarkFingerprint: 'a'.repeat(16),
        missingFields: [],
        differentFields: [],
        costAssumption: {
          kind: 'proportional',
          version: 'cost-v3',
          commissionRate: '0.001',
          slippageRate: '0.002',
        },
      },
    });

    expect(result.comparableDataFingerprint).toHaveLength(64);
    expect(result.benchmarkCompatibility).toMatchObject({
      status: 'compatible',
      strategyFingerprint: 'a'.repeat(16),
      benchmarkFingerprint: 'a'.repeat(16),
      costAssumption: { kind: 'proportional', version: 'cost-v3' },
    });
    expect(
      backtestResultSchemaV3.safeParse({
        ...result,
        benchmarkCompatibility: {
          ...result.benchmarkCompatibility,
          strategyFingerprint: 'b'.repeat(64),
        },
      }).success,
    ).toBe(false);
  });

  it('requires an explicit unavailable cost assumption when V3 cost identity is missing', () => {
    const unavailable = {
      status: 'unverified',
      missingFields: ['costAssumption', 'source'],
      differentFields: [],
      costAssumption: { kind: 'unavailable' },
    } as const;
    expect(
      backtestResultSchemaV3.safeParse({
        ...createV3BacktestResult(),
        benchmarkCompatibility: unavailable,
      }).success,
    ).toBe(true);
    expect(
      backtestResultSchemaV3.safeParse({
        ...createV3BacktestResult(),
        benchmarkCompatibility: {
          ...unavailable,
          costAssumption: { kind: 'zero-cost', version: 'legacy-v2-zero-cost' },
        },
      }).success,
    ).toBe(false);
  });

  it('requires status and missing/different field lists to agree', () => {
    expect(
      backtestResultSchemaV3.safeParse({
        ...createV3BacktestResult(),
        benchmarkCompatibility: {
          status: 'compatible',
          missingFields: [],
          differentFields: ['source'],
          costAssumption: { kind: 'zero-cost', version: 'source-confirmed-v3' },
        },
      }).success,
    ).toBe(false);
    expect(
      backtestResultSchemaV3.safeParse({
        ...createV3BacktestResult(),
        benchmarkCompatibility: {
          status: 'future-status',
          missingFields: [],
          differentFields: [],
          costAssumption: { kind: 'unavailable' },
          futureField: true,
        },
      }).success,
    ).toBe(false);
  });
});

describe('V2 public decimal and result contracts', () => {
  it('keeps DecimalString and Money values as strings', () => {
    expect(
      runConfigSchemaV3.parse({
        schemaVersion: '3',
        executionPriceProtocol: {
          protocolVersion: 'execution-price-v1',
          priceBasis: {
            adjustment: 'none',
            method: 'provider-native',
            methodVersion: 'provider-reported-v1',
            basisScope: 'provider-defined',
            anchor: null,
            revision: {
              origin: 'local-observation',
              contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            },
            observedAt: '2024-01-01T00:00:00.000Z',
            quantityBasis: 'actual-units',
            volumeBasis: 'original',
            dividendMeaning: 'explicit-cash',
            dividendEvidenceRef: null,
            conversionAvailable: false,
            conversionEvidenceRef: null,
            derivation: null,
          },
          accountingBasis: 'raw-events',
          history: {
            basis: 'point-in-time',
            reconstructionEvidenceRef: 'original-bar-availability-v1',
          },
        },
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
      runConfigSchemaV3.parse({
        schemaVersion: '3',
        executionPriceProtocol: {
          protocolVersion: 'execution-price-v1',
          priceBasis: {
            adjustment: 'none',
            method: 'provider-native',
            methodVersion: 'provider-reported-v1',
            basisScope: 'provider-defined',
            anchor: null,
            revision: {
              origin: 'local-observation',
              contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            },
            observedAt: '2024-01-01T00:00:00.000Z',
            quantityBasis: 'actual-units',
            volumeBasis: 'original',
            dividendMeaning: 'explicit-cash',
            dividendEvidenceRef: null,
            conversionAvailable: false,
            conversionEvidenceRef: null,
            derivation: null,
          },
          accountingBasis: 'raw-events',
          history: {
            basis: 'point-in-time',
            reconstructionEvidenceRef: 'original-bar-availability-v1',
          },
        },
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
    const parsedStrategy = strategySchema.parse(exchangeStrategy);
    const parsedRunConfig = runConfigSchemaV3.parse({
      schemaVersion: '3',
      executionPriceProtocol: {
        protocolVersion: 'execution-price-v1',
        priceBasis: {
          adjustment: 'none',
          method: 'provider-native',
          methodVersion: 'provider-reported-v1',
          basisScope: 'provider-defined',
          anchor: null,
          revision: {
            origin: 'local-observation',
            contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
          observedAt: '2024-01-01T00:00:00.000Z',
          quantityBasis: 'actual-units',
          volumeBasis: 'original',
          dividendMeaning: 'explicit-cash',
          dividendEvidenceRef: null,
          conversionAvailable: false,
          conversionEvidenceRef: null,
          derivation: null,
        },
        accountingBasis: 'raw-events',
        history: {
          basis: 'point-in-time',
          reconstructionEvidenceRef: 'original-bar-availability-v1',
        },
      },
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

  it('accepts current BacktestResult fills and rejects the old result format', () => {
    const result = backtestResultSchemaV3.parse({
      ...createV3BacktestResult(),
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
    });
    expect(result.simulationFills[0]?.quantity).toBe('100');
    expect(result.drawdownCurve?.[0]?.drawdown).toBe('-0.0099009900990099');
    expect(backtestResultSchemaV3.safeParse({ ...result, schemaVersion: '2' }).success).toBe(false);
    expect(
      backtestResultSchemaV3.safeParse({
        ...result,
        benchmarkCompatibility: {
          status: 'compatible',
          missingFields: ['costAssumption'],
          differentFields: [],
          costAssumption: { kind: 'unavailable' },
        },
      }).success,
    ).toBe(false);
  });

  it('requires closed-trade return and fill provenance fields', () => {
    expect(
      backtestTradeSchema.parse({
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
    expect(expressionSchema.parse({ type: 'positionState', field: 'isOpen' })).toMatchObject({
      type: 'positionState',
    });
  });

  it('accepts corporate-action event dependencies in the Boolean AST', () => {
    const event = { type: 'corporateActionEvent', eventType: 'SPLIT' } as const;
    expect(expressionSchema.parse(event)).toEqual(event);
    expect(() =>
      expressionSchema.parse({ type: 'corporateActionEvent', eventType: 'DIVIDEND' }),
    ).toThrow();
    expect(strategySchema.parse({ ...exchangeStrategy, entry: event }).entry).toEqual(event);
  });

  it('V3 normalized RunConfig requires a matching frozen model and rejects V1/V2 configurations', () => {
    const normalizedProtocol = JSON.parse(
      readFileSync(
        new URL('../fixtures/execution-price.normalized-snapshot.json', import.meta.url),
        'utf8',
      ),
    );
    const legacyModel = JSON.parse(
      readFileSync(
        new URL('../fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url),
        'utf8',
      ),
    );
    const config = {
      schemaVersion: '3',
      startDate: '2024-01-02',
      endDate: '2024-03-29',
      dataAsOf: '2024-03-30T00:00:00.000Z',
      baseCurrency: 'CNY',
      initialCash: { CNY: '10000' },
      valuationPolicy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '15:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
      executionPriceProtocol: normalizedProtocol,
    };
    expect(runConfigSchemaV3.safeParse(config).success).toBe(false);
    expect(
      runConfigSchemaV3.safeParse({
        ...config,
        executionModel: normalizedExecutionModel(),
      }).success,
    ).toBe(true);
    expect(
      runConfigSchemaV3.safeParse({
        ...config,
        executionModel: legacyModel,
      }).success,
    ).toBe(false);
    expect(
      runConfigSchemaV3.safeParse({
        ...config,
        executionPriceProtocol: JSON.parse(
          readFileSync(
            new URL('../fixtures/execution-price.raw-events.json', import.meta.url),
            'utf8',
          ),
        ),
        executionModel: normalizedExecutionModel(),
      }).success,
    ).toBe(false);
    expect(
      runConfigSchemaV3.safeParse({
        startDate: '2024-01-02',
        endDate: '2024-03-29',
        dataAsOf: '2024-03-30T00:00:00.000Z',
        baseCurrency: 'CNY',
        initialCash: { CNY: '10000' },
        valuationPolicy: config.valuationPolicy,
        executionModel: legacyModel,
      }).success,
    ).toBe(false);
  });
});
