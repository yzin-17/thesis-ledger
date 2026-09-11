import { tradingCalendarFromFact, type SimulationLedgerState } from '@thesis-ledger/domain';
import { runConfigSchemaV2, strategySchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import type { ArtifactRef, ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import {
  annualizationFactorFromValuations,
  buildDailyValuationTicks,
  buildBacktestEquityPoint,
} from '../../src/backtest/backtest-equity-curve.js';
import { runExchangeVertical } from '../../src/backtest/backtest-v2-execution.js';

const artifact = (key: string): ArtifactRef => ({
  artifactId: key,
  key,
  format: 'parquet',
  compression: 'zstd',
  contentHash: `${key}:hash`,
  sizeBytes: 1,
});

const bar = (date: string, open: string, close: string): ArtifactRow => ({
  symbol: '600000.SH',
  market: 'CN',
  timeframe: '1d',
  occurredAt: `${date}T00:00:00Z`,
  availableAt: `${date}T07:00:00Z`,
  openedAt: `${date}T01:30:00Z`,
  openAvailableAt: `${date}T01:30:00Z`,
  open,
  high: open,
  low: close,
  close,
  volume: '1000',
  provider: 'fixture',
  providerRevision: `bar-${date}`,
  quality: 'complete',
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

describe('实际 Exchange Runner 权益序列', () => {
  it('逐评价时点使用可用收盘价估值并保留中途回撤', () => {
    const signalRef = artifact('signal/CN-600000.SH-1d.parquet');
    const executionRef = artifact('execution/CN-600000.SH-1d.parquet');
    const calendarRef = artifact('calendar/CN.parquet');
    const instrumentRef = artifact('instrumentFacts/CN-600000.SH.parquet');
    const bars = [
      bar('2026-09-07', '10', '10'),
      bar('2026-09-08', '10', '15'),
      bar('2026-09-09', '15', '5'),
      bar('2026-09-10', '20', '10'),
    ];
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
            symbol: '600000.SH',
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
    ]);
    const strategy = strategySchemaV2.parse({
      schemaVersion: '2',
      name: '完整权益序列回归',
      signalSources: [
        {
          id: 'close',
          asset: { symbol: '600000.SH', market: 'CN', assetType: 'stock' },
          timeframe: '1d',
          series: ['close'],
        },
      ],
      executionInstrument: { symbol: '600000.SH', market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
      entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
      exit: {
        type: 'compare',
        operator: 'lt',
        left: { type: 'constant', value: '0' },
        right: { type: 'constant', value: '-1' },
      },
      sizing: { type: 'fixedQuantity', quantity: '500' },
      risk: [],
      execution: {
        mode: 'exchange',
        orderType: 'market',
        timeInForce: 'DAY',
        timing: 'nextEligibleBarOpen',
      },
      cost: { commissionRate: '0', slippageRate: '0' },
    }) as StrategySchemaV2;
    const result = runExchangeVertical({
      runId: 'run-equity-curve',
      strategyVersionId: 'strategy-equity-curve',
      snapshotId: 'snapshot-equity-curve',
      strategy,
      runConfig: runConfigSchemaV2.parse({
        startDate: '2026-09-07',
        endDate: '2026-09-10',
        dataAsOf: '2026-09-11T00:00:00Z',
        baseCurrency: 'CNY',
        initialCash: { CNY: '10000' },
        valuationPolicy: {
          baseTimezone: 'Asia/Shanghai',
          dailyValuationTime: '15:00',
          pricePolicy: 'latestAvailable',
          fxPolicy: 'latestAvailable',
        },
      }),
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });

    expect(result.analytics.equityCurve.map((point) => point.value.amount)).toEqual([
      '10000',
      '12500',
      '7500',
      '10000',
    ]);
    expect(result.analytics.drawdownCurve.map((point) => point.drawdown)).toEqual([
      '0',
      '0',
      '-0.4',
      '-0.2',
    ]);
    expect(result.analytics.equityCurve.at(-1)?.value.amount).toBe('10000');
  });

  it('按冻结 Calendar 产生的实际估值间隔推导年化频率', () => {
    const ticks = buildDailyValuationTicks({
      startDate: '2026-09-04',
      endDate: '2026-09-08',
      policy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '15:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
      calendar: tradingCalendarFromFact({
        market: 'CN',
        timezone: 'Asia/Shanghai',
        provider: 'fixture',
        providerRevision: 'calendar-annualization',
        availableAt: '2026-09-01T00:00:00Z',
        sessions: [{ startMinute: 570, endMinute: 900 }],
        sessionOverrides: [],
        holidays: [],
        range: { start: '2026-09-04', end: '2026-09-08' },
      }),
    });
    const points = ticks.map((tick) => ({
      occurredAt: tick.occurredAt,
      value: { amount: '100', currency: 'CNY' as const },
    }));

    expect(ticks.map((tick) => tick.occurredAt)).toEqual([
      '2026-09-04T07:00:00.000Z',
      '2026-09-07T07:00:00.000Z',
      '2026-09-08T07:00:00.000Z',
    ]);
    expect(annualizationFactorFromValuations(points)).toBeCloseTo(365.2425 / 2, 8);
  });

  it('价格或 FX 缺失时不以现金冒充完整权益', () => {
    const ledgerState: SimulationLedgerState = {
      baseCurrency: 'CNY',
      cash: {
        CNY: { currency: 'CNY', settled: '5000', unsettled: '0' },
        HKD: { currency: 'HKD', settled: '0', unsettled: '0' },
        USD: { currency: 'USD', settled: '100', unsettled: '0' },
      },
      position: {
        symbol: '600000.SH',
        market: 'CN',
        assetType: 'stock',
        currency: 'CNY',
        quantity: '500',
        settledQuantity: '500',
        unsettledQuantity: '0',
        averageCost: '10',
      },
    };
    const result = buildBacktestEquityPoint({
      state: ledgerState,
      valuationAt: '2026-09-10T07:00:00Z',
      policy: {
        baseTimezone: 'Asia/Shanghai',
        dailyValuationTime: '15:00',
        pricePolicy: 'latestAvailable',
        fxPolicy: 'latestAvailable',
      },
      fxRates: [],
    });

    expect(result).toMatchObject({ status: 'unavailable' });
    if (result.status === 'unavailable') {
      expect(result.reason).toContain('PRICE_UNAVAILABLE');
      expect(result.reason).toContain('FX_UNAVAILABLE');
    }
  });
});
