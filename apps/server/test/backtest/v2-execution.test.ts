import { describe, expect, it } from 'vitest';
import { runConfigSchemaV2, strategySchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import type { ArtifactRef, ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import { runCnNavVertical, runExchangeVertical } from '../../src/backtest/backtest-v2-execution.js';

const artifact = (key: string): ArtifactRef => ({
  artifactId: key,
  key,
  format: 'parquet',
  compression: 'zstd',
  contentHash: `${key}:hash`,
  sizeBytes: 1,
});

const frozenExecutionRules = (
  overrides: {
    version?: string;
    maxDownRatio?: string;
    status?: 'supported' | 'unavailable';
  } = {},
) =>
  JSON.stringify(
    overrides.status === 'unavailable'
      ? { status: 'unavailable', reason: '历史市场规则覆盖不完整' }
      : {
          status: 'supported',
          version: overrides.version ?? 'rules-v1',
          range: { start: '2026-01-01', end: '2026-12-31' },
          price: {
            reference: 'previousClose',
            maxUpRatio: '0.2',
            maxDownRatio: overrides.maxDownRatio ?? '0.2',
          },
          positionSettlement: { sellableAfterTradingDays: 1 },
          cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 1 },
          statutoryCharges: [{ code: 'fixture-levy', side: 'buy', rate: '0.001', minimum: null }],
        },
  );

const exchangeExecutionModel = () => ({
  schemaVersion: 'execution-model-v1' as const,
  id: 'cn-exchange-runner-test',
  version: '1',
  scope: {
    symbol: '600519.SH',
    market: 'CN' as const,
    instrumentType: 'STOCK' as const,
    currency: 'CNY' as const,
    timezone: 'Asia/Shanghai',
    range: { start: '2026-09-08', end: '2026-09-11' },
  },
  segments: [
    {
      id: 'cn-exchange-2026',
      range: { start: '2026-09-08', end: '2026-09-11' },
      source: {
        kind: 'researchPreset' as const,
        description: '受控 Server Runner 模型消费测试',
        references: ['test-fixture'],
        revision: '1',
        configuredAt: '2026-09-10T00:00:00+08:00',
      },
      assumptions: ['仅用于验证冻结模型驱动的闭合买卖'],
      fees: {
        currency: 'CNY' as const,
        rounding: { mode: 'halfUp' as const, decimalPlaces: 2 as const },
        collection: 'perFillPerCharge' as const,
        commission: {
          treatment: 'charged' as const,
          side: 'both' as const,
          basis: 'turnover' as const,
          currency: 'CNY' as const,
          rate: '0.0003',
          minimum: { kind: 'amount' as const, amount: '5' },
        },
        stampDuty: {
          treatment: 'charged' as const,
          side: 'sell' as const,
          basis: 'turnover' as const,
          currency: 'CNY' as const,
          rate: '0.0005',
          minimum: { kind: 'none' as const },
        },
        transferFee: {
          treatment: 'charged' as const,
          side: 'both' as const,
          basis: 'turnover' as const,
          currency: 'CNY' as const,
          rate: '0.00001',
          minimum: { kind: 'none' as const },
        },
        regulatoryFee: { treatment: 'includedInCommission' as const, reason: '已包含' },
        handlingFee: { treatment: 'includedInCommission' as const, reason: '已包含' },
      },
      execution: {
        mode: 'exchange' as const,
        calendarMarket: 'CN' as const,
        reserveCashAt: 'orderAccepted' as const,
        buyDebitAt: 'fill' as const,
        sellableAfterTradingDays: 1,
        saleReinvestableAfterTradingDays: 0,
        price: {
          kind: 'dailyLimit' as const,
          reference: 'previousRawClose' as const,
          maxUpRatio: '0.1',
          maxDownRatio: '0.1',
          rounding: 'halfUpToTick' as const,
          minimumDistanceTicks: 1,
          minimumPriceTicks: 1,
        },
      },
    },
  ],
});

const strategy = strategySchemaV2.parse({
  schemaVersion: '2',
  name: 'NAV sequential runtime',
  signalSources: [
    {
      id: 'nav',
      asset: { symbol: '110011.OF', market: 'CN', assetType: 'fund' },
      timeframe: '1d',
      series: ['nav'],
    },
  ],
  executionInstrument: { symbol: '110011.OF', market: 'CN', assetType: 'fund' },
  primaryTimeframe: '1d',
  entry: {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'nav', field: 'nav' },
    right: { type: 'constant', value: '1' },
  },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'fixedQuantity', quantity: '1' },
  risk: [],
  execution: { mode: 'nav', requestTypes: ['subscribe', 'redeem'], timing: 'nextAvailableNav' },
  cost: { commissionRate: '0', slippageRate: '0' },
}) as StrategySchemaV2;

