import { describe, expect, it } from 'vitest';
import {
  backtestCapabilitiesSchema,
  strategySchemaV2,
  type BacktestMarket,
  type StrategySchemaV2,
} from '../src/index.js';

const markets = ['CN', 'HK', 'US'] as const satisfies readonly BacktestMarket[];
const assetTypes = ['stock', 'etf'] as const;
const timeframes = ['1d', '60m', '30m', '15m', '5m', '1m'] as const;

const symbols = {
  CN: { stock: '600519.SH', etf: '510300.SH' },
  HK: { stock: '00005.HK', etf: '02800.HK' },
  US: { stock: 'AAPL.US', etf: 'SPY.US' },
} as const;

const exchangeStrategy = (
  market: (typeof markets)[number],
  assetType: (typeof assetTypes)[number],
  timeframe: (typeof timeframes)[number],
): StrategySchemaV2 => ({
  schemaVersion: '2',
  name: `${market}-${assetType}-${timeframe}`,
  signalSources: [
    {
      id: 'execution',
      asset: { market, assetType, symbol: symbols[market][assetType] },
      timeframe,
      series: ['close', 'volume'],
    },
  ],
  executionInstrument: { market, assetType, symbol: symbols[market][assetType] },
  primaryTimeframe: timeframe,
  entry: {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'execution', field: 'close' },
    right: { type: 'constant', value: '1' },
  },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'fixedQuantity', quantity: '1' },
  risk: [],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0', slippageRate: '0' },
});

const dependencyMatrix = () => {
  const timezones = {
    CN: 'Asia/Shanghai',
    HK: 'Asia/Hong_Kong',
    US: 'America/New_York',
  } as const;
  const instrumentTypes = ['STOCK', 'ETF'] as const;
  const capabilities = markets.flatMap((market) =>
    instrumentTypes.flatMap((instrumentType) => [
      ...(['1m', '1d'] as const).map((timeframe) => ({
        market,
        instrumentType,
        timeframe,
        kind: 'base' as const,
        status: 'supported' as const,
        provider: 't13-fixture',
        providerRevision: '1',
        range: { start: '2026-01-01', end: '2026-12-31' },
        freshness: 'delayed' as const,
        quality: 'complete' as const,
        completeness: 'complete' as const,
        timezone: timezones[market],
      })),
      ...(['5m', '15m', '30m', '60m'] as const).map((timeframe) => ({
        market,
        instrumentType,
        timeframe,
        kind: 'derived' as const,
        status: 'supported' as const,
        provider: 'thesis-ledger-server',
        providerRevision: 'server-aggregation-v2',
        range: { start: '2026-01-01', end: '2026-12-31' },
        freshness: 'delayed' as const,
        quality: 'complete' as const,
        completeness: 'complete' as const,
        timezone: timezones[market],
      })),
    ]),
  );
  capabilities.push(
    {
      market: 'CN',
      instrumentType: 'NAV_FUND',
      timeframe: '1d',
      kind: 'base',
      status: 'supported',
      provider: 't13-fixture',
      providerRevision: '1',
      range: { start: '2026-01-01', end: '2026-12-31' },
      freshness: 'delayed',
      quality: 'complete',
      completeness: 'complete',
      timezone: 'Asia/Shanghai',
    },
    ...(['HK', 'US'] as const).map((market) => ({
      market,
      instrumentType: 'NAV_FUND' as const,
      timeframe: '1d' as const,
      kind: 'base' as const,
      status: 'unsupported' as const,
      provider: 't13-fixture',
      providerRevision: '1',
      range: { start: null, end: null },
      freshness: 'unknown' as const,
      quality: 'unknown' as const,
      completeness: 'unavailable' as const,
      timezone: timezones[market],
      reason: 'V2 仅支持中国内地 NAV Fund',
    })),
  );
  return capabilities;
};

