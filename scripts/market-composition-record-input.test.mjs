import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newCompositionInputAfterFailure, resumeCompositionInput, advanceCompositionRecordAfterResponse } from './market-composition-record-input.mjs';
import { createCompositionTargetInput } from './market-composition-target-input.mjs';

test('显式新案例只复用已确认失败的原版本/输入，旧接续仍拒绝已建Run', async () => {
  const input = await createCompositionTargetInput('2026-10-11T00:00:00Z');
  const record = { phase: 'restored', owned: false, restoredRevision: 99,
    plan: { caseVersion: 1, baselineFingerprint: 'original', configVersions: { baostock: 0 } },
    preparation: { status: 'prepared', runConfig: input.intent.runConfig },
    strategyId: 'strategy', strategyVersionId: 'version', input,
    runId: 'old-run', idempotencyKey: 'old-key', runStatus: 'failed', errorCode: 'DATA_UNAVAILABLE' };
  const plan = { baseline: { revision: 99 }, baselineFingerprint: 'original', configVersions: { baostock: 0 } };
  const strategies = [{ id: 'strategy', versions: [{ id: 'version', schema: input.strategy }] }];
  const previousRun = { id: 'old-run', strategyVersionId: 'version', idempotencyKey: 'old-key',
    status: 'failed', errorCode: 'DATA_UNAVAILABLE', runConfig: input.intent.runConfig,
    snapshotManifest: null, result: null, resultChecksum: null };
  const before = structuredClone(record);
  const result = await newCompositionInputAfterFailure(record, plan, strategies, previousRun);
  assert.deepEqual(result.intent, input.intent);
  assert.equal(result.existingStrategy.versionId, 'version');
  assert.deepEqual(record, before, '旧记录不能清除Run来绕过接续守卫');
  await assert.rejects(resumeCompositionInput(record, plan, strategies));
  for (const mutate of [
    (r, j) => { delete r.runId; },
    (r, j) => { delete r.idempotencyKey; },
    (r, j) => { j.status = 'running'; },
    (r, j) => { j.status = 'succeeded'; },
    (r, j) => { j.id = 'other-run'; },
    (r, j) => { j.strategyVersionId = 'other-version'; },
    (r, j) => { j.idempotencyKey = 'other-key'; },
    (r, j) => { j.snapshotManifest = { contentHash: 'present' }; },
    (r, j) => { j.runConfig.initialCash.CNY = '999999'; },
    (r, j) => { r.restoredRevision = 98; },
    (r, j) => { r.plan.configVersions.baostock = 1; },
    (r, j) => { r.input.intent.runConfig.initialCash.CNY = '999999'; },
  ]) {
    const changed = structuredClone(record), job = structuredClone(previousRun);
    mutate(changed, job);
    await assert.rejects(newCompositionInputAfterFailure(changed, plan, strategies, job));
  }
});

test('已验证响应案例推进恢复旁证，未知提交/不连续代次/配置或路线变化仍拒绝', () => {
  const record = { origin: 'http://127.0.0.1:3000', phase: 'restored', owned: false,
    runStatus: 'failed', runId: 'old', idempotencyKey: 'key', restoredRevision: 107,
    plan: { baselineFingerprint: 'same', configVersions: { baostock: 0 } } };
  const response = { origin: record.origin, phase: 'verified', owned: false, restoredRevision: 109,
    plan: { caseVersion: 1, caseId: 'response-case', baseline: { revision: 107 }, temporary: { revision: 108 },
      baselineFingerprint: 'same', configVersions: { baostock: 0 } },
    proof: { observations: Array(5).fill({}), results: Array(5).fill({}) } };
  const before = structuredClone(record);
  const next = advanceCompositionRecordAfterResponse(record, response);
  assert.equal(next.restoredRevision, 109); assert.equal(next.originalRestoredRevision, 107);
  assert.deepEqual(record, before); assert.equal(next.runId, record.runId);
  for (const mutate of [
    (r) => { r.phase = 'restored'; }, (r) => { r.owned = true; },
    (r) => { r.restoredRevision++; }, (r) => { r.plan.baseline.revision--; },
    (r) => { r.plan.baselineFingerprint = 'changed'; }, (r) => { r.plan.configVersions.baostock++; },
    (r) => { r.proof.observations.pop(); },
  ]) { const changed = structuredClone(response); mutate(changed);
    assert.throws(() => advanceCompositionRecordAfterResponse(record, changed)); }
});