const runConfig = runConfigSchemaV2.parse({
  startDate: '2026-09-08',
  endDate: '2026-09-11',
  dataAsOf: '2026-09-12T00:00:00Z',
  baseCurrency: 'CNY',
  initialCash: { CNY: '1000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '15:00',
    pricePolicy: 'latestAvailable',
    fxPolicy: 'latestAvailable',
  },
});

const navFactTuples = [
  ['2026-09-08', '10', '2026-09-08T07:00:00Z', '2026-09-09T01:00:00Z'],
  ['2026-09-09', '10', '2026-09-09T07:00:00Z', '2026-09-10T01:00:00Z'],
  ['2026-09-10', '10', '2026-09-10T07:00:00Z', '2026-09-11T01:00:00Z'],
] satisfies readonly (readonly [string, string, string, string])[];

const navRows: ArtifactRow[] = navFactTuples.map(
  ([valuationDate, nav, occurredAt, availableAt]) => ({
    symbol: '110011.OF',
    market: 'CN',
    instrumentType: 'NAV_FUND',
    valuationDate,
    nav,
    occurredAt,
    availableAt,
    provider: 'fixture',
    providerRevision: `nav-${valuationDate}`,
    freshness: 'delayed',
    quality: 'complete',
    status: 'supported',
  }),
);

