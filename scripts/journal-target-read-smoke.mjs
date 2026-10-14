import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ThesisLedgerApiClient } from '../packages/api-client/dist/index.js';

assert.equal(process.argv.length, 2, '本入口只读取目标，不接收提交参数');
const base = 'http://127.0.0.1:3000/api/v1';
const boundedFetch = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) });
const client = new ThesisLedgerApiClient(base, boundedFetch);
const accountId = '95bd7e1a-72df-4cd7-aae8-121d8545e5ea';
const scope = { accountId, mode: 'actual' };
async function read(path) {
  const response = await boundedFetch(`${base}${path}`);
  assert(response.ok, `读取失败：${path}，HTTP ${response.status}`);
  return response.json();
}
const expectedHashes = new Map([
  [
    '0e9677d2-98c6-45b1-8bc3-8d07b9209180',
    'eaea242e974b40f990a3411c2b5923aec363a537d4d4cb26c0d601bf8bc441e8',
  ],
  [
    '93337db7-a5a0-40c5-823f-63577e9e924b',
    '2789992acdb831c683de43ac26ca03691e7c74625e60b37fe58ab2e9d9e30464',
  ],
  [accountId, '3c9168af4691de88f7b5e3a4c29ec44b2c306fa3185b1000b9cdbb0abe0023e8'],
]);
const hashes = [];
for (const [id, expected] of expectedHashes) {
  const { instrumentDirectory, ...economic } = await read(`/ledger/${id}/events`);
  assert(instrumentDirectory !== undefined);
  const hash = createHash('sha256').update(JSON.stringify(economic)).digest('hex');
  assert.equal(hash, expected, `受保护账户 ${id} 的经济字段与 v2 验收基线不一致`);
  hashes.push({ accountId: id, hash });
}
const settings = await read('/ai/settings');
assert.equal(settings.revision, '2', '研究默认修订变化，保留当前配置并停止验收');
assert(settings.researchDefault);
const candidates = await client.journalReviews.candidates(scope);
assert.equal(
  candidates.items.filter((row) => row.input.reference.reviewObjectType === 'TRADE_CYCLE').length,
  1,
);
assert.equal(
  candidates.items.filter((row) => row.input.reference.reviewObjectType === 'CLOSE_SLICE').length,
  2,
);
const cycle = candidates.items.find(
  (row) => row.input.reference.reviewObjectType === 'TRADE_CYCLE',
);
assert(cycle);
const object = await client.journalReviews.object({
  ...scope,
  reviewObjectId: cycle.input.reference.reviewObjectId,
});
assert.equal(object.input.trade.netRealizedPnl, '4.600000000000000003');
const reports = [];
for (const [kind, id, count] of [
  ['object', 'e2c829d1-6ad6-4325-81bb-26e931047669', 7],
  ['period', '67e14795-2113-4174-b366-9c95db6ddb14', 3],
]) {
  const report =
    kind === 'object'
      ? await client.journalReviews.explanation(id, scope)
      : await client.journalReviews.periodExplanation(id, scope);
  assert.equal(report.status, 'succeeded');
  assert.equal(
    report.promptVersion,
    kind === 'object' ? 'journal-review-v2' : 'journal-period-review-v2',
  );
  assert(report.result);
  const citations = report.result.evidence.flatMap((row) => row.citations);
  assert.equal(citations.length, count);
  assert(citations.every((row) => row.sourceId && row.toolCallId));
  reports.push({
    kind,
    id,
    status: report.status,
    promptVersion: report.promptVersion,
    provider: report.provider,
    model: report.model,
    citations: citations.length,
  });
}
const history = await client.journalReviews.history({ ...scope, limit: 100 });
const current = history.items.filter((row) => row.compatibility === 'CURRENT_CONTRACT');
assert(current.length > 0);
const snapshot = await client.journalReviews.snapshot(current[0].snapshot.id, scope);
assert.equal(snapshot.compatibility, 'CURRENT_CONTRACT');
console.log(
  JSON.stringify({
    stage: 'journal-target-read',
    ledgerHashes: hashes,
    researchDefaultRevision: settings.revision,
    candidates: candidates.items.length,
    historyCount: history.items.length,
    readableSnapshot: current[0].snapshot.id,
    reports,
  }),
);
