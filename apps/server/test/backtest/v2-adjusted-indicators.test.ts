import { describe, expect, it } from 'vitest';
import { runConfigSchemaV2, strategySchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import type { ArtifactRef, ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import { runExchangeVertical } from '../../src/backtest/backtest-v2-execution.js';

const artifact = (key: string): ArtifactRef => ({
  artifactId: key,
  key,
  format: 'parquet',
  compression: 'zstd',
  contentHash: `${key}:hash`,
  sizeBytes: 1,
});

const executionRules = JSON.stringify({
  status: 'supported',
  version: 'rules-v1',
  range: { start: '2026-01-01', end: '2026-12-31' },
  price: { reference: 'previousClose', maxUpRatio: null, maxDownRatio: null },
  positionSettlement: { sellableAfterTradingDays: 0 },
  cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 0 },
  statutoryCharges: [],
});

const runScenario = (
  scenario: {
    type: 'CASH_DIVIDEND' | 'SPLIT';
    before: string;
    after: string;
    threshold: string;
  },
  actionAvailableAt: string,
) => {
  const signalRef = artifact('signal/CN-600519.SH-1d.parquet');
  const executionRef = artifact('execution/CN-600519.SH-1d.parquet');
  const calendarRef = artifact('calendar/CN.parquet');
  const instrumentRef = artifact('instrumentFacts/CN-600519.SH.parquet');
  const actionRef = artifact('corporateActions/CN-600519.SH.parquet');
  const dates = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'];
  const bars: ArtifactRow[] = dates.map((date, index) => {
    const value = index === 0 ? scenario.before : scenario.after;
    return {
      symbol: '600519.SH',
      market: 'CN',
      timeframe: '1d',
      occurredAt: `${date}T00:00:00Z`,
      availableAt: `${date}T07:00:00Z`,
      openedAt: `${date}T01:30:00Z`,
      openAvailableAt: `${date}T01:30:00Z`,
      open: value,
      high: value,
      low: value,
      close: value,
      volume: '1000',
      provider: 'fixture',
      providerRevision: 'raw-1',
      quality: 'complete',
    };
  });
  const strategy = strategySchemaV2.parse({
    schemaVersion: '2',
    name: '公司行动复权指标',
    signalSources: [
      {
        id: 'price',
        asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
        timeframe: '1d',
        series: ['close'],
      },
    ],
    executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
    primaryTimeframe: '1d',
    entry: {
      type: 'compare',
      operator: 'gt',
      left: {
        type: 'indicator',
        name: 'MA',
        input: { type: 'series', sourceId: 'price', field: 'close' },
        params: { period: 2 },
      },
      right: { type: 'constant', value: scenario.threshold },
    },
    exit: {
      type: 'compare',
      operator: 'lt',
      left: { type: 'series', sourceId: 'price', field: 'close' },
      right: { type: 'constant', value: '0' },
    },
    sizing: { type: 'fixedQuantity', quantity: '1' },
    risk: [],
    execution: {
      mode: 'exchange',
      orderType: 'market',
      timeInForce: 'DAY',
      timing: 'nextEligibleBarOpen',
    },
    cost: { commissionRate: '0', slippageRate: '0' },
  }) as StrategySchemaV2;
  const action: ArtifactRow = {
    symbol: '600519.SH',
    market: 'CN',
    instrumentType: 'STOCK',
    type: scenario.type,
    ...(scenario.type === 'CASH_DIVIDEND' ? { cashAmount: '10', currency: 'CNY' } : { ratio: '2' }),
    occurredAt: '2026-09-08T00:00:00Z',
    availableAt: actionAvailableAt,
    provider: 'fixture',
    providerRevision: 'action-1',
  };
  const rows = new Map<string, readonly ArtifactRow[]>([
    [signalRef.key, bars],
    [executionRef.key, bars],
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
          lotSize: '1',
          tickSize: '0.01',
          tradable: true,
          executionRules,
          provider: 'fixture',
          providerRevision: 'instrument-1',
          occurredAt: '2026-09-01T00:00:00Z',
          availableAt: '2026-09-01T00:00:00Z',
        },
      ],
    ],
    [actionRef.key, [action]],
  ]);
  return runExchangeVertical({
    runId: `run-${scenario.type}-${actionAvailableAt}`,
    strategyVersionId: 'strategy-adjusted-indicator',
    snapshotId: 'snapshot-adjusted-indicator',
    strategy,
    runConfig: runConfigSchemaV2.parse({
      startDate: '2026-09-08',
      endDate: '2026-09-10',
      dataAsOf: '2026-09-11T00:00:00Z',
      baseCurrency: 'CNY',
      initialCash: { CNY: '1000' },
      valuationPolicy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '15:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
    }),
    rows,
    artifacts: [signalRef, executionRef, calendarRef, instrumentRef, actionRef],
    engineVersion: 'runner-v2',
    marketRuleVersion: 'rules-v1',
    calendarVersion: 'calendar-v1',
    aggregationVersion: 'aggregation-v1',
  });
};

describe('V2 实际运行路径的 PIT 复权指标', () => {
  it.each([
    { type: 'SPLIT' as const, before: '100', after: '50', threshold: '60' },
    { type: 'CASH_DIVIDEND' as const, before: '100', after: '90', threshold: '92' },
  ])('用 $type 消除虚假价格跳变，且未来知识不改变此前信号', (scenario) => {
    const knownAtEffectiveDate = runScenario(scenario, '2026-09-08T00:00:00Z');
    expect(knownAtEffectiveDate.fills).toEqual([]);

    const learnedLater = runScenario(scenario, '2026-09-10T00:00:00Z');
    expect(learnedLater.fills.map((fill) => fill.side)).toEqual(['buy']);
    expect(learnedLater.fills[0]?.quantity).toBe('1');
  });
});