describe('V2 NAV runtime integration', () => {
  it('applies a confirmed subscription before evaluating a later exit tick', () => {
    const signalRef = artifact('signal/CN-110011.OF-1d.parquet');
    const navRef = artifact('nav/CN-110011.OF-fund.parquet');
    const calendarRef = artifact('calendar/CN.parquet');
    const rows = new Map<string, readonly ArtifactRow[]>([
      [signalRef.key, navRows],
      [navRef.key, navRows],
      [
        calendarRef.key,
        [
          {
            market: 'CN',
            timezone: 'Asia/Shanghai',
            provider: 'fixture',
            providerRevision: 'calendar-1',
            availableAt: '2026-09-07T00:00:00Z',
            sessions: JSON.stringify([
              { startMinute: 570, endMinute: 690 },
              { startMinute: 780, endMinute: 900 },
            ]),
            sessionOverrides: JSON.stringify([]),
            holidays: JSON.stringify([]),
            range: JSON.stringify({ start: '2026-01-01', end: '2026-12-31' }),
          },
        ],
      ],
    ]);

    const result = runCnNavVertical({
      runId: 'run-nav',
      strategyVersionId: 'strategy-nav',
      snapshotId: 'snapshot-nav',
      strategy,
      runConfig,
      rows,
      artifacts: [signalRef, navRef, calendarRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });

    expect(result.rejects).toEqual([]);
    expect(result.fills.map((fill) => fill.side)).toEqual(['buy', 'sell']);
    expect(result.trades).toHaveLength(1);
  });
});

describe('V2 场内运行时集成', () => {
  it('使用下一交易日开盘事实完成金额仓位计算与成交', () => {
    const exchangeStrategy = strategySchemaV2.parse({
      schemaVersion: '2',
      name: '场内次日开盘回测',
      signalSources: [
        {
          id: 'close',
          asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
          timeframe: '1d',
          series: ['open', 'close'],
        },
      ],
      executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'close', field: 'close' },
        right: { type: 'series', sourceId: 'close', field: 'open' },
      },
      exit: {
        type: 'compare',
        operator: 'lt',
        left: { type: 'series', sourceId: 'close', field: 'close' },
        right: { type: 'constant', value: '0' },
      },
      sizing: { type: 'fixedAmount', amount: '1000' },
      risk: [],
      execution: {
        mode: 'exchange',
        orderType: 'market',
        timeInForce: 'DAY',
        timing: 'nextEligibleBarOpen',
      },
      cost: { commissionRate: '0', slippageRate: '0' },
    }) as StrategySchemaV2;
    const signalRef = artifact('signal/CN-600519.SH-1d.parquet');
    const executionRef = artifact('execution/CN-600519.SH-1d.parquet');
    const calendarRef = artifact('calendar/CN.parquet');
    const instrumentRef = artifact('instrumentFacts/CN-600519.SH.parquet');
    const corporateActionRef = artifact('corporateActions/CN-600519.SH.parquet');
    const dailyRows: ArtifactRow[] = [
      {
        symbol: '600519.SH',
        market: 'CN',
        timeframe: '1d',
        occurredAt: '2026-09-07T00:00:00Z',
        availableAt: '2026-09-07T07:00:00Z',
        openedAt: '2026-09-07T01:30:00Z',
        openAvailableAt: '2026-09-07T01:30:00Z',
        open: '10',
        high: '12',
        low: '9',
        close: '11',
        volume: '1000',
        provider: 'fixture',
        providerRevision: 'raw-1',
        quality: 'complete',
      },
      {
        symbol: '600519.SH',
        market: 'CN',
        timeframe: '1d',
        occurredAt: '2026-09-10T00:00:00Z',
        availableAt: '2026-09-10T07:00:00Z',
        openedAt: '2026-09-10T01:30:00Z',
        openAvailableAt: '2026-09-10T01:30:00Z',
        open: '10',
        high: '12',
        low: '9',
        close: '11',
        volume: '1000',
        provider: 'fixture',
        providerRevision: 'raw-1',
        quality: 'complete',
      },
      {
        symbol: '600519.SH',
        market: 'CN',
        timeframe: '1d',
        occurredAt: '2026-09-08T00:00:00Z',
        availableAt: '2026-09-08T07:00:00Z',
        openedAt: '2026-09-08T01:30:00Z',
        openAvailableAt: '2026-09-08T01:30:00Z',
        open: '10',
        high: '12',
        low: '9',
        close: '11',
        volume: '1000',
        provider: 'fixture',
        providerRevision: 'raw-1',
        quality: 'complete',
      },
      {
        symbol: '600519.SH',
        market: 'CN',
        timeframe: '1d',
        occurredAt: '2026-09-09T00:00:00Z',
        availableAt: '2026-09-09T07:00:00Z',
        openedAt: '2026-09-09T01:30:00Z',
        openAvailableAt: '2026-09-09T01:30:00Z',
        open: '10',
        high: '12',
        low: '9',
        close: '11',
        volume: '1000',
        provider: 'fixture',
        providerRevision: 'raw-1',
        quality: 'complete',
      },
    ];
    const rows = new Map<string, readonly ArtifactRow[]>([
      [signalRef.key, dailyRows],
      [executionRef.key, dailyRows],
      [
        calendarRef.key,
        [
          {
            market: 'CN',
            timezone: 'Asia/Shanghai',
            provider: 'fixture',
            providerRevision: 'calendar-1',
            availableAt: '2026-09-01T00:00:00Z',
            sessions: JSON.stringify([
              { startMinute: 570, endMinute: 690 },
              { startMinute: 780, endMinute: 900 },
            ]),
            sessionOverrides: JSON.stringify([]),
            holidays: JSON.stringify([]),
            range: JSON.stringify({ start: '2026-01-01', end: '2026-12-31' }),
          },
        ],
      ],
      [
        instrumentRef.key,
        [
          {
            symbol: '600519.SH',
            market: 'CN',
            instrumentType: 'STOCK',
            currency: 'CNY',
            lotSize: '100',
            tickSize: '0.01',
            tradable: true,
            executionRules: frozenExecutionRules(),
            provider: 'fixture',
            providerRevision: 'instrument-1',
            occurredAt: '2026-09-01T00:00:00Z',
            availableAt: '2026-09-01T00:00:00Z',
          },
        ],
      ],
      [
        corporateActionRef.key,
        [
          {
            symbol: '600519.SH',
            market: 'CN',
            instrumentType: 'STOCK',
            type: 'CASH_DIVIDEND',
            cashAmount: '1',
            currency: 'CNY',
            occurredAt: '2026-09-10T00:00:00Z',
            availableAt: '2026-09-07T00:00:00Z',
            provider: 'akshare',
            providerRevision: 'akshare-corporate-actions-v1',
          },
        ],
      ],
    ]);

    const exchangeRunConfig = runConfigSchemaV2.parse({
      ...runConfig,
      initialCash: { CNY: '1001' },
    });
    const result = runExchangeVertical({
      runId: 'run-exchange',
      strategyVersionId: 'strategy-exchange',
      snapshotId: 'snapshot-exchange',
      strategy: exchangeStrategy,
      runConfig: exchangeRunConfig,
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef, corporateActionRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });

    expect(result.rejects).toEqual([]);
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]).toMatchObject({
      quantity: '100',
      price: '10',
      charges: [{ amount: '1', currency: 'CNY' }],
      occurredAt: '2026-09-09T01:30:00Z',
    });

    const modelRunConfig = runConfigSchemaV2.parse({
      ...runConfig,
      initialCash: { CNY: '2000' },
      executionModel: exchangeExecutionModel(),
    });
    const modelInput = {
      runId: 'run-exchange-model',
      strategyVersionId: 'strategy-exchange-model',
      snapshotId: 'snapshot-exchange-model',
      strategy: strategySchemaV2.parse({
        ...exchangeStrategy,
        exit: { type: 'positionState', field: 'isOpen' },
      }) as StrategySchemaV2,
      runConfig: modelRunConfig,
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'model-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    };
    const modelResult = runExchangeVertical(modelInput);
    expect(modelResult.rejects).toEqual([]);
    expect(modelResult.fills.map((fill) => fill.side)).toEqual(['buy', 'sell']);
    expect(modelResult.fills[0]?.charges).toEqual([
      { amount: '5', currency: 'CNY' },
      { amount: '0.01', currency: 'CNY' },
    ]);
    expect(modelResult.fills[1]?.charges).toEqual([
      { amount: '5', currency: 'CNY' },
      { amount: '0.5', currency: 'CNY' },
      { amount: '0.01', currency: 'CNY' },
    ]);
    expect(modelResult.analytics.equityCurve.length).toBeGreaterThan(2);
    expect(modelResult.analytics.completeness).toBe('complete');
    const modelRerun = runExchangeVertical(modelInput);
    expect(modelRerun.analytics.resultChecksum).toBe(modelResult.analytics.resultChecksum);

    const instrumentRow = rows.get(instrumentRef.key)?.[0];
    expect(instrumentRow).toBeDefined();
    rows.set(instrumentRef.key, [
      {
        ...instrumentRow,
        executionRules: frozenExecutionRules({ version: 'rules-v2', maxDownRatio: '0.05' }),
      },
    ]);
    const limited = runExchangeVertical({
      runId: 'run-exchange-price-limit',
      strategyVersionId: 'strategy-exchange',
      snapshotId: 'snapshot-exchange-price-limit',
      strategy: exchangeStrategy,
      runConfig: exchangeRunConfig,
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef, corporateActionRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'rules-v2',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });
    expect(limited.rejects).toContainEqual(
      expect.objectContaining({
        code: 'RULE_REJECTED',
        inputFacts: expect.arrayContaining(['reasonCode=PRICE_LIMIT']),
      }),
    );

    rows.set(instrumentRef.key, [
      {
        ...instrumentRow,
        executionRules: frozenExecutionRules({ status: 'unavailable' }),
      },
    ]);
    expect(() =>
      runExchangeVertical({
        runId: 'run-exchange-missing-rules',
        strategyVersionId: 'strategy-exchange',
        snapshotId: 'snapshot-exchange-missing-rules',
        strategy: exchangeStrategy,
        runConfig: exchangeRunConfig,
        rows,
        artifacts: [signalRef, executionRef, calendarRef, instrumentRef, corporateActionRef],
        engineVersion: 'runner-v2',
        marketRuleVersion: 'rules-v1',
        calendarVersion: 'calendar-v1',
        aggregationVersion: 'aggregation-v1',
      }),
    ).toThrow('历史市场规则覆盖不完整');

    rows.set(instrumentRef.key, [instrumentRow!]);
    rows.set(corporateActionRef.key, [
      {
        ...(rows.get(corporateActionRef.key)?.[0] ?? {}),
        currency: 'HKD',
      },
    ]);
    const rejected = runExchangeVertical({
      runId: 'run-exchange-rejected-action',
      strategyVersionId: 'strategy-exchange',
      snapshotId: 'snapshot-exchange-rejected-action',
      strategy: exchangeStrategy,
      runConfig: exchangeRunConfig,
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef, corporateActionRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });
    expect(rejected.rejects).toContainEqual(
      expect.objectContaining({ code: 'RULE_REJECTED', reason: '现金分红币种必须与执行标的一致' }),
    );
    expect(rejected.analytics.completeness).toBe('unavailable');
  });

  it('按执行标的时钟与价格评价跨标的信号策略的风险退出', () => {
    const crossAssetStrategy = strategySchemaV2.parse({
      schemaVersion: '2',
      name: '跨标的信号风险退出',
      signalSources: [
        {
          id: 'signal-b',
          asset: { symbol: '000001.SZ', market: 'CN', assetType: 'stock' },
          timeframe: '1d',
          series: ['close'],
        },
      ],
      executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'signal-b', field: 'close' },
        right: { type: 'constant', value: '10' },
      },
      exit: {
        type: 'compare',
        operator: 'lt',
        left: { type: 'series', sourceId: 'signal-b', field: 'close' },
        right: { type: 'constant', value: '0' },
      },
      sizing: { type: 'fixedQuantity', quantity: '100' },
      risk: [{ type: 'fixedStop', percent: '0.1' }],
      execution: {
        mode: 'exchange',
        orderType: 'market',
        timeInForce: 'DAY',
        timing: 'nextEligibleBarOpen',
      },
      cost: { commissionRate: '0', slippageRate: '0' },
    }) as StrategySchemaV2;
    const signalRef = artifact('signal/CN-000001.SZ-1d.parquet');
    const executionRef = artifact('execution/CN-600519.SH-1d.parquet');
    const calendarRef = artifact('calendar/CN.parquet');
    const instrumentRef = artifact('instrumentFacts/CN-600519.SH.parquet');
    const dates = ['08', '09', '10', '11'];
    const signalRows: ArtifactRow[] = dates.map((day) => ({
      symbol: '000001.SZ',
      market: 'CN',
      timeframe: '1d',
      occurredAt: `2026-09-${day}T00:00:00Z`,
      availableAt: `2026-09-${day}T07:00:00Z`,
      open: '10',
      high: '11',
      low: '9',
      close: '11',
      volume: '1000',
      provider: 'fixture',
      providerRevision: 'signal-b-1',
      quality: 'complete',
    }));
    const executionRows: ArtifactRow[] = dates.map((day, index) => ({
      symbol: '600519.SH',
      market: 'CN',
      timeframe: '1d',
      occurredAt: `2026-09-${day}T00:00:00Z`,
      availableAt: `2026-09-${day}T07:00:00Z`,
      openedAt: `2026-09-${day}T01:30:00Z`,
      openAvailableAt: `2026-09-${day}T01:30:00Z`,
      open: index < 3 ? '100' : '80',
      high: '101',
      low: index < 2 ? '99' : '79',
      close: index < 2 ? '100' : '80',
      volume: '1000',
      provider: 'fixture',
      providerRevision: 'execution-a-1',
      quality: 'complete',
    }));
    const rows = new Map<string, readonly ArtifactRow[]>([
      [signalRef.key, signalRows],
      [executionRef.key, executionRows],
      [
        calendarRef.key,
        [
          {
            market: 'CN',
            timezone: 'Asia/Shanghai',
            provider: 'fixture',
            providerRevision: 'calendar-1',
            availableAt: '2026-09-01T00:00:00Z',
            sessions: JSON.stringify([
              { startMinute: 570, endMinute: 690 },
              { startMinute: 780, endMinute: 900 },
            ]),
            sessionOverrides: JSON.stringify([]),
            holidays: JSON.stringify([]),
            range: JSON.stringify({ start: '2026-01-01', end: '2026-12-31' }),
          },
        ],
      ],
      [
        instrumentRef.key,
        [
          {
            symbol: '600519.SH',
            market: 'CN',
            instrumentType: 'STOCK',
            currency: 'CNY',
            lotSize: '100',
            tickSize: '0.01',
            tradable: true,
            executionRules: frozenExecutionRules(),
            provider: 'fixture',
            providerRevision: 'instrument-1',
            occurredAt: '2026-09-01T00:00:00Z',
            availableAt: '2026-09-01T00:00:00Z',
          },
        ],
      ],
    ]);

    const result = runExchangeVertical({
      runId: 'run-cross-asset',
      strategyVersionId: 'strategy-cross-asset',
      snapshotId: 'snapshot-cross-asset',
      strategy: crossAssetStrategy,
      runConfig: runConfigSchemaV2.parse({
        ...runConfig,
        initialCash: { CNY: '20000' },
      }),
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });

    expect(result.rejects).toEqual([]);
    expect(result.fills.map((fill) => fill.side)).toEqual(['buy', 'sell']);
    expect(result.trades).toHaveLength(1);
  });
});
