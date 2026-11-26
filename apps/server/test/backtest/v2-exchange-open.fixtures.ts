import { runConfigSchemaV3, strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import { artifact, frozenExecutionRules, runConfig } from './v2-execution.fixtures.js';

export function exchangeOpenFixture() {
  const exchangeStrategy = strategySchema.parse({
    schemaVersion: 'strategy-definition-v1',
    name: '场内次日开盘回测',
    signalSources: [
      {
        id: 'close',
        priceCoordinate: 'run',
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
  }) as BacktestStrategy;
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
          effectiveDate: '2026-09-10',
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

  const exchangeRunConfig = runConfigSchemaV3.parse({
    ...runConfig,
    initialCash: { CNY: '1001' },
  });
  return {
    exchangeStrategy,
    signalRef,
    executionRef,
    calendarRef,
    instrumentRef,
    corporateActionRef,
    dailyRows,
    rows,
    exchangeRunConfig,
  };
}