describe('V2 T13 完整目标矩阵', () => {
  it('接受 CN/HK/US Stock/ETF 全部目标周期', () => {
    for (const market of markets) {
      for (const assetType of assetTypes) {
        for (const timeframe of timeframes) {
          expect(
            strategySchemaV2.safeParse(exchangeStrategy(market, assetType, timeframe)).success,
            `${market}/${assetType}/${timeframe}`,
          ).toBe(true);
        }
      }
    }
  });

  it('仅接受 CN NAV 日频，并拒绝分钟 NAV 与 HK/US NAV', () => {
    const cnNav = {
      schemaVersion: '2',
      name: 'CN NAV',
      signalSources: [
        {
          id: 'nav',
          asset: { market: 'CN', symbol: '110011.OF', assetType: 'fund' },
          timeframe: '1d',
          series: ['nav'],
        },
      ],
      executionInstrument: { market: 'CN', symbol: '110011.OF', assetType: 'fund' },
      primaryTimeframe: '1d',
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'nav', field: 'nav' },
        right: { type: 'constant', value: '1' },
      },
      exit: { type: 'positionState', field: 'isOpen' },
      sizing: { type: 'fixedAmount', amount: '1000' },
      risk: [],
      execution: { mode: 'nav', requestTypes: ['subscribe', 'redeem'], timing: 'nextAvailableNav' },
      cost: { commissionRate: '0', slippageRate: '0' },
    };
    expect(strategySchemaV2.safeParse(cnNav).success).toBe(true);
    expect(
      strategySchemaV2.safeParse({
        ...cnNav,
        primaryTimeframe: '5m',
        signalSources: [{ ...cnNav.signalSources[0], timeframe: '5m' }],
      }).success,
    ).toBe(false);
    for (const market of ['HK', 'US'] as const) {
      expect(
        strategySchemaV2.safeParse({
          ...cnNav,
          executionInstrument: { market, symbol: `FUND.${market}`, assetType: 'fund' },
          signalSources: [
            {
              ...cnNav.signalSources[0],
              asset: { market, symbol: `FUND.${market}`, assetType: 'fund' },
            },
          ],
        }).success,
      ).toBe(false);
    }
  });

  it('契约表达完整 39 项 capability、FX、NAV 与拆并股依赖', () => {
    const capabilities = dependencyMatrix();
    const parsed = backtestCapabilitiesSchema.parse({
      version: 2,
      provider: 't13-fixture',
      generatedAt: '2026-09-09T00:00:00Z',
      capabilities,
      calendars: markets.map((market) => ({
        market,
        timezone:
          market === 'CN'
            ? 'Asia/Shanghai'
            : market === 'HK'
              ? 'Asia/Hong_Kong'
              : 'America/New_York',
        provider: 't13-fixture',
        providerRevision: '1',
        availableAt: '2026-01-01T00:00:00Z',
        sessions: [{ startMinute: 570, endMinute: 960 }],
        sessionOverrides: [],
        holidays: [],
        range: { start: '2026-01-01', end: '2026-12-31' },
      })),
      instrumentFacts: [],
      fx: {
        status: 'supported',
        facts: [
          {
            fromCurrency: 'HKD',
            toCurrency: 'CNY',
            rate: '0.92',
            occurredAt: '2026-09-08T08:00:00Z',
            availableAt: '2026-09-08T08:00:00Z',
            provider: 't13-fixture',
            providerRevision: '1',
            freshness: 'delayed',
            quality: 'complete',
          },
          {
            fromCurrency: 'USD',
            toCurrency: 'CNY',
            rate: '7.2',
            occurredAt: '2026-09-08T08:00:00Z',
            availableAt: '2026-09-08T08:00:00Z',
            provider: 't13-fixture',
            providerRevision: '1',
            freshness: 'delayed',
            quality: 'complete',
          },
        ],
      },
      corporateActions: {
        status: 'supported',
        facts: [
          {
            symbol: 'AAPL.US',
            market: 'US',
            instrumentType: 'STOCK',
            type: 'SPLIT',
            ratio: '2',
            occurredAt: '2026-07-15T13:30:00Z',
            availableAt: '2026-07-01T13:30:00Z',
            provider: 't13-fixture',
            providerRevision: '1',
          },
          {
            symbol: '02800.HK',
            market: 'HK',
            instrumentType: 'ETF',
            type: 'REVERSE_SPLIT',
            ratio: '0.5',
            occurredAt: '2026-08-03T01:30:00Z',
            availableAt: '2026-07-20T01:30:00Z',
            provider: 't13-fixture',
            providerRevision: '1',
          },
        ],
      },
      nav: {
        status: 'supported',
        facts: [
          {
            symbol: '110011.OF',
            market: 'CN',
            instrumentType: 'NAV_FUND',
            nav: '1.25',
            valuationDate: '2026-09-08',
            occurredAt: '2026-09-08T07:00:00Z',
            availableAt: '2026-09-09T01:00:00Z',
            provider: 't13-fixture',
            providerRevision: '1',
            freshness: 'delayed',
            quality: 'complete',
            status: 'supported',
          },
        ],
      },
    });

    expect(parsed.capabilities).toHaveLength(39);
    expect(parsed.fx.facts.map((fact) => `${fact.fromCurrency}/${fact.toCurrency}`)).toEqual([
      'HKD/CNY',
      'USD/CNY',
    ]);
    expect(parsed.corporateActions.facts.map((fact) => fact.type)).toEqual([
      'SPLIT',
      'REVERSE_SPLIT',
    ]);
    expect(parsed.nav.status).toBe('supported');
  });
});
