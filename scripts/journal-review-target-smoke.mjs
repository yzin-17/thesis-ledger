import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { ThesisLedgerApiClient, ThesisLedgerApiError } from '../packages/api-client/dist/index.js';
import { createExecutionCommandSchema } from '../packages/schemas/dist/index.js';

const base = 'http://127.0.0.1:3000/api/v1';
const args = process.argv.slice(2);
assert(
  args.length === 1 && args[0] === '--create-fixture',
  '本入口仅用于显式创建本机开发复盘验收账户：--create-fixture',
);
const client = new ThesisLedgerApiClient(base);
const request = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
  const response = await fetch(`${base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const value = await response.json();
  assert(response.ok, `${method} ${path} ${response.status}: ${JSON.stringify(value)}`);
  return value;
};
const rawHash = async (path) => {
  const response = await fetch(`${base}${path}`);
  assert(response.ok);
  return createHash('sha256')
    .update(await response.text())
    .digest('hex');
};
const protectedIds = [
  '0e9677d2-98c6-45b1-8bc3-8d07b9209180',
  '93337db7-a5a0-40c5-823f-63577e9e924b',
];
const before = await Promise.all(protectedIds.map((id) => rawHash(`/ledger/${id}/events`)));
assert.equal((await request('/health')).status, 'healthy');
const account = await request('/accounts', {
  name: `复盘验收 2026-10-04 ${randomUUID().slice(0, 8)}`,
  type: 'securities',
  mode: 'actual',
  currency: 'CNY',
  institution: '本机开发固定输入验收',
});
console.log(JSON.stringify({ stage: '已创建独立验收账户', accountId: account.id }));
const prefix = randomUUID();
const execution = (side, quantity, price, day, label) =>
  createExecutionCommandSchema.parse({
    command: 'CREATE_EXECUTION',
    accountId: account.id,
    side,
    occurredAt: `2026-01-0${day}T09:00:00Z`,
    timePrecision: 'INSTANT',
    sourceTimezone: 'UTC',
    economicOrderKey: `${day}-${label}`,
    actorId: 'journal-target-acceptance',
    source: {
      category: 'MANUAL',
      channel: 'journal-target-acceptance',
      externalId: `${prefix}-${label}`,
    },
    payload: {
      symbol: '600519.SH',
      quantity,
      price,
      currency: 'CNY',
      capabilityVerification: 'VERIFIED',
      charges: [
        { category: 'COMMISSION', amount: side === 'BUY' ? '0.2' : '0.1', currency: 'CNY' },
      ],
    },
  });
await client.ledger.createExecution(execution('BUY', '2.000000000000000001', '10', 1, 'buy'));
await client.ledger.createExecution(execution('SELL', '1', '12', 2, 'sell-1'));
const sell = await client.ledger.createExecution(
  execution('SELL', '1.000000000000000001', '13', 3, 'sell-2'),
);
const scope = { accountId: account.id, mode: 'actual' };
const page = await client.journalReviews.candidates(scope);
assert.equal(page.items.length, 3);
const cycle = page.items.find((row) => row.input.reference.reviewObjectType === 'TRADE_CYCLE');
assert(cycle);
const plan = await request('/journal/plans', {
  accountId: account.id,
  tradeId: cycle.input.reference.tradeId,
  symbol: '600519.SH',
  plannedEntry: 10,
  plannedExit: 13,
  stopLoss: 9,
  expectedHoldingDays: 2,
  thesis: '复盘验收固定计划',
});
const note = await request('/journal/entries', {
  accountId: account.id,
  symbol: '600519.SH',
  ledgerEventId: sell.eventIds[0],
  tradePlanId: plan.id,
  entryType: 'trade',
  side: 'sell',
  reason: '复盘验收固定说明',
  notes: '初始说明',
});
const candidate = await client.journalReviews.object({
  ...scope,
  reviewObjectId: cycle.input.reference.reviewObjectId,
});
assert.equal(candidate.input.trade.sourceQuantity, '2.000000000000000001');
const review = {
  ...scope,
  reference: candidate.input.reference,
  evidenceFingerprint: candidate.input.projection.evidenceFingerprint,
  analysisDraft: { stopLoss: '8', note: '本次验收草稿' },
};
const ownLedgerBefore = await rawHash(`/ledger/${account.id}/events`);
const result = await client.journalReviews.analyze(review);
assert.equal(result.result.metrics.netRealizedPnl.value, '4.6');
assert.equal(result.result.metrics.counterfactualNetPnl.value, '-4.4');
assert.equal(result.candidate.input.plan.stopLoss, '9');
const saveRequest = { ...review, expectedAlgorithmVersion: result.result.algorithmVersion };
const saved = await client.journalReviews.save(saveRequest);
assert.equal(saved.compatibility, 'CURRENT_CONTRACT');
assert.equal(saved.snapshot.status, 'CURRENT');
assert.deepEqual(
  (await client.journalReviews.snapshot(saved.snapshot.id, scope)).snapshot.outputSnapshot,
  saved.snapshot.outputSnapshot,
);
const period = await client.journalReviews.period({
  ...scope,
  start: '2026-01-02T09:00:00Z',
  end: '2026-01-04T09:00:00Z',
});
assert.equal(period.result.tradeCycles.includedObjectIds.length, 1);
assert.equal(period.result.closeSlices.includedObjectIds.length, 2);
const endExcluded = await client.journalReviews.candidates({
  ...scope,
  start: '2026-01-02T09:00:00Z',
  end: '2026-01-03T09:00:00Z',
});
assert.equal(endExcluded.items.length, 1);
assert.equal(endExcluded.items[0].input.reference.reviewObjectType, 'CLOSE_SLICE');
const settings = await request('/ai/settings');
let missingModel = '已配置默认，未调用真实 Provider';
if (settings.researchDefault === null) {
  const historyBefore = await rawHash('/ai/runs?view=research&limit=100');
  for (const submit of [
    () => client.journalReviews.explain(saveRequest),
    () =>
      client.journalReviews.explainPeriod({
        ...scope,
        start: period.result.window.start,
        end: period.result.window.end,
        expectedLedgerRevision: period.ledgerRevision,
        expectedProjectionGeneration: period.projectionGeneration,
        expectedAlgorithmVersion: period.result.algorithmVersion,
        objectFingerprints: Object.fromEntries(
          period.candidates.map((row) => [
            row.input.reference.reviewObjectId,
            row.input.projection.evidenceFingerprint,
          ]),
        ),
      }),
  ])
    await assert.rejects(
      submit,
      (error) =>
        error instanceof ThesisLedgerApiError &&
        error.status === 400 &&
        error.payload?.message?.includes('研究默认模型'),
    );
  assert.equal(await rawHash('/ai/runs?view=research&limit=100'), historyBefore);
  missingModel = '单笔/周期均明确拒绝，研究历史不变';
}
await request(
  `/journal/entries/${note.id}`,
  { notes: '验收明确修订说明，旧快照必须保持历史结果' },
  'PATCH',
);
const stale = await client.journalReviews.snapshot(saved.snapshot.id, scope);
assert.equal(stale.snapshot.status, 'STALE');
assert.deepEqual(stale.snapshot.outputSnapshot, saved.snapshot.outputSnapshot);
await assert.rejects(
  () => client.journalReviews.save(saveRequest),
  (error) => error instanceof ThesisLedgerApiError && error.status === 409,
);
await assert.rejects(
  () =>
    client.journalReviews.object({
      ...scope,
      mode: 'shadow',
      reviewObjectId: cycle.input.reference.reviewObjectId,
    }),
  (error) => error instanceof ThesisLedgerApiError && error.status === 404,
);
assert.equal(await rawHash(`/ledger/${account.id}/events`), ownLedgerBefore);
assert.deepEqual(
  await Promise.all(protectedIds.map((id) => rawHash(`/ledger/${id}/events`))),
  before,
);
assert.equal((await request('/health')).status, 'healthy');
console.log(
  JSON.stringify({
    stage: '目标 HTTP 验收通过',
    accountId: account.id,
    reviewObjectId: cycle.input.reference.reviewObjectId,
    snapshotId: saved.snapshot.id,
    quantity: candidate.input.trade.sourceQuantity,
    netRealizedPnl: result.result.metrics.netRealizedPnl.value,
    counterfactualNetPnl: result.result.metrics.counterfactualNetPnl.value,
    periodTradeCycles: 1,
    periodCloseSlices: 2,
    snapshotStatus: stale.snapshot.status,
    missingModel,
    protectedLedgerHashes: before,
    browserUrl: `http://127.0.0.1:5177/journal?accountId=${account.id}&mode=actual&reviewObjectId=${encodeURIComponent(cycle.input.reference.reviewObjectId)}`,
  }),
);
