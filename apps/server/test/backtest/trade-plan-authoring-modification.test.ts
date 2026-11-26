import { expect, it } from 'vitest';
import { authoringProposalInputSchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { validateAuthoringModification } from '../../src/strategy-authoring/authoring-modification.js';
import {
  compiledAuthoringPlan,
  planAuthoringContent,
} from './trade-plan-authoring-content.fixture.js';
import { authoringProposal } from '../strategy-authoring/authoring-proposal.fixture.js';

const selection = {
  modificationTarget: 'tradePlan' as const,
  intent: '改为盈利10%后追踪最高收盘价下方5%，其他不变',
};
const content = (trailing = false) => ({
  ...planAuthoringContent(trailing),
  definitionText: JSON.stringify(compiledAuthoringPlan(trailing)),
});
const output = (definition: BacktestStrategy) =>
  authoringProposal(definition, [{ requirementId: 'rules', definitionPaths: ['entry', 'exit', 'sizing'] }]);

it.each([false, true])('实际局部修改校验只替换计划，保留普通退出摘要，原追踪=%s', (trailing) => {
  const before = content(trailing),
    after = compiledAuthoringPlan(!trailing);
  const result = validateAuthoringModification(before, selection, output(after));
  expect(result.definition).toEqual(after);
  expect(result.allowedPaths).toEqual(['tradePlan']);
  expect(result.confirmation).toEqual(before.confirmation);
  expect(result.differences.map(({ path, before, after }) => ({
    path, before: JSON.parse(before), after: JSON.parse(after),
  }))).toEqual([
    {
      path: 'tradePlan',
      before: compiledAuthoringPlan(trailing).tradePlan,
      after: after.tradePlan,
    },
  ]);
});

it('允许原来未配置时新增或明确移除，缺省值用null表示，不接受空修改', () => {
  const without = compiledAuthoringPlan(false);
  delete without.tradePlan;
  const empty = { ...content(), definitionText: JSON.stringify(without) };
  expect(
    validateAuthoringModification(empty, selection, output(compiledAuthoringPlan(false)))
      .differences[0]!.before,
  ).toBe('null');
  expect(
    validateAuthoringModification(content(), selection, output(without)).differences[0]!.after,
  ).toBe('null');
  expect(() => validateAuthoringModification(empty, selection, output(without))).toThrow();
});

it('计划范围不能附带修改普通退出、仓位、成本、独立风险、来源和名称', () => {
  const changes: Partial<BacktestStrategy>[] = [
    { exit: { type: 'positionState', field: 'isOpen' } },
    { sizing: { type: 'percentOfEquity', percent: '0.5' } },
    { cost: { commissionRate: '0.001', slippageRate: '0.001' } },
    { risk: [{ type: 'fixedStop', percent: '0.03' }] },
    {
      signalSources: [
        { ...compiledAuthoringPlan(false).signalSources[0]!, priceCoordinate: 'actual' },
      ],
    },
    { name: '擅自重命名' },
  ];
  for (const change of changes)
    expect(() =>
      validateAuthoringModification(
        content(),
        selection,
        output({ ...compiledAuthoringPlan(true), ...change }),
      ),
    ).toThrow('建议改变了授权范围以外的规则');
});

it('完整32档计划的差异可审核，不被短摘要长度截断', () => {
  const after = compiledAuthoringPlan(false);
  after.tradePlan!.stages = Array.from({ length: 32 }, (_, n) => ({
    id: `stage-${n}`,
    trigger: { kind: 'gainPercent' as const, value: '0.1' },
    action: { kind: 'reduce' as const, basis: 'remainingQuantity' as const, fraction: '0.01' },
  }));
  const result = validateAuthoringModification(content(), selection, output(after));
  expect(result.differences[0]!.after.length).toBeGreaterThan(2000);
  expect(() =>
    authoringProposalInputSchema.parse({
      operationId: 'f45f2e70-96c2-4d50-a5a1-88f2373f5f35',
      expectedRevision: 1,
      intent: selection.intent,
      allowedPaths: result.allowedPaths,
      beforeText: content().definitionText,
      afterText: JSON.stringify(after),
      differences: result.differences,
    }),
  ).not.toThrow();
});
