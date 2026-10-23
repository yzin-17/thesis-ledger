import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { sourceState } from '../../thesis-ledger-infra/scripts/research-dual-read.mjs';
import { sql } from '../../thesis-ledger-infra/scripts/research-state-backup.mjs';
import { frozenSnapshotInputs } from '../apps/server/dist/src/performance/performance-snapshot-inputs.js';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { Prisma } = require('@prisma/client');
export const officialJobId = '00000000-0000-4000-8000-000000000013';
const pendingPredicate = `t.source='DAILY_CLOSE' AND t."valuationBasis"='ESTIMATED'
  AND t.status='VALID' AND NOT EXISTS(SELECT 1 FROM "PortfolioSnapshot" successor
    WHERE successor."supersedesSnapshotId"=t.id)`;

export function readAutomationConsumer(accountId) {
  if (accountId) assert.match(accountId, /^[a-f0-9-]{36}$/);
  const state = sourceState();
  return sql(
    state.containers.postgres.Id,
    `\\set ON_ERROR_STOP on
    BEGIN READ ONLY;
    SELECT json_build_object(
      'job',(SELECT to_jsonb(t) FROM "AutomationJob" t WHERE id='${officialJobId}'),
      'runs',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb)
        FROM "AutomationRun" t WHERE "jobId"='${officialJobId}'),
      'leases',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY "runId"),'[]'::jsonb)
        FROM "AutomationRunLease" t WHERE "jobId"='${officialJobId}'),
      'pending',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'accountId',t."accountId") ORDER BY t.id),'[]'::jsonb)
        FROM "PortfolioSnapshot" t WHERE ${pendingPredicate}),
      'snapshots',${
        accountId
          ? `(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY revision),'[]'::jsonb)
        FROM "PortfolioSnapshot" t WHERE "accountId"='${accountId}')`
          : `'[]'::jsonb`
      });
    COMMIT;`,
  );
}

export function assertAutomationReady(state, accountId, estimateId) {
  assert.equal(state.job.id, officialJobId);
  assert.equal(state.job.systemKey, 'snapshot-official-reconcile');
  assert.equal(state.job.type, 'snapshot-official-reconcile');
  assert.equal(state.job.enabled, true);
  assert.equal(state.job.managed, true);
  assert.equal(state.job.retryPolicy.maxAttempts, 3);
  assert(
    !state.runs.some((row) => ['queued', 'running'].includes(row.status)),
    '受管任务已有在途运行',
  );
  assert.deepEqual(
    state.pending,
    accountId ? [{ id: estimateId, accountId }] : [],
    '全局待校准范围不属于本案例，禁止立即运行',
  );
}

export function verifyAutomationConsumer(before, prepared, after, record) {
  assertAutomationReady(prepared, record.account.id, record.estimate.estimate.id);
  assert.deepEqual(after.pending, []);
  assert.deepEqual(prepared.job, before.job);
  assert.deepEqual(after.job, before.job, '任务配置或计划被改变');
  const previous = new Map(before.runs.map((row) => [row.id, row]));
  for (const row of before.runs)
    assert.deepEqual(
      after.runs.find((item) => item.id === row.id),
      row,
      '旧运行记录被改写',
    );
  for (const row of before.leases)
    assert.deepEqual(
      after.leases.find((item) => item.runId === row.runId),
      row,
      '旧所有权记录被改写',
    );
  const added = after.runs.filter((row) => !previous.has(row.id));
  assert.equal(added.length, 1);
  const run = added[0];
  assert.equal(run.status, 'succeeded');
  assert.equal(run.attempt, 1, '不以服务重试隐藏首次消费失败');
  assert(run.finishedAt && run.traceId && run.error === null);
  assert.equal(run.output.scanned, 1);
  assert.deepEqual(run.output.pending, []);
  const lease = after.leases.find((row) => row.runId === run.id);
  assert(lease);
  assert.equal(after.leases.length, before.leases.length + 1);
  assert.equal(lease.trigger, 'manual');
  assert.equal(lease.executionAttempt, 1);
  assert.equal(lease.leaseUntil, null);
  assert.equal(lease.scheduledAt, null);
  assert.equal(prepared.snapshots.length, 1);
  assert.equal(after.snapshots.length, 2);
  assert.deepEqual(after.snapshots[0], prepared.snapshots[0], '原估算发生改写');
  const estimate = prepared.snapshots[0],
    official = after.snapshots[1];
  assert.equal(official.accountId, record.account.id);
  assert.equal(official.revision, 2);
  assert.equal(official.supersedesSnapshotId, estimate.id);
  assert.equal(official.sourceRef, `reconcile:${estimate.id}`);
  assert.equal(official.valuationBasis, 'OFFICIAL');
  assert.equal(official.valuationStatus, 'COMPLETE');
  assert.deepEqual(run.output.reconciled, [official.id]);
  assert.deepEqual(frozenSnapshotInputs(official), frozenSnapshotInputs(estimate));
  const marketValue = new Prisma.Decimal(record.latest.unitNav).mul(100);
  assert(new Prisma.Decimal(official.marketValue).eq(marketValue));
  assert(new Prisma.Decimal(official.cashValue).eq(875));
  assert(new Prisma.Decimal(official.costValue).eq(125));
  assert(new Prisma.Decimal(official.totalValue).eq(marketValue.plus(875)));
  const position = official.payload.positions[0];
  assert.equal(position.symbol, '161725.OF');
  assert.equal(position.provider, 'efinance');
  return {
    passed: true,
    runId: run.id,
    officialId: official.id,
    originalSnapshotUnchanged: true,
    oldHistoryUnchanged: true,
    realModelRequests: 0,
  };
}
