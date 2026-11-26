import { expect, it } from 'vitest';
import { z } from 'zod';
import { strategySchema } from '../src/backtest-strategy.js';
import {
  projectPriceResearchStrategy,
  priceResearchStrategySummary,
} from '../src/backtest-price-research-strategy.js';
import { aiGenerationContracts } from '../src/ai-execution.js';

const asset = { symbol: 'AAPL.US', market: 'US', assetType: 'stock' };
const source = { id: 'main', asset, timeframe: '1m', priceCoordinate: 'research', series: ['close', 'volume'] };
const strategy = {
  schemaVersion: 'strategy-definition-v1',
  name: '独立会话样本',
  signalSources: [source],
  executionInstrument: asset,
  primaryTimeframe: '1m',
  entry: {
    type: 'all',
    conditions: [
      {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'main', field: 'close' },
        right: { type: 'sessionValue', sourceId: 'main', field: 'vwap' },
      },
      {
        type: 'compare',
        operator: 'lte',
        left: { type: 'sessionValue', sourceId: 'main', field: 'elapsedMinutes' },
        right: { type: 'constant', value: '60' },
      },
    ],
  },
  exit: {
    type: 'compare',
    operator: 'eq',
    left: { type: 'constant', value: '0' },
    right: { type: 'constant', value: '1' },
  },
  sizing: { type: 'percentOfEquity', percent: '0.25' },
  risk: [],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0', slippageRate: '0' },
};

it('正式策略根拒绝缺量、日线和未知来源，接受严格的盘中会话组合', () => {
  expect(strategySchema.safeParse(strategy).success).toBe(true);
  for (const patch of [
    { series: ['close'] },
    { timeframe: '1d' },
    { id: 'other' },
    { asset: { ...asset, assetType: 'fund' } },
  ]) {
    expect(
      strategySchema.safeParse({ ...strategy, signalSources: [{ ...source, ...patch }] }).success,
    ).toBe(false);
  }
  expect(
    strategySchema.safeParse({
      ...strategy,
      entry: {
        type: 'compare',
        operator: 'gt',
        left: {
          type: 'indicator',
          name: 'MA',
          input: { type: 'sessionValue', sourceId: 'main', field: 'vwap' },
          params: { period: 5 },
        },
        right: { type: 'series', sourceId: 'main', field: 'close' },
      },
    }).success,
  ).toBe(false);
  expect(
    strategySchema.safeParse({
      ...strategy,
      entry: {
        type: 'cross',
        direction: 'above',
        left: { type: 'series', sourceId: 'main', field: 'close' },
        right: { type: 'sessionValue', sourceId: 'main', field: 'vwap' },
      },
    }).success,
  ).toBe(false);
});

it('价格研究投影保留会话来源，中文分别读出累计均价和首开后分钟数', () => {
  const projected = projectPriceResearchStrategy(strategySchema.parse(strategy));
  expect(projected.signalSources).toHaveLength(1);
  expect(projected.signalSources[0]).toMatchObject({ id: 'main', priceCoordinate: 'research' });
  const summary = priceResearchStrategySummary(projected);
  expect(JSON.stringify(summary)).toContain('当日累计均价（收盘价乘成交量）');
  expect(JSON.stringify(summary)).toContain('距当日首个开市分钟数（午休不重置）');
});

it('三个现行具名生成合同，并携带正式会话节点的完整Schema', () => {
  for (const contract of [
    aiGenerationContracts.strategyDiscovery,
    aiGenerationContracts.authoringGeneration,
    aiGenerationContracts.authoringModification,
  ]) {
    expect(contract.ref.version.endsWith('-v1')).toBe(true);
    expect(JSON.stringify(z.toJSONSchema(contract.schema))).toContain('sessionValue');
  }
});
