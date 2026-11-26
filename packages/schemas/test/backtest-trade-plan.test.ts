import { describe, expect, it } from 'vitest';
import {
  strategySchema,
  projectPriceResearchStrategy,
  optimizationDiscoveryGenerationOutputSchema,
  authoringStrategySchema,
} from '../src/index.js';
const asset = { symbol: '600519.SH', market: 'CN', assetType: 'stock' };
const tradePlan = {
  version: 1,
  evaluation: 'barClose',
  initialStop: {
    activation: { kind: 'immediate' },
    kind: 'entryAtr',
    sourceId: 'main',
    period: 14,
    multiple: '2',
  },
  stages: [
    {
      id: 'half',
      trigger: { kind: 'gainPercent', value: '0.08' },
      action: { kind: 'reduce', basis: 'initialQuantity', fraction: '0.5' },
    },
  ],
};
const strategy = () => ({
  schemaVersion: 'strategy-definition-v1',
  name: '独立回测计划',
  signalSources: [{ id: 'main', asset, timeframe: '1d', priceCoordinate: 'research', series: ['open', 'high', 'low', 'close'] }],
  executionInstrument: asset,
  primaryTimeframe: '1d',
  entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
  exit: {
    type: 'compare',
    operator: 'lt',
    left: { type: 'constant', value: '1' },
    right: { type: 'constant', value: '0' },
  },
  sizing: { type: 'percentOfEquity', percent: '0.5' },
  risk: [],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0', slippageRate: '0' },
});
describe('策略交易计划正式合同', () => {
  it('月末计划贯通完整、编写与精简结构，仅接受日线并保留原样配置', () => {
    const plan = {
      version: 1,
      evaluation: 'barClose',
      stages: [],
      monthlyRebalance: {
        targetEquityFraction: '0.3',
        deviationThreshold: '0.03',
        evaluation: 'lastTradingDayClose',
      },
    };
    const input = { ...strategy(), tradePlan: plan };
    expect(strategySchema.parse(input).tradePlan).toEqual(plan);
    expect(authoringStrategySchema.parse(JSON.stringify(input)).tradePlan).toEqual(plan);
    const { name, entry, exit, sizing } = input;
    expect(
      optimizationDiscoveryGenerationOutputSchema.parse({
        strategy: { name, entry, exit, sizing, series: ['close'], risk: [], tradePlan: plan },
      }).strategy.tradePlan,
    ).toEqual(plan);
    expect(projectPriceResearchStrategy(strategySchema.parse(input)).tradePlan).toEqual(plan);
    expect(
      strategySchema.safeParse({
        ...input,
        primaryTimeframe: '1h',
        signalSources: input.signalSources.map((source) => ({ ...source, timeframe: '1h' })),
      }).success,
    ).toBe(false);
  });
  it('目标波动率只接受日线场内来源，正式与精简合同均保留每日统计配置', () => {
    const volatilityTarget = {
      returnPeriods: 20,
      targetAnnualVolatility: '0.1',
      maxEquityFraction: '0.5',
      annualizationPeriods: 252,
      returnKind: 'simple',
      variance: 'sample',
      update: 'dailyClose',
    };
    const plan = { version: 1, evaluation: 'barClose', stages: [], volatilityTarget };
    const input = { ...strategy(), tradePlan: plan };
    expect(strategySchema.parse(input).tradePlan).toEqual(plan);
    expect(authoringStrategySchema.parse(JSON.stringify(input)).tradePlan).toEqual(plan);
    expect(
      optimizationDiscoveryGenerationOutputSchema.parse({
        strategy: {
          name: input.name,
          series: ['close'],
          entry: input.entry,
          exit: input.exit,
          sizing: input.sizing,
          risk: [],
          tradePlan: plan,
        },
      }).strategy.tradePlan,
    ).toEqual(plan);
    const intraday = {
      ...input,
      primaryTimeframe: '1h',
      signalSources: input.signalSources.map((source) => ({ ...source, timeframe: '1h' })),
    };
    expect(strategySchema.safeParse(intraday).success).toBe(false);
  });
  it('正式／编写／精简入口接受同一计划，价格投影保留独立ATR来源', () => {
    const input = { ...strategy(), tradePlan };
    const parsed = strategySchema.parse(input);
    expect(authoringStrategySchema.parse(JSON.stringify(input)).tradePlan).toEqual(tradePlan);
    const projection = projectPriceResearchStrategy(parsed);
    expect(projection.tradePlan).toEqual(tradePlan);
    expect(projection.signalSources).toHaveLength(1);
    expect(
      optimizationDiscoveryGenerationOutputSchema.parse({
        strategy: {
          name: input.name,
          series: ['high', 'low', 'close'],
          entry: input.entry,
          exit: input.exit,
          sizing: input.sizing,
          risk: [],
          tradePlan,
        },
      }).strategy.tradePlan,
    ).toEqual(tradePlan);
  });
  it('缺失初始止损的风险预算、重复阶段和未声明ATR事实被拒绝', () => {
    expect(
      strategySchema.safeParse({
        ...strategy(),
        tradePlan: {
          version: 1,
          evaluation: 'barClose',
          stages: [],
          riskBudget: { equityFraction: '0.01', maxEquityFraction: '0.5' },
        },
      }).success,
    ).toBe(false);
    expect(
      strategySchema.safeParse({
        ...strategy(),
        tradePlan: { ...tradePlan, stages: [...tradePlan.stages, ...tradePlan.stages] },
      }).success,
    ).toBe(false);
    expect(
      strategySchema.safeParse({
        ...strategy(),
        tradePlan: { ...tradePlan, initialStop: { ...tradePlan.initialStop, sourceId: 'unknown' } },
      }).success,
    ).toBe(false);
  });
  it('基金申赎不能套用场内交易计划，旧定义不自动补计划', () => {
    expect(strategySchema.parse(strategy())).not.toHaveProperty('tradePlan');
    const fund = {
      ...strategy(),
      executionInstrument: { symbol: '000001', market: 'CN', assetType: 'fund' },
      signalSources: [
        {
          id: 'main',
          asset: { symbol: '000001', market: 'CN', assetType: 'fund' },
          timeframe: '1d',
          series: ['nav'],
        },
      ],
      execution: { mode: 'nav', requestTypes: ['subscribe', 'redeem'], timing: 'nextAvailableNav' },
      tradePlan: { version: 1, evaluation: 'barClose', stages: [] },
    };
    expect(strategySchema.safeParse(fund).success).toBe(false);
  });
});
