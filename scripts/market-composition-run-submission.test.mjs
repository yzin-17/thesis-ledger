import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { createCompositionTargetInput } from './market-composition-target-input.mjs';
import { confirmCompositionRunSubmission, runSubmissionMayBeUnconfirmed } from './market-composition-run-submission.mjs';
import { policyFingerprint } from './market-route-failover-case.mjs';

async function fixture() {
  const input = await createCompositionTargetInput('2026-10-11T00:00:00Z');
  const protocol = JSON.parse(await fs.readFile(new URL('../packages/schemas/fixtures/execution-price.normalized-snapshot.json', import.meta.url), 'utf8'));
  const request = { strategyVersionId: 'version', idempotencyKey: 'one-submit',
    runConfig: { ...input.intent.runConfig, schemaVersion: '3', executionPriceProtocol: protocol } };
  const state = { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'case', revision: 100,
    enabled: true, routes: [], dsaRevision: 100, syncState: 'applied', effectiveStale: false };
  const plan = { temporary: state, temporaryFingerprint: policyFingerprint(state), configVersions: { baostock: 0 } };
  const providers = [{ providerId: 'baostock', enabled: true, configVersion: 0 }];
  const job = { id: '127f9d2a-e30f-4e34-b112-d5c5ea818e5f', strategyVersionId: 'version', mode: 'V3',
    idempotencyKey: 'one-submit', status: 'failed', runConfig: request.runConfig };
  const calls = [], records = [];
  let visible = false, clock = 0;
  const api = { get: async (p) => {
    calls.push(p);
    if (p.endsWith('/policy')) return structuredClone(state);
    if (p.endsWith('/providers')) return { providers: structuredClone(providers) };
    if (p.endsWith('/runs')) return visible ? [{ id: job.id, strategyVersionId: job.strategyVersionId }] : [];
    return structuredClone(job);
  } };
  return { api, request, plan, state, providers, job, calls, records,
    journal: async (r) => records.push(r), timing: { now: () => clock, pause: async () => { clock += 1000; visible = true; } },
    expire: { now: () => clock, pause: async () => { clock += 45000; } } };
}

test('提交未确认只GET等晚到明细，摘要无幂等键也能确认，同次没有POST重试', async () => {
  const h = await fixture();
  const job = await confirmCompositionRunSubmission(h.api, h.plan, h.request, h.journal, h.timing);
  assert.equal(job.id, h.job.id);
  assert.equal(h.records[0].phase, 'run_submission_unconfirmed');
  assert.equal(h.records.at(-1).phase, 'run_submission_confirmed');
  assert(h.calls.filter((p) => p.endsWith('/runs')).length === 2);
  assert(h.calls.every((p) => p.startsWith('/api/')));
});

test('确认截止保留不明而非缺失；政策/来源并行变化不继续读Run', async () => {
  const h = await fixture();
  await assert.rejects(confirmCompositionRunSubmission(h.api, h.plan, h.request, h.journal, h.expire), /确认窗口结束/);
  assert.equal(h.records.at(-1).phase, 'run_submission_still_unconfirmed');
  for (const mutate of [(c) => { c.state.revision++; }, (c) => { c.providers[0].configVersion++; }]) {
    const c = await fixture(); mutate(c);
    await assert.rejects(confirmCompositionRunSubmission(c.api, c.plan, c.request, c.journal, c.timing));
    assert(!c.calls.some((p) => p.endsWith('/runs')));
  }
});

test('同键错输入/身份拒绝，普通准备错误不进入提交确认', async () => {
  for (const mutate of [(c) => { c.job.runConfig.initialCash.CNY = '999999'; }, (c) => { c.job.mode = 'other'; }]) {
    const c = await fixture(); c.job.runConfig = structuredClone(c.job.runConfig); mutate(c);
    await assert.rejects(confirmCompositionRunSubmission(c.api, c.plan, c.request, c.journal, c.timing));
  }
  assert(runSubmissionMayBeUnconfirmed(new DOMException('synthetic', 'TimeoutError')));
  assert(!runSubmissionMayBeUnconfirmed(new Error('prepare rejected')));
});
