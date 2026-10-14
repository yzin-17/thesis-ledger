import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createCompositionTargetInput, compositionScope } from './market-composition-target-input.mjs';

test('原策略/准备/执行模型Schema组成隔离固定快照输入，不切换原价或历史重建', async () => {
  const { strategy, intent } = await createCompositionTargetInput('2026-10-11T00:00:00Z');
  assert.equal(strategy.executionInstrument.symbol, compositionScope.symbol);
  assert.equal(strategy.entry.right.params.period, 1);
  assert.deepEqual(intent.history, { basis: 'fixed-provider-snapshot' });
  assert.equal(intent.accountingBasis, 'normalized-series');
  assert.equal(intent.adjustment, 'qfq');
  assert.equal(intent.warmupBudgetSessions, 1);
  assert.equal(intent.freezeTimePolicy, 'after-acquisition');
  assert.equal(intent.runConfig.startDate, compositionScope.start);
  assert.equal(intent.runConfig.endDate, compositionScope.end);
});

test('复用原研究收费/结算设置，不把原fixture数据或价格注入业务读取', async () => {
  const baseline = JSON.parse(await readFile(new URL('../packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url), 'utf8'));
  const { intent } = await createCompositionTargetInput('2026-10-11T00:00:00Z');
  const actual = intent.runConfig.executionModel.segments[0];
  assert.deepEqual(actual.fees, baseline.segments[0].fees);
  assert.deepEqual(actual.settlement, baseline.segments[0].settlement);
  assert.equal(actual.execution.normalizedExecution.feeBasis, 'simulatedTurnover');
  assert.equal(intent.runConfig.executionPriceProtocol, undefined);
  assert.equal(intent.runConfig.frozenExecutionWindow, undefined);
  assert.equal(intent.runConfig.lifecyclePreparation, undefined);
});
