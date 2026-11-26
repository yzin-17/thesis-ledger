import { describe, expect, it } from 'vitest';
import {
  projectPriceResearchStrategy,
  priceResearchStrategyIssues,
} from '../src/backtest-price-research-strategy.js';
import { strategySchema, type BacktestStrategy } from '../src/backtest-strategy.js';

const strategy = (): BacktestStrategy =>
  strategySchema.parse({
    schemaVersion: 'strategy-definition-v1',
    name: '价格与均线研究',
    signalSources: [
      {
        id: 'price',
        asset: { symbol: '510300.SH', market: 'CN', assetType: 'etf' },
        timeframe: '1d',
        priceCoordinate: 'research',
        series: ['close'],
      },
    ],
    executionInstrument: { symbol: '510300.SH', market: 'CN', assetType: 'etf' },
    primaryTimeframe: '1d',
    entry: {
      type: 'all',
      conditions: [
        {
          type: 'compare',
          operator: 'lt',
          left: { type: 'series', sourceId: 'price', field: 'close' },
          right: { type: 'constant', value: '4' },
        },
        {
          type: 'compare',
          operator: 'gt',
          left: { type: 'series', sourceId: 'price', field: 'close' },
          right: {
            type: 'indicator',
            name: 'MA',
            input: { type: 'series', sourceId: 'price', field: 'close' },
            params: { period: 5 },
          },
        },
      ],
    },
    exit: { type: 'positionState', field: 'isOpen' },
    sizing: { type: 'fixedQuantity', quantity: '100' },
    risk: [],
    execution: {
      mode: 'exchange',
      orderType: 'market',
      timeInForce: 'DAY',
      timing: 'nextEligibleBarOpen',
    },
    cost: { commissionRate: '0', slippageRate: '0' },
  });

describe('价格研究策略的版本投影', () => {
  it('指标的零轴条件沿用后复权，价格水平阈值明确采用原价', () => {
    const draft = strategy();
    draft.entry = {
      type: 'compare',
      operator: 'gt',
      left: {
        type: 'indicator',
        name: 'MACD',
        output: 'macd',
        input: { type: 'series', sourceId: 'price', field: 'close' },
        params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      },
      right: { type: 'constant', value: '0' },
    };
    const projected = projectPriceResearchStrategy(draft);
    expect(projected.signalSources.map((source) => source.priceCoordinate)).toEqual(['research']);
    expect(priceResearchStrategyIssues(projected)).toEqual([]);
    draft.entry = {
      ...draft.entry,
      left: {
        type: 'indicator',
        name: 'MA',
        input: { type: 'series', sourceId: 'price', field: 'close' },
        params: { period: 5 },
      },
      right: { type: 'constant', value: '4' },
    };
    expect(
      projectPriceResearchStrategy(draft).signalSources.map((source) => source.priceCoordinate),
    ).toEqual(['actual']);
  });
  it('将具体价格和均线拆成两个来源，保留旧策略及精确常量', () => {
    const original = strategy(),
      before = JSON.stringify(original);
    const result = projectPriceResearchStrategy(original);
    expect(JSON.stringify(original)).toBe(before);
    expect(result.schemaVersion).toBe('strategy-definition-v1');
    expect(result.signalSources.map((source) => [source.id, source.priceCoordinate])).toEqual([
      ['price', 'research'],
      ['price:actual', 'actual'],
    ]);
    expect(result.entry).toMatchObject({
      conditions: [
        { left: { sourceId: 'price:actual' }, right: { value: '4' } },
        { left: { sourceId: 'price' }, right: { input: { sourceId: 'price' } } },
      ],
    });
    expect(priceResearchStrategyIssues(result)).toEqual([]);
    expect(projectPriceResearchStrategy(result)).toEqual(result);
  });

  it('跨坐标比较在创建之前指出具体条件', () => {
    const result = projectPriceResearchStrategy(strategy());
    result.entry = {
      type: 'compare',
      operator: 'gt',
      left: { type: 'series', sourceId: 'price:actual', field: 'close' },
      right: { type: 'series', sourceId: 'price', field: 'close' },
    };
    expect(priceResearchStrategyIssues(result)).toEqual([
      expect.objectContaining({ path: ['entry'], message: expect.stringContaining('混用') }),
    ]);
  });

  it('新草稿中的具体价格条件也采用原价，并可重复预览', () => {
    const draft = strategy();
    const preview = projectPriceResearchStrategy(draft);
    expect(preview.entry).toMatchObject({
      conditions: [{ left: { sourceId: 'price:actual' } }, {}],
    });
    expect(priceResearchStrategyIssues(preview)).toEqual([]);
    expect(projectPriceResearchStrategy(preview)).toEqual(preview);
  });

  it('现行策略必须保存来源坐标，旧版本受拒', () => {
    const original = strategy();
    expect(strategySchema.safeParse({ ...original, schemaVersion: '3' }).success).toBe(false);
    delete original.signalSources[0]!.priceCoordinate;
    expect(strategySchema.safeParse(original).success).toBe(false);
  });
});
