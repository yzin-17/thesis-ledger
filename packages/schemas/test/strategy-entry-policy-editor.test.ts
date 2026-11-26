import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { projectStrategyEntryPolicyForEditing } from '../src/strategy-entry-policy-editor.js';
import { backtestRunResponseSchemaV3 } from '../src/backtest-run.js';

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/strategy-authoring.exchange.json', import.meta.url), 'utf8'));
it.each([false, true])('旧定义进入编辑时固定原政策，仅加减保护后保持；原计划=%s', (plan) => {
  const old = fixture();
  if (plan) old.tradePlan = { version: 1, evaluation: 'barClose', stages: [], initialStop: { kind: 'percent', percent: '0.05' } };
  const original = structuredClone(old);
  const draft = projectStrategyEntryPolicyForEditing(old);
  expect(draft.entryTrigger).toBe(plan ? 'while-flat' : 'rising-edge');
  const changed = { ...draft, tradePlan: { version: 1, evaluation: 'barClose', stages: [] } };
  expect(projectStrategyEntryPolicyForEditing(changed).entryTrigger).toBe(draft.entryTrigger);
  expect(old).toEqual(original);
});
it('恢复旧本机草稿时使用原版本政策，不从已修改保护反推', () => {
  const old = fixture();
  const draft = { ...old, tradePlan: { version: 1, evaluation: 'barClose', stages: [], initialStop: { kind: 'percent', percent: '0.05' } } };
  expect(projectStrategyEntryPolicyForEditing(draft, old).entryTrigger).toBe('rising-edge');
});
it('不覆盖显式政策，不替非法草稿猜测原行为', () => {
  expect(projectStrategyEntryPolicyForEditing({ entryTrigger: 'invalid' })).toEqual({ entryTrigger: 'invalid' });
  expect(projectStrategyEntryPolicyForEditing({ tradePlan: {} })).toEqual({ tradePlan: {} });
});
it.each(['preparing', 'freezing', 'simulating', 'analyzing'])('普通Run读取接受%s阶段及明确关联父Run', (stage) => {
  expect(backtestRunResponseSchemaV3.parse({ id: 'new', strategyVersionId: 'v', mode: 'frozen', status: 'running', stage,
    replayOfRunId: '11111111-1111-4111-8111-111111111111' })).toMatchObject({ stage });
});
