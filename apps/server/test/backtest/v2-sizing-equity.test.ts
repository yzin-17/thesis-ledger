import { computeSizing, type SimulationLedgerState } from '@thesis-ledger/domain';
import { runConfigSchemaV2, strategySchemaV2, type StrategySchemaV2 } from '@thesis-ledger/schemas';
import { describe, expect, it } from 'vitest';
import type { ArtifactRef, ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import { buildBacktestSizingEquity } from '../../src/backtest/backtest-sizing-equity.js';
import { runExchangeVertical } from '../../src/backtest/backtest-v2-execution.js';

const policy = {
  baseTimezone: 'Asia/Shanghai',
  dailyValuationTime: '15:00',
  pricePolicy: 'latestAvailable' as const,
  fxPolicy: 'latestAvailable' as const,
};

const state = (overrides: Partial<SimulationLedgerState> = {}): SimulationLedgerState => ({
  baseCurrency: 'CNY',
  cash: {
    CNY: { currency: 'CNY', settled: '5000', unsettled: '0' },
    HKD: { currency: 'HKD', settled: '0', unsettled: '0' },
    USD: { currency: 'USD', settled: '0', unsettled: '0' },
  },
  position: {
    symbol: '600000.SH',
    market: 'CN',
    assetType: 'stock',
    currency: 'CNY',
    quantity: '500',
    settledQuantity: '250',
    unsettledQuantity: '250',
    averageCost: '10',
  },
  ...overrides,
});

const price = {
  symbol: '600000.SH',
  market: 'CN' as const,
  assetType: 'stock' as const,
  currency: 'CNY' as const,
  price: '10',
  occurredAt: '2026-09-10T01:30:00Z',
  availableAt: '2026-09-10T01:30:00Z',
};

describe('回测定仓总权益事实', () => {
  it('纳入持仓市值、未结算现金和其他币种，并保留费用扣减', () => {
    const facts = buildBacktestSizingEquity({
      state: state({
        cash: {
          CNY: { currency: 'CNY', settled: '3995', unsettled: '1000' },
          HKD: { currency: 'HKD', settled: '0', unsettled: '0' },
          USD: { currency: 'USD', settled: '100', unsettled: '0' },
        },
        position: {
          ...state().position,
          quantity: '430',
          settledQuantity: '215',
          unsettledQuantity: '215',
        },
      }),
      executionCurrency: 'CNY',
      evaluationAt: price.availableAt,
      policy,
      price,
      fxRates: [
        {
          fromCurrency: 'USD',
          toCurrency: 'CNY',
          rate: '7',
          occurredAt: '2026-09-10T01:00:00Z',
          availableAt: '2026-09-10T01:00:00Z',
          provider: 'fixture',
          providerRevision: 'fx-1',
          completeness: 'complete',
        },
      ],
    });

    expect(facts.equity).toMatchObject({ amount: '9995', currency: 'CNY' });
  });

  it('缺少跨币种 FX 时显式返回权益不可用', () => {
    const facts = buildBacktestSizingEquity({
      state: state({
        cash: {
          CNY: { currency: 'CNY', settled: '5000', unsettled: '0' },
          HKD: { currency: 'HKD', settled: '0', unsettled: '0' },
          USD: { currency: 'USD', settled: '100', unsettled: '0' },
        },
      }),
      executionCurrency: 'CNY',
      evaluationAt: price.availableAt,
      policy,
      price,
      fxRates: [],
    });
    const result = computeSizing({
      rule: { type: 'targetWeight', weight: '0.5' },
      executionCurrency: 'CNY',
      lotSize: '1',
      currentQuantity: '500',
      evaluationAt: price.availableAt,
      price: { value: price.price, occurredAt: price.occurredAt, availableAt: price.availableAt },
      ...facts,
    });

    expect(result).toMatchObject({ status: 'unavailable', reasonCode: 'EQUITY_UNAVAILABLE' });
  });
});

const artifact = (key: string): ArtifactRef => ({
  artifactId: key,
  key,
  format: 'parquet',
  compression: 'zstd',
  contentHash: `${key}:hash`,
  sizeBytes: 1,
});

const bar = (date: string, close: string): ArtifactRow => ({
  symbol: '600000.SH',
  market: 'CN',
  timeframe: '1d',
  occurredAt: `${date}T00:00:00Z`,
  availableAt: `${date}T07:00:00Z`,
  openedAt: `${date}T01:30:00Z`,
  openAvailableAt: `${date}T01:30:00Z`,
  open: '10',
  high: '10',
  low: '8',
  close,
  volume: '1000',
  provider: 'fixture',
  providerRevision: `bar-${date}`,
  quality: 'complete',
});

describe('实际 Exchange Runner 的总权益定仓', () => {
  it('现金 5000 加持仓市值 5000 时，50% 目标权重不会错误减仓到 250 股', () => {
    const signalRef = artifact('signal/CN-600000.SH-1d.parquet');
    const executionRef = artifact('execution/CN-600000.SH-1d.parquet');
    const calendarRef = artifact('calendar/CN.parquet');
    const instrumentRef = artifact('instrumentFacts/CN-600000.SH.parquet');
    const bars = [
      bar('2026-09-07', '10'),
      bar('2026-09-08', '8'),
      bar('2026-09-09', '10'),
      bar('2026-09-10', '10'),
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
            sessions: JSON.stringify([{ startMinute: 570, endMinute: 900 }]),
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
            executionRules: JSON.stringify({
              status: 'supported',
              version: 'rules-v1',
              range: { start: '2026-01-01', end: '2026-12-31' },
              price: { reference: 'previousClose', maxUpRatio: null, maxDownRatio: null },
              positionSettlement: { sellableAfterTradingDays: 0 },
              cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 0 },
              statutoryCharges: [],
            }),
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
      name: '总权益目标权重回归',
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
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'close', field: 'close' },
        right: { type: 'constant', value: '9' },
      },
      exit: {
        type: 'compare',
        operator: 'lt',
        left: { type: 'constant', value: '0' },
        right: { type: 'constant', value: '-1' },
      },
      sizing: { type: 'targetWeight', weight: '0.5' },
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
      runId: 'run-sizing-equity',
      strategyVersionId: 'strategy-sizing-equity',
      snapshotId: 'snapshot-sizing-equity',
      strategy,
      runConfig: runConfigSchemaV2.parse({
        startDate: '2026-09-07',
        endDate: '2026-09-10',
        dataAsOf: '2026-09-11T00:00:00Z',
        baseCurrency: 'CNY',
        initialCash: { CNY: '10000' },
        valuationPolicy: policy,
      }),
      rows,
      artifacts: [signalRef, executionRef, calendarRef, instrumentRef],
      engineVersion: 'runner-v2',
      marketRuleVersion: 'rules-v1',
      calendarVersion: 'calendar-v1',
      aggregationVersion: 'aggregation-v1',
    });

    expect(result.fills.map((fill) => ({ side: fill.side, quantity: fill.quantity }))).toEqual([
      { side: 'buy', quantity: '500' },
    ]);
    expect(result.rejects).toContainEqual(
      expect.objectContaining({ ruleVersion: 'sizing-v1', reason: 'sizing 规范化后数量为零' }),
    );
  });
});
