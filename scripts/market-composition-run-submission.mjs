import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { runConfigSchemaV3 } from '../packages/schemas/dist/index.js';
import { desiredFromState, policyFingerprint } from './market-route-failover-case.mjs';

export const compositionRunConfirmationMs = 45000;
export const runSubmissionMayBeUnconfirmed = (error) =>
  ['TimeoutError', 'AbortError', 'TypeError', 'SyntaxError'].includes(error?.name);

export async function findSubmittedCompositionRun(api, request) {
  const summaries = await api.get('/api/v1/backtests/runs');
  assert(Array.isArray(summaries), '原Run摘要格式无效');
  const matches = [];
  for (const item of summaries.filter((j) => j.strategyVersionId === request.strategyVersionId)) {
    assert(/^[a-f0-9-]{36}$/.test(item.id), 'Run候选身份无效');
    const job = await api.get(`/api/v1/backtests/runs/${item.id}`);
    if (job.idempotencyKey !== request.idempotencyKey) continue;
    assert(job.id === item.id && job.strategyVersionId === request.strategyVersionId && job.mode === 'V3',
      '已提交Run身份不一致');
    assert.deepEqual(runConfigSchemaV3.parse(job.runConfig), runConfigSchemaV3.parse(request.runConfig),
      '已提交Run输入不一致');
    matches.push(job);
  }
  assert(matches.length <= 1, '同次幂等提交出现多个Run');
  return matches[0];
}

/** 仅有界GET确认一次既有提交；api应携带同一45秒AbortSignal，不允许POST重试。 */
export async function confirmCompositionRunSubmission(api, plan, request, journal,
  { now = Date.now, pause = wait } = {}) {
  const deadline = now() + compositionRunConfirmationMs;
  await journal({ phase: 'run_submission_unconfirmed', idempotencyKey: request.idempotencyKey,
    confirmationWindowMs: compositionRunConfirmationMs });
  while (now() < deadline) {
    const state = await api.get('/api/market-data/policy');
    assert(state.revision === plan.temporary.revision && state.dsaRevision === state.revision &&
      state.syncState === 'applied' && !state.effectiveStale &&
      policyFingerprint(desiredFromState(state)) === plan.temporaryFingerprint, '提交确认期间政策所有权变化');
    const { providers } = await api.get('/api/market-data/providers');
    for (const [providerId, configVersion] of Object.entries(plan.configVersions)) {
      const provider = providers.find((p) => p.providerId === providerId);
      assert(provider?.enabled && provider.configVersion === configVersion, '提交确认期间来源配置变化');
    }
    const job = await findSubmittedCompositionRun(api, request);
    if (job) {
      await journal({ phase: 'run_submission_confirmed', runId: job.id,
        runStatus: job.status, confirmedBy: 'original-run-detail' });
      return job;
    }
    // 无摘要/明细匹配仅表示尚未观察到，不判定缺失或重新提交。
    await pause(Math.min(1000, Math.max(0, deadline - now())));
  }
  await journal({ phase: 'run_submission_still_unconfirmed' });
  throw new Error('Run提交确认窗口结束；保留幂等键，不重试提交');
}
