import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runConfigSchemaV3, type BacktestStrategy } from '@thesis-ledger/schemas';
import { planSnapshotInputsV3 } from '../../src/backtest/backtest-snapshot-v3-input-plan.js';

const instrument = { symbol: '159516.SZ', market: 'CN', assetType: 'etf' } as const;
const strategy: BacktestStrategy = {
  schemaVersion: '2',
  name: '同坐标输入',
  executionInstrument: instrument,
  primaryTimeframe: '1d',
  signalSources: [{ id: 'price', asset: instrument, timeframe: '1d', series: ['close'] }],
  entry: {
    type: 'compare',
    operator: 'gt',
    left: { type: 'series', sourceId: 'price', field: 'close' },
    right: { type: 'series', sourceId: 'price', field: 'close' },
  },
  exit: { type: 'positionState', field: 'isOpen' },
  sizing: { type: 'percentOfEquity', percent: '1' },
  risk: [],
  execution: {
    mode: 'exchange',
    orderType: 'market',
    timeInForce: 'DAY',
    timing: 'nextEligibleBarOpen',
  },
  cost: { commissionRate: '0', slippageRate: '0' },
};
const protocol = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/schemas/fixtures/execution-price.raw-events.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const config = () =>
  runConfigSchemaV3.parse({
    schemaVersion: '3',
    startDate: '2026-05-16',
    endDate: '2026-08-09',
    dataAsOf: '2026-09-25T00:00:00Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '10000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    executionPriceProtocol: protocol,
    priceInputBindings: {
      signals: [{ sourceId: 'price', binding: 'execution-series' }],
      benchmark: { binding: 'execution-series' },
    },
  });

describe('V3 显式同坐标输入计划', () => {
  it('仅规划一份物理行情，保留用途、预热与 raw 事件要求', () => {
    const result = planSnapshotInputsV3({ strategy, runConfig: config() });
    expect(new Set(result.priceInputs.map((alias) => alias.artifactKey)).size).toBe(1);
    expect(result.priceInputs.map((alias) => alias.purpose)).toEqual([
      'execution',
      'signal',
      'benchmark',
    ]);
    expect(result.plan.warmup.startDate < '2026-05-16').toBe(true);
    expect(result.dependencyClosure.corporateActions).toEqual(['CN:159516.SZ:etf']);
    expect(result.plan.corporateActions.validation).toBe('pending');
    expect(result.plan.ruleCompatibility.status).toBe('pending');
  });

  it('缺少绑定、缺少实际引用、额外或未知 source 均拒绝', () => {
    const absent = config();
    delete absent.priceInputBindings;
    expect(() => planSnapshotInputsV3({ strategy, runConfig: absent })).toThrow('显式');
    for (const ids of [[], ['unknown'], ['price', 'unused']]) {
      const value = config();
      value.priceInputBindings!.signals = ids.map((sourceId) => ({
        sourceId,
        binding: 'execution-series',
      }));
      expect(() => planSnapshotInputsV3({ strategy, runConfig: value })).toThrow('sourceId');
    }
  });

  it('不把同名序列绑定扩展为跨标的或跨周期', () => {
    const differentAsset = {
      ...strategy,
      signalSources: [
        { ...strategy.signalSources[0]!, asset: { ...instrument, symbol: '510300.SH' } },
      ],
    };
    expect(() => planSnapshotInputsV3({ strategy: differentAsset, runConfig: config() })).toThrow(
      '不同标的或周期',
    );
    const differentBenchmark = { ...strategy, benchmark: { ...instrument, symbol: '510300.SH' } };
    expect(() =>
      planSnapshotInputsV3({ strategy: differentBenchmark, runConfig: config() }),
    ).toThrow('基准');
  });

  it('不以已有信号定义推断未声明的使用，不静默开启 FX', () => {
    const noSignal = {
      ...strategy,
      entry: { type: 'positionState' as const, field: 'isOpen' as const },
    };
    const value = config();
    value.priceInputBindings!.signals = [];
    expect(
      planSnapshotInputsV3({ strategy: noSignal, runConfig: value }).plan.signalSources,
    ).toEqual([]);
    expect(() =>
      planSnapshotInputsV3({ strategy, runConfig: { ...config(), baseCurrency: 'USD' } }),
    ).toThrow('FX');
  });
});
