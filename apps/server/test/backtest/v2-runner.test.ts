import { describe, expect, it } from 'vitest';
import { runCnNavVertical } from '../../src/backtest/backtest-v2-execution.js';

const ref = (key: string) => ({
  artifactId: key,
  key,
  format: 'parquet' as const,
  compression: 'zstd' as const,
  contentHash: key,
  sizeBytes: 1,
});

const runConfig = {
  startDate: '2025-01-02',
  endDate: '2025-01-02',
  dataAsOf: '2025-01-03T00:00:00.000Z',
  baseCurrency: 'CNY' as const,
  initialCash: { CNY: '1000' },
  valuationPolicy: {
    baseTimezone: 'Asia/Shanghai',
    dailyValuationTime: '15:00',
    pricePolicy: 'latestAvailable' as const,
    fxPolicy: 'latestAvailable' as const,
  },
};

const strategy = {
  schemaVersion: '2' as const,
  name: 'nav-runner',
  signalSources: [
    {
      id: 'fund-nav',
      asset: { symbol: 'FUND.CN', market: 'CN' as const, assetType: 'fund' as const },
      timeframe: '1d' as const,
      series: ['nav' as const],
    },
  ],
  executionInstrument: { symbol: 'FUND.CN', market: 'CN' as const, assetType: 'fund' as const },
  primaryTimeframe: '1d' as const,
  entry: {
    type: 'compare' as const,
    operator: 'gt' as const,
    left: { type: 'series' as const, sourceId: 'fund-nav', field: 'nav' as const },
    right: { type: 'constant' as const, value: '10' },
  },
  exit: {
    type: 'compare' as const,
    operator: 'lt' as const,
    left: { type: 'series' as const, sourceId: 'fund-nav', field: 'nav' as const },
    right: { type: 'constant' as const, value: '0' },
  },
  sizing: { type: 'fixedQuantity' as const, quantity: '10' },
  risk: [],
  execution: {
    mode: 'nav' as const,
    requestTypes: ['subscribe' as const],
    timing: 'nextAvailableNav' as const,
  },
  cost: { commissionRate: '0', slippageRate: '0' },
};

const navExecutionModel = () => ({
  schemaVersion: 'execution-model-v1' as const,
  id: 'cn-nav-runner-test',
  version: '1',
  scope: {
    symbol: 'FUND.CN',
    market: 'CN' as const,
    instrumentType: 'NAV_FUND' as const,
    currency: 'CNY' as const,
    timezone: 'Asia/Shanghai',
    range: { start: '2025-01-02', end: '2025-01-03' },
  },
  segments: [
    {
      id: 'cn-nav-2025',
      range: { start: '2025-01-02', end: '2025-01-03' },
      source: {
        kind: 'researchPreset' as const,
        description: '受控 NAV Runner 模型消费测试',
        references: ['test-fixture'],
        revision: '1',
        configuredAt: '2026-09-10T00:00:00+08:00',
      },
      assumptions: ['仅用于验证模型 cutoff 与 NAV 生命周期'],
      fees: null,
      execution: {
        mode: 'nav' as const,
        calendarMarket: 'CN' as const,
        cutoffLocalTime: '14:00',
        cutoffBoundary: 'atOrAfterNextTradingDay' as const,
        navDate: 'acceptedApplicationTradingDate' as const,
        navAvailability: 'providerAvailableAt' as const,
        reserveCashAt: 'orderAccepted' as const,
        subscriptionDebitAt: 'confirmation' as const,
        confirmationAfterTradingDays: 1,
        sellableAfterConfirmationTradingDays: 0,
        redemptionReinvestableAfterConfirmationTradingDays: 0,
        subscriptionFee: {
          treatment: 'charged' as const,
          side: 'buy' as const,
          basis: 'subscriptionApplicationAmount' as const,
          currency: 'CNY' as const,
          rate: '0.01',
          minimum: { kind: 'none' as const },
          rounding: { mode: 'halfUp' as const, decimalPlaces: 2 as const },
          collection: 'perApplication' as const,
          collectedAt: 'confirmation' as const,
        },
        redemptionFee: {
          treatment: 'charged' as const,
          side: 'sell' as const,
          basis: 'redemptionGrossProceeds' as const,
          currency: 'CNY' as const,
          rate: '0.01',
          minimum: { kind: 'none' as const },
          rounding: { mode: 'halfUp' as const, decimalPlaces: 2 as const },
          collection: 'perApplication' as const,
          collectedAt: 'confirmation' as const,
        },
      },
    },
  ],
});

