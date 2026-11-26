import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import { dailyModelCases, dailyModelIssues, dailyModelSnapshot, dailyModelExecutionIssues, fixedDailyModelCase, dailyModelContent, dailyModelBaseline, dailyModelModification } from './daily-order-model.fixture.js';
import { validateAuthoringGeneration } from '../../src/strategy-authoring/authoring-semantics.js';
import { validateAuthoringModification } from '../../src/strategy-authoring/authoring-modification.js';
import { authoringOperationSchema } from '../../src/strategy-authoring/authoring-operation-schema.js';

it.each(dailyModelCases)('固定成对样本 $id：正式冻结 Worker、完整回放和配置中文', async sample => {
  const root = await mkdtemp(join(tmpdir(), 'daily-model-fixed-'));
  try {
    const s = await fixedDailyModelCase(sample);
    expect(dailyModelIssues(sample, s)).toEqual([]);
    const f = await dailyModelSnapshot(root, sample, s), result = await f.run();
    expect(result.completeness).toBe('complete');
    expect(dailyModelExecutionIssues(sample, result.simulationFills)).toEqual([]);
    expect(await f.run()).toEqual(result);
    const chinese = backtestStrategyPlanReadback(s).join('\n');
    expect(chinese).toContain('日线委托模拟');
    if (sample.id === 'full-fill') expect(chinese).toContain('全部成交');
    if (sample.id === 'each-fill') expect(chinese).toContain('每次成交后按量保护');
    if (process.env.BACKTEST_DAILY_FIXED_CAPTURE_DIR) {
      const directory = process.env.BACKTEST_DAILY_FIXED_CAPTURE_DIR;
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(join(directory, sample.id + '.json'), JSON.stringify({ source: 'fixed', modelCalls: 0, intent: sample.intent, configuration: s, readback: backtestStrategyPlanReadback(s), result }, null, 2), { mode: 0o600, flag: 'wx' });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

it.each(dailyModelCases)('生成合同 $id：编写与限定范围修改能原样接受固定配置', async sample => {
  const proposal = ({ signalSources, ...strategy }: BacktestStrategy) => ({
    ...strategy,
    signalSources: signalSources.map(({ series: _series, ...source }) => source),
  });
  const expected = { ...await fixedDailyModelCase(sample), entryTrigger: 'while-flat' as const };
  const content = dailyModelContent(sample, expected, false);
  const raw = { definition: proposal(expected), coverage: [{ requirementId: 'rules', definitionPaths: ['entry', 'sizing', 'execution', 'tradePlan'] }] };
  const schema = authoringOperationSchema({ input: { content, selection: { kind: 'generate' } } } as never);
  const wire = { intentCheck: sample.intent, proposal: raw };
  expect(schema.parse(wire)).toEqual(wire);
  expect(proposal(validateAuthoringGeneration(content, wire).definition)).toEqual(raw.definition);
  const before = { ...await dailyModelBaseline(sample), entryTrigger: 'while-flat' as const };
  const selection = dailyModelModification(sample);
  const after = { ...before, [selection.modificationTarget]: expected[selection.modificationTarget] };
  const modified = validateAuthoringModification(dailyModelContent(sample, before, true), selection, { ...raw, definition: proposal(after) });
  expect(proposal(modified.definition)).toEqual(proposal(after));
  expect(dailyModelIssues(sample, modified.definition)).toEqual([]);
});

it('模型验收比较数值含义，保留等值小数原文，不将表达精度判为误选', async () => {
  const sample = dailyModelCases.find(s => s.id === 'each-fill')!;
  const s = await fixedDailyModelCase(sample);
  s.sizing = { type: 'percentOfEquity', percent: '0.30' };
  if (s.execution.timing !== 'dailyBarOrders') throw new Error('fixture');
  s.execution.orders.find(o => o.action.kind === 'stopLoss')!.order = { kind: 'stopMarket', price: { type: 'constant', value: '9.0000' } };
  const before = JSON.stringify(s);
  expect(dailyModelIssues(sample, s)).toEqual([]);
  expect(JSON.stringify(s)).toBe(before);
});
