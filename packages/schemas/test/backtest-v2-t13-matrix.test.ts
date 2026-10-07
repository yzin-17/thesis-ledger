import { describe, expect, it } from 'vitest';
import { strategySchema, type BacktestMarket, type BacktestStrategy } from '../src/index.js';

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
): BacktestStrategy => ({
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

describe('策略市场与周期合同', () => {
  it('接受 CN/HK/US Stock/ETF 全部目标周期', () => {
    for (const market of markets) {
      for (const assetType of assetTypes) {
        for (const timeframe of timeframes) {
          expect(
            strategySchema.safeParse(exchangeStrategy(market, assetType, timeframe)).success,
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
    expect(strategySchema.safeParse(cnNav).success).toBe(true);
    expect(
      strategySchema.safeParse({
        ...cnNav,
        primaryTimeframe: '5m',
        signalSources: [{ ...cnNav.signalSources[0], timeframe: '5m' }],
      }).success,
    ).toBe(false);
    for (const market of ['HK', 'US'] as const) {
      expect(
        strategySchema.safeParse({
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
});