describe('LocalSnapshotRunner CN NAV vertical', () => {
  it('uses frozen NAV facts and produces analytics-backed fills without exchange fills', async () => {
    const signalKey = 'run/nav/signal/CN-FUND.CN-1d.parquet';
    const navKey = 'run/nav/nav/CN-FUND.CN-facts.parquet';
    const calendarKey = 'run/nav/calendar/CN-facts.parquet';
    const rows = new Map([
      [
        signalKey,
        [
          {
            occurredAt: '2025-01-02T00:00:00.000Z',
            availableAt: '2025-01-02T00:00:00.000Z',
            nav: '12',
            symbol: 'FUND.CN',
          },
        ],
      ],
      [
        navKey,
        [
          {
            symbol: 'FUND.CN',
            market: 'CN',
            instrumentType: 'NAV_FUND',
            nav: '12',
            valuationDate: '2025-01-02',
            occurredAt: '2025-01-02T08:00:00.000Z',
            availableAt: '2025-01-02T08:00:00.000Z',
            provider: 'fixture',
            providerRevision: '1',
            freshness: 'live',
            quality: 'complete',
            status: 'supported',
          },
        ],
      ],
      [
        calendarKey,
        [
          {
            market: 'CN',
            timezone: 'Asia/Shanghai',
            provider: 'fixture',
            providerRevision: '1',
            availableAt: '2025-01-01T00:00:00.000Z',
            sessions: JSON.stringify([{ startMinute: 570, endMinute: 690 }]),
            sessionOverrides: JSON.stringify([]),
            holidays: JSON.stringify([]),
            range: JSON.stringify({ start: '2025-01-01', end: '2025-12-31' }),
          },
        ],
      ],
    ]);
    const result = runCnNavVertical({
      runId: 'run-nav',
      strategyVersionId: 'strategy-v2',
      snapshotId: 'snapshot-hash',
      strategy,
      runConfig,
      rows,
      artifacts: [ref(signalKey), ref(navKey), ref(calendarKey)],
      engineVersion: 'runner',
      marketRuleVersion: 'rules',
      calendarVersion: 'calendar',
      aggregationVersion: 'aggregation',
    });
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]?.price).toBe('12');
    expect(result.analytics.resultChecksum).toBeTruthy();
    expect(result.trades).toHaveLength(0);
  });

  it('consumes frozen NAV execution rules for cutoff, fee, and lifecycle timing', () => {
    const signalKey = 'run/nav-model/signal/CN-FUND.CN-1d.parquet';
    const navKey = 'run/nav-model/nav/CN-FUND.CN-facts.parquet';
    const calendarKey = 'run/nav-model/calendar/CN-facts.parquet';
    const modelStrategy = {
      ...strategy,
      sizing: { type: 'fixedQuantity' as const, quantity: '1' },
    };
    const rows = new Map([
      [
        signalKey,
        [
          {
            occurredAt: '2025-01-02T06:30:00.000Z',
            availableAt: '2025-01-02T06:30:00.000Z',
            nav: '12',
            symbol: 'FUND.CN',
          },
          {
            occurredAt: '2025-01-03T08:00:00.000Z',
            availableAt: '2025-01-03T08:00:00.000Z',
            nav: '13',
            symbol: 'FUND.CN',
          },
        ],
      ],
      [
        navKey,
        [
          {
            symbol: 'FUND.CN',
            market: 'CN',
            instrumentType: 'NAV_FUND',
            nav: '12',
            valuationDate: '2025-01-02',
            occurredAt: '2025-01-02T08:00:00.000Z',
            availableAt: '2025-01-02T08:00:00.000Z',
            provider: 'fixture',
            providerRevision: 'nav-2025-01-02',
            freshness: 'live',
            quality: 'complete',
            status: 'supported',
          },
          {
            symbol: 'FUND.CN',
            market: 'CN',
            instrumentType: 'NAV_FUND',
            nav: '13',
            valuationDate: '2025-01-03',
            occurredAt: '2025-01-03T06:00:00.000Z',
            availableAt: '2025-01-03T07:00:00.000Z',
            provider: 'fixture',
            providerRevision: 'nav-2025-01-03',
            freshness: 'live',
            quality: 'complete',
            status: 'supported',
          },
        ],
      ],
      [
        calendarKey,
        [
          {
            market: 'CN',
            timezone: 'Asia/Shanghai',
            provider: 'fixture',
            providerRevision: '1',
            availableAt: '2025-01-01T00:00:00.000Z',
            sessions: JSON.stringify([{ startMinute: 570, endMinute: 690 }]),
            sessionOverrides: JSON.stringify([]),
            holidays: JSON.stringify([]),
            range: JSON.stringify({ start: '2025-01-01', end: '2025-12-31' }),
          },
        ],
      ],
    ]);
    const result = runCnNavVertical({
      runId: 'run-nav-model',
      strategyVersionId: 'strategy-v2',
      snapshotId: 'snapshot-model-hash',
      strategy: modelStrategy,
      runConfig: {
        ...runConfig,
        endDate: '2025-01-03',
        executionModel: navExecutionModel(),
      },
      rows,
      artifacts: [ref(signalKey), ref(navKey), ref(calendarKey)],
      engineVersion: 'runner',
      marketRuleVersion: 'calendar',
      calendarVersion: 'calendar',
      aggregationVersion: 'aggregation',
    });

    expect(result.rejects).toEqual([]);
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]).toMatchObject({
      side: 'buy',
      price: '13',
      charges: [{ amount: '0.12', currency: 'CNY' }],
    });
    expect(result.analytics.completeness).toBe('partial');
    expect(result.analytics.equityCurve).toHaveLength(2);
  });
});
