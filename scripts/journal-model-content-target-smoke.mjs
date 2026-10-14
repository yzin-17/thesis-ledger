import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ThesisLedgerApiClient } from '../packages/api-client/dist/index.js';

assert.deepEqual(process.argv.slice(2), ['--submit-new-runs'], '必须显式授权两个新解读请求');
const base = 'http://127.0.0.1:3000/api/v1';
const accountId = '95bd7e1a-72df-4cd7-aae8-121d8545e5ea';
const scope = { accountId, mode: 'actual' };
const boundedFetch = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) });
const client = new ThesisLedgerApiClient(base, boundedFetch);
async function read(path) {
  const response = await boundedFetch(`${base}${path}`);
  assert(response.ok, `${path}: ${response.status}`);
  return response.json();
}
async function ledgerHash(id) {
  const { instrumentDirectory: ignored, ...economic } = await read(`/ledger/${id}/events`);
  assert(ignored !== undefined);
  return createHash('sha256').update(JSON.stringify(economic)).digest('hex');
}
const protectedIds = ['0e9677d2-98c6-45b1-8bc3-8d07b9209180', '93337db7-a5a0-40c5-823f-63577e9e924b', accountId];
const accounts = await read('/accounts');
assert(accounts.find((account) => account.id === accountId)?.name.startsWith('复盘验收 '));
const settings = await read('/ai/settings');
assert(settings.researchDefault, '保留当前默认；默认缺失时不修改配置');
const before = await Promise.all(protectedIds.map(ledgerHash));
const savedDefault = { revision: settings.revision, researchDefault: settings.researchDefault };
console.log(JSON.stringify({ stage: 'baseline', ...savedDefault, ledgerHashes: before }));
const records = [];
async function observe(initial, getter, kind) {
  let current = initial;
  const states = [current.status];
  console.log(JSON.stringify({ stage: 'submitted', kind, id: current.id, provider: current.provider, model: current.model }));
  const end = Date.now() + 300_000;
  while (['queued', 'running', 'cancel_requested'].includes(current.status) && Date.now() < end) {
    await delay(5000);
    current = await getter(current.id, scope);
    if (states.at(-1) !== current.status) states.push(current.status);
  }
  const report = current.result;
  const quality = current.status === 'succeeded' && report !== null && report.conclusion.trim().length >= 30
    && report.evidence.length > 0 && report.evidence.every((row) => row.claim.trim().length > 0 && row.citations.length > 0);
  records.push({ kind, id: current.id, states, status: current.status, errorCode: current.errorCode,
    provider: current.provider, model: current.model, promptVersion: current.promptVersion, structuralContentReady: quality,
    conclusion: report?.conclusion, evidence: report?.evidence, risks: report?.risks,
    unknowns: report?.unknowns, disclaimer: report?.disclaimer });
  console.log(JSON.stringify({ stage: 'observed', ...records.at(-1) }));
}
try {
  const candidates = await client.journalReviews.candidates(scope);
  const candidate = candidates.items.find((item) => item.input.reference.reviewObjectType === 'TRADE_CYCLE');
  assert(candidate, '固定验收账户缺少完整交易周期');
  const request = { ...scope, reference: candidate.input.reference,
    evidenceFingerprint: candidate.input.projection.evidenceFingerprint };
  const deterministic = await client.journalReviews.analyze(request);
  const single = await client.journalReviews.explain({ ...request, expectedAlgorithmVersion: deterministic.result.algorithmVersion });
  await observe(single, client.journalReviews.explanation, 'single');
  const period = await client.journalReviews.period({ ...scope, start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z' });
  const explanation = await client.journalReviews.explainPeriod({ ...scope, start: period.result.window.start,
    end: period.result.window.end, expectedLedgerRevision: period.ledgerRevision,
    expectedProjectionGeneration: period.projectionGeneration, expectedAlgorithmVersion: period.result.algorithmVersion,
    objectFingerprints: Object.fromEntries(period.candidates.map((row) => [row.input.reference.reviewObjectId, row.input.projection.evidenceFingerprint])) });
  await observe(explanation, client.journalReviews.periodExplanation, 'period');
} finally {
  assert.deepEqual(await Promise.all(protectedIds.map(ledgerHash)), before, '受保护账本经济字段发生变化');
  const afterSettings = await read('/ai/settings');
  assert.deepEqual({ revision: afterSettings.revision, researchDefault: afterSettings.researchDefault }, savedDefault,
    '执行期间默认配置发生变化');
  console.log(JSON.stringify({ stage: 'protected', default: settings.researchDefault, revision: settings.revision, ledgerHashes: before }));
}
assert(records.every((row) => row.structuralContentReady), '结构或引用门禁未全部通过；内容需按冻结事实逐项审核，保留新运行不自动重试');
