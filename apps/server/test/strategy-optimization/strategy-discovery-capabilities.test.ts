import { expect, it } from 'vitest';
import {
  aiGenerationContracts,
  isStrategyCapabilityGap,
  strategyCapabilityGapSchema,
} from '@thesis-ledger/schemas';
import { strategyCapabilityGapLines } from '@thesis-ledger/domain';
import {
  assembleDiscoveryGeneration,
  createDiscoverySeed,
  parseDiscoveryOutput,
  validateDiscoveryStrategy,
} from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { StrategyCapabilityGapError } from '../../src/strategy-optimization/strategy-optimization-capability-gap.js';
import type { ExperimentRow } from '../../src/strategy-optimization/strategy-optimization-common.js';
import { RESEARCH_STRATEGY_SPACE_VERSION } from '../../src/strategy-optimization/strategy-optimization-research.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { multitimeframeFixture } from '../backtest/expression-multitimeframe.fixture.js';
import { priceResearchFixture } from '../backtest/price-research.fixtures.js';

const scope = {
  executionInstrument: { symbol: '510300.SH', market: 'CN' as const, assetType: 'etf' as const },
  primaryTimeframe: '1d' as const,
};
const seed = createDiscoverySeed(scope);
const experiment = {
  sourceMode: 'discovery',
  discoveryScope: scope,
  runConfig: {},
} as ExperimentRow;
const generated = {
  reason: '同标的双周期',
  evidenceRefs: [],
  strategy: {
    name: '日线趋势与小时过滤',
    series: ['close'],
    additionalSources: [{ id: 'hourly', timeframe: '60m', series: ['close'] }],
    entry: {
      type: 'compare',
      operator: 'gt',
      left: { type: 'series', sourceId: 'hourly', field: 'close' },
      right: { type: 'constant', value: '0' },
    },
    exit: seed.exit,
    sizing: seed.sizing,
    risk: [],
  },
};
const gap = {
  status: 'unsupported',
  originalRule: '财报公布后按盈利增长选股票池前十名',
  reason: '缺少时点财务与组合执行',
  gaps: [
    { path: 'signalSources', kind: 'data', detail: '没有可冻结的公布时间、修订与财务单位' },
    {
      path: 'executionInstrument',
      kind: 'execution',
      detail: '只有唯一下单标的，没有组合资金或多腿撮合',
    },
  ],
  supportedParts: ['已实现单标的收益率和窗口排序阈值'],
  evidenceRefs: [],
};

it('现行生成合同接受已冻结的同标的额外周期，装配固定资产', async () => {
  const f = await multitimeframeFixture();
  const research = await priceResearchFixture();
  const definition = f.input.strategy;
  const currentScope = {
    executionInstrument: definition.executionInstrument,
    primaryTimeframe: definition.primaryTimeframe,
  };
  const prepared = await prepareBacktestRunConfigV3({
    request: research.request,
    strategy: definition,
    reader: f.reader,
    control: research.control,
    researchCalendar: f.researchCalendar,
    checkedAt: f.input.runConfig.dataAsOf,
  });
  if (prepared.status !== 'prepared') throw new Error(JSON.stringify(prepared));
  const current = aiGenerationContracts.strategyDiscovery.schema.parse({
    reason: generated.reason,
    evidenceRefs: [],
    strategy: {
      name: generated.strategy.name,
      entryTrigger: 'rising-edge',
      signalSources: definition.signalSources.map(({ id, timeframe }) => ({
        id, timeframe, priceCoordinate: 'research',
      })),
      entry: definition.entry,
      exit: definition.exit,
      sizing: definition.sizing,
      risk: definition.risk,
    },
  });
  const output = assembleDiscoveryGeneration({
    ...experiment,
    discoveryScope: currentScope,
    runConfig: prepared.runConfig,
    strategySpaceVersion: RESEARCH_STRATEGY_SPACE_VERSION,
  }, createDiscoverySeed(currentScope, true), current);
  expect(output.strategy.executionInstrument).toEqual(currentScope.executionInstrument);
  expect(output.strategy.signalSources).toContainEqual(
    expect.objectContaining({
      id: 'hourly', asset: currentScope.executionInstrument, timeframe: '60m', series: ['close'],
    }),
  );
  expect(validateDiscoveryStrategy(output.strategy, currentScope)).toEqual(output.strategy);
});

it('来源不能覆盖主 ID、引用未声明来源或擅自引入独立参考资产', () => {
  expect(() =>
    assembleDiscoveryGeneration(experiment, seed, {
      ...generated,
      strategy: {
        ...generated.strategy,
        additionalSources: [
          { ...generated.strategy.additionalSources[0], id: 'discovery-primary' },
        ],
      },
    }),
  ).toThrow('来源 ID 不能重复');
  const output = assembleDiscoveryGeneration(experiment, seed, generated);
  expect(() =>
    validateDiscoveryStrategy(
      {
        ...output.strategy,
        signalSources: output.strategy.signalSources.map((source) => ({
          ...source,
          asset: { ...scope.executionInstrument, symbol: 'OTHER' },
        })),
      },
      scope,
    ),
  ).toThrow('独立参考资产尚未进入冻结探索范围');
});

it('能力缺口保存原意与位置，不携带部分策略，不进入候选装配或历史缓存回放', () => {
  expect(aiGenerationContracts.strategyDiscovery.schema.safeParse(gap).success).toBe(true);
  expect(isStrategyCapabilityGap(gap)).toBe(true);
  expect(
    strategyCapabilityGapSchema.safeParse({ ...gap, strategy: generated.strategy }).success,
  ).toBe(false);
  expect(() => assembleDiscoveryGeneration(experiment, seed, gap)).toThrow(
    StrategyCapabilityGapError,
  );
  expect(() => parseDiscoveryOutput(experiment, gap)).toThrow(StrategyCapabilityGapError);
  const parsed = strategyCapabilityGapSchema.parse(gap);
  expect(strategyCapabilityGapLines(parsed).join('\n')).toContain(
    '没有可冻结的公布时间、修订与财务单位',
  );
  expect(strategyCapabilityGapLines(parsed).join('\n')).toContain('执行能力 · executionInstrument');
});
