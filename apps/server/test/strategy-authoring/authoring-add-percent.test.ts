import { omit } from 'es-toolkit';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import {
  authoringStrategyV6Schema,
  executionConfigSchema,
  type AuthoringContent,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { validateAuthoringGeneration } from '../../src/strategy-authoring/authoring-semantics.js';
import { validateAuthoringModification } from '../../src/strategy-authoring/authoring-modification.js';
import { AuthoringSaveService } from '../../src/strategy-authoring/authoring-save.service.js';
import { backtestTradePlanLines } from '@thesis-ledger/domain';

const base = authoringStrategyV6Schema.parse(
  readFileSync(
    new URL(
      '../../../../packages/schemas/fixtures/strategy-authoring.exchange.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as BacktestStrategy;
const definition = (value: string) => ({
  ...structuredClone(base),
  entryTrigger: 'while-flat' as const,
  signalSources: base.signalSources.map((source) => ({ ...source, series: ['close'] })),
  tradePlan: {
    version: 1 as const,
    evaluation: 'barClose' as const,
    stages: [
      {
        id: 'add',
        trigger: { kind: 'gainPercent' as const, value },
        action: { kind: 'add' as const, initialFraction: '1', maxEquityFraction: '0.3' },
      },
    ],
  },
});
function content(quote = '持仓浮盈达到0.5%时加仓'): AuthoringContent {
  return {
    title: '加仓比例',
    description: quote,
    questions: [],
    requirements: [
      {
        id: 'plan',
        quote,
        interpretation: '明确加仓涨幅',
        state: 'understood',
        definitionPaths: ['tradePlan'],
      },
    ],
    runtimeIntents: [],
    removedRequirements: [],
    definitionText: JSON.stringify(definition('0.005')),
    manualChanges: [],
    confirmation: {
      instrumentId: 'catalog',
      instrument: base.executionInstrument,
      timeframe: base.primaryTimeframe,
      entrySummary: '保持入场',
      exitSummary: '保持退出',
      sizing: base.sizing,
      risk: base.risk,
      noExtraRiskConfirmed: false,
      execution: executionConfigSchema.parse(base.execution),
      cost: base.cost,
      periodsAreBarsConfirmed: true,
    },
  };
}
const output = (strategy: ReturnType<typeof definition>) => ({
  intentCheck: '核对加仓触发及比例',
  proposal: {
    definition: {
      ...strategy,
      signalSources: strategy.signalSources.map(source => omit(source, ['series'])),
    },
    coverage: [{ requirementId: 'plan', definitionPaths: ['tradePlan'] }],
  },
});

it('编写保留结构化百分比，不从需求或模型说明推断、拒绝或改写计划', () => {
  const expected = { ...definition('0.5'), description: '浮盈达到0.5%时加仓' };
  const compiled = validateAuthoringGeneration(content(), output(expected)).definition;
  expect(compiled).toEqual(expected);
  expect(backtestTradePlanLines(compiled.tradePlan).join('\n')).toContain('50%');
  expect(backtestTradePlanLines(compiled.tradePlan).join('\n')).not.toContain('0.5%');
  expect(
    validateAuthoringGeneration(content(), output(definition('0.005'))).definition.tradePlan
      ?.stages[0]?.trigger.value,
  ).toBe('0.005');
  expect(() =>
    validateAuthoringGeneration(content('上涨50%时加仓'), output(definition('0.5'))),
  ).not.toThrow();
});
it('局部修改计划保留模型配置，不从本次意图或旧描述改写阈值', () => {
  const selection = { intent: '浮盈达到1.5%时加仓', modificationTarget: 'tradePlan' as const };
  expect(
    validateAuthoringModification(content(), selection, output(definition('0.015'))).definition.tradePlan
      ?.stages[0]?.trigger.value,
  ).toBe('0.015');
  expect(validateAuthoringModification(content(), selection, output(definition('1.5'))).definition).toEqual(
    definition('1.5'),
  );
});
it('已明确移除的旧加仓要求不被继续当成当前阈值', () => {
  const removed = content();
  removed.requirements[0]!.state = 'removed';
  removed.removedRequirements = [removed.description];
  expect(() => validateAuthoringGeneration(removed, output(definition('0.5')))).not.toThrow();
});
it('计划已修改后再局部调整费用，只核对本次授权字段，不重新应用旧加仓要求', () => {
  const current = content();
  const before = definition('0.015');
  current.definitionText = JSON.stringify(before);
  const after = { ...before, cost: { ...before.cost, commissionRate: '0.002' } };
  expect(
    validateAuthoringModification(
      current,
      { intent: '佣金调整为0.2%，其他不变', modificationTarget: 'cost' },
      output(after),
    ).definition,
  ).toEqual(after);
  expect(() =>
    validateAuthoringModification(
      current,
      { intent: '佣金调整为0.2%，其他不变', modificationTarget: 'cost' },
      output({ ...after, tradePlan: definition('0.5').tradePlan }),
    ),
  ).toThrow('建议改变了授权范围以外的规则');
});
it.each(['0.015', '0.5'])(
  '审核和保存保留已确认的当前计划%s，不用历史需求覆盖局部修改或人工编辑',
  async (value) => {
    const current = content();
    current.definitionText = JSON.stringify(definition(value));
    current.manualChanges = ['用户确认局部修改：浮盈达到1.5%时加仓'];
    const id = '23b4f0b4-6ee4-45cc-b41b-cb010f06da5c';
    const fingerprint = 'a'.repeat(64);
    const query = vi.fn();
    const tx = { $queryRaw: query, $executeRaw: vi.fn().mockResolvedValue(1) };
    const database = {
      $transaction: async (run: (transaction: typeof tx) => unknown) => {
        query
          .mockReset()
          .mockResolvedValueOnce([{ id, state: 'editing', revision: 2 }])
          .mockResolvedValueOnce([{ content: current }])
          .mockResolvedValue([{ count: 0n }]);
        return run(tx);
      },
    };
    const createInTransaction = vi.fn().mockResolvedValue({ id, versions: [{ id, version: 1 }] });
    const service = new AuthoringSaveService(
      database as never,
      { definitionFingerprint: () => fingerprint, createInTransaction } as never,
      { recordSource: vi.fn() } as never,
      { resolveTradableInstrument: async () => base.executionInstrument } as never,
    );
    const reviewed = await service.review('owner', id);
    expect(reviewed.definition.tradePlan?.stages[0]?.trigger.value).toBe(value);
    await service.save('owner', id, {
      expectedRevision: 2,
      name: '当前计划',
      reviewedDefinitionHash: reviewed.definitionHash,
    });
    expect(
      createInTransaction.mock.calls[0]?.[1].definition.tradePlan.stages[0].trigger.value,
    ).toBe(value);
  },
);
