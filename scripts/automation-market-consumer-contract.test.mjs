import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  officialJobId,
  assertAutomationReady,
  verifyAutomationConsumer,
} from './automation-market-consumer-contract.mjs';

function fixture() {
  const accountId = 'owned-account',
    estimateId = 'estimate';
  const payload = {
    positions: [
      {
        symbol: '161725.OF',
        assetType: 'fund',
        quantity: 100,
        costPrice: 1.25,
        currency: 'CNY',
        provider: 'efinance',
      },
    ],
    cashByCurrency: [{ accountId, currency: 'CNY', amount: 875 }],
  };
  const estimate = {
    id: estimateId,
    accountId,
    baseCurrency: 'CNY',
    disclosureCoverage: 1,
    payload,
    revision: 1,
    valuationBasis: 'ESTIMATED',
  };
  const before = {
    job: {
      id: officialJobId,
      systemKey: 'snapshot-official-reconcile',
      type: 'snapshot-official-reconcile',
      enabled: true,
      managed: true,
      retryPolicy: { maxAttempts: 3 },
    },
    runs: [{ id: 'old', status: 'succeeded' }],
    leases: [{ runId: 'old', leaseUntil: null }],
    pending: [],
    snapshots: [],
  };
  const prepared = {
    ...structuredClone(before),
    pending: [{ id: estimateId, accountId }],
    snapshots: [estimate],
  };
  const official = {
    ...structuredClone(estimate),
    id: 'official',
    revision: 2,
    supersedesSnapshotId: estimateId,
    sourceRef: `reconcile:${estimateId}`,
    valuationBasis: 'OFFICIAL',
    valuationStatus: 'COMPLETE',
    marketValue: '54.06',
    cashValue: '875',
    costValue: '125',
    totalValue: '929.06',
  };
  const after = { ...structuredClone(before), snapshots: [structuredClone(estimate), official] };
  after.runs.push({
    id: 'new',
    status: 'succeeded',
    attempt: 1,
    traceId: 'trace',
    finishedAt: 'time',
    error: null,
    output: { scanned: 1, pending: [], reconciled: ['official'] },
  });
  after.leases.push({
    runId: 'new',
    trigger: 'manual',
    executionAttempt: 1,
    leaseUntil: null,
    scheduledAt: null,
  });
  return {
    before,
    prepared,
    after,
    record: { account: { id: accountId }, estimate: { estimate }, latest: { unitNav: 0.5406 } },
  };
}
test('仅一个自有待校准、一次持久终态、冻结输入及精确金额通过', () => {
  const { before, prepared, after, record } = fixture();
  assertAutomationReady(before);
  assert(verifyAutomationConsumer(before, prepared, after, record).passed);
});
for (const [name, mutate] of [
  [
    '旧账户待校准',
    (v) => {
      v.prepared.pending.push({ id: 'other', accountId: 'old-account' });
    },
  ],
  [
    '已有在途任务',
    (v) => {
      v.prepared.runs.push({ status: 'running' });
    },
  ],
  [
    '任务配置变化',
    (v) => {
      v.after.job.enabled = false;
    },
  ],
  [
    '旧历史改写',
    (v) => {
      v.after.runs[0].status = 'failed';
    },
  ],
  [
    '额外运行',
    (v) => {
      v.after.runs.push({ id: 'extra' });
    },
  ],
  [
    '内部重试',
    (v) => {
      v.after.runs[1].attempt = 2;
    },
  ],
  [
    '租约未释放',
    (v) => {
      v.after.leases[1].leaseUntil = 'future';
    },
  ],
  [
    '错误 owner',
    (v) => {
      v.after.leases[1].executionAttempt = 2;
    },
  ],
  [
    '旧估算改写',
    (v) => {
      v.after.snapshots[0].revision = 9;
    },
  ],
  [
    '重读当前清空仓位',
    (v) => {
      v.after.snapshots[1].payload.positions = [];
    },
  ],
  [
    '正式金额错误',
    (v) => {
      v.after.snapshots[1].totalValue = '0';
    },
  ],
  [
    '非真实来源',
    (v) => {
      v.after.snapshots[1].payload.positions[0].provider = 'fixture';
    },
  ],
])
  test(`拒绝${name}`, () => {
    const value = fixture();
    mutate(value);
    assert.throws(() =>
      verifyAutomationConsumer(value.before, value.prepared, value.after, value.record),
    );
  });
