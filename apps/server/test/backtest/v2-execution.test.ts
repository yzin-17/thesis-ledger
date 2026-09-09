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
          series: ['close'],
        },
      ],
      executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'close', field: 'close' },
        right: { type: 'constant', value: '10' },
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
    const dailyRows: ArtifactRow[] = [
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
            provider: 'fixture',
            providerRevision: 'instrument-1',
            occurredAt: '2026-09-01T00:00:00Z',
            availableAt: '2026-09-01T00:00:00Z',
          },
        ],
      ],
    ]);

    const result = runExchangeVertical({
      runId: 'run-exchange',
      strategyVersionId: 'strategy-exchange',
      snapshotId: 'snapshot-exchange',
      strategy: exchangeStrategy,
      runConfig,
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef],
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
      occurredAt: '2026-09-09T01:30:00Z',
    });
  });
});
