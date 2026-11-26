import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import {
  investmentSnapshot,
  rowHash,
  verifyInvestmentFills,
  type FrozenInvestmentInput,
} from './investment-budget-frozen.fixture.js';
import { verifyInvestmentPlan } from './investment-budget-intents.fixture.js';

const directory = process.env.INVESTMENT_AI_DIRECTORY;
const capture = process.env.INVESTMENT_AI_REJECTED_CAPTURE;

it.skipIf(!directory || !capture)(
  '原样回放被拒绝的模型加仓阈值，诊断不能冒充加仓验收',
  async () => {
    assert(/^[a-z0-9-]+$/.test(capture!));
    const root = resolve(directory!);
    const source = JSON.parse(
      readFileSync(resolve(root, 'input.json'), 'utf8'),
    ) as FrozenInvestmentInput;
    const records = JSON.parse(readFileSync(resolve(root, capture!, 'records.json'), 'utf8'));
    const configuration = JSON.parse(
      readFileSync(resolve(root, capture!, 'add-configuration.json'), 'utf8'),
    );
    const experiment = records.experiments.find(
      (e: { name: string }) => e.name === '投入上限真实验收 add',
    );
    assert(experiment);
    const attempt = records.attempts.find(
      (a: { experimentId: string; status: string }) =>
        a.experimentId === experiment.id && a.status === 'succeeded',
    );
    assert(attempt);
    const ai = records.aiRuns.find((a: { id: string }) => a.id === attempt.aiRunId);
    assert(ai?.result?.strategy);
    const strategy = ai.result.strategy as BacktestStrategy;
    assert.deepEqual(strategy, configuration.strategy);
    // 保留原输出，先断言严格意图检查拒绝，再单独观察该配置的实际成交。
    expect(() => verifyInvestmentPlan('add', strategy)).toThrow();
    expect(strategy.tradePlan?.stages[0]?.trigger).toEqual({ kind: 'gainPercent', value: '0.5' });
    const output = resolve(root, 'rejected-add-diagnostic');
    mkdirSync(output, { mode: 0o700 });
    const runId = randomUUID();
    const snapshot = await investmentSnapshot(
      source,
      resolve(output, 'snapshot'),
      runId,
      randomUUID(),
      strategy,
    );
    const result = await snapshot.run();
    expect(await snapshot.run()).toEqual(result);
    const verification = verifyInvestmentFills(
      strategy,
      snapshot.rows,
      result.simulationFills,
      source.job.runConfig.initialCash.HKD!,
    );
    const report = {
      acceptanceStatus: 'rejected',
      reason: '上涨0.5%应编码0.005，模型原样编码0.5表示50%；诊断回放不能证明请求的加仓计划通过',
      diagnosticOnly: true,
      persistedProductVersion: false,
      newModelCalls: 0,
      sourceExperimentId: experiment.id,
      sourceAiRunId: ai.id,
      strategyHash: rowHash(strategy),
      strategy,
      result,
      verification,
      executionRowsHash: source.executionRowsHash,
      comparableDataFingerprint: snapshot.manifest.comparableDataFingerprint,
    };
    writeFileSync(resolve(output, 'audit.json'), JSON.stringify(report, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    console.log(
      JSON.stringify({
        acceptanceStatus: report.acceptanceStatus,
        newModelCalls: 0,
        checkedBuys: verification.checkedBuys,
        additions: verification.additions,
        totalFills: verification.totalFills,
      }),
    );
  },
  120000,
);
