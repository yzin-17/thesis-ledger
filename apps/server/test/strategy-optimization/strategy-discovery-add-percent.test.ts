import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import {
  assembleDiscoveryGeneration,
  createDiscoverySeed,
  discoveryCandidateStrategy,
  parseDiscoveryProposal,
} from '../../src/strategy-optimization/strategy-optimization-discovery.js';

const scope = {
  executionInstrument: { symbol: '00700.HK', market: 'HK' as const, assetType: 'stock' as const },
  primaryTimeframe: '1d' as const,
};
const seed = createDiscoverySeed(scope);
const plan = (value: string) => ({
  version: 1 as const,
  evaluation: 'barClose' as const,
  stages: [
    {
      id: 'add',
      trigger: { kind: 'gainPercent' as const, value },
      action: { kind: 'add' as const, initialFraction: '1', maxEquityFraction: '0.3' },
    },
  ],
});
const generated = (value: string, reason = '浮盈达到0.5%时追加首次数量的100%') => ({
  strategy: {
    name: '加仓计划',
    series: ['close'],
    entry: seed.entry,
    exit: seed.exit,
    sizing: seed.sizing,
    risk: [],
    tradePlan: plan(value),
  },
  reason,
  evidenceRefs: [],
});

it('精简及完整发现入口按配置接纳，不从reason推断或改写加仓阈值', () => {
  expect(
    assembleDiscoveryGeneration({ discoveryScope: scope } as never, seed, generated('0.5')).strategy
      .tradePlan,
  ).toEqual(plan('0.5'));
  expect(
    parseDiscoveryProposal(
      { strategy: { ...seed, tradePlan: plan('0.5') }, reason: generated('0.5').reason },
      scope,
    ).strategy.tradePlan,
  ).toEqual(plan('0.5'));
  expect(
    assembleDiscoveryGeneration({ discoveryScope: scope } as never, seed, generated('0.005'))
      .strategy.tradePlan?.stages[0]?.trigger.value,
  ).toBe('0.005');
  expect(() =>
    assembleDiscoveryGeneration(
      { discoveryScope: scope } as never,
      seed,
      generated('0.5', '浮盈达到50%时加仓'),
    ),
  ).not.toThrow();
});
it('模型description与配置矛盾时仍保留配置，由配置生成中文供确认', () => {
  expect(
    parseDiscoveryProposal(
      { strategy: { ...seed, description: '上涨0.5%时加仓', tradePlan: plan('0.5') } },
      scope,
    ).strategy.tradePlan,
  ).toEqual(plan('0.5'));
});
it('缓存实验建议进入候选保存边界时不从reason重建计划', () => {
  expect(
    discoveryCandidateStrategy(
      { discoveryScope: scope } as never,
      { strategy: { ...seed, tradePlan: plan('0.5') }, reason: generated('0.5').reason } as never,
    ).tradePlan,
  ).toEqual(plan('0.5'));
});
it.skipIf(!process.env.INVESTMENT_AI_DIRECTORY)(
  '旧真实失败原始响应按当前配置接纳，保留历史失败证据及原值',
  () => {
    const raw = JSON.parse(
      readFileSync(
        resolve(process.env.INVESTMENT_AI_DIRECTORY!, 'retry-v5-300/response-1.json'),
        'utf8',
      ),
    );
    expect(
      assembleDiscoveryGeneration({ discoveryScope: scope } as never, seed, raw.output).strategy
        .tradePlan,
    ).toEqual(raw.output.strategy.tradePlan);
    expect(raw.output.strategy.tradePlan.stages[0].trigger.value).toBe('0.5');
  },
);
