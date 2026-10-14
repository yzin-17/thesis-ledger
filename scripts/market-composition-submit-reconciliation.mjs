import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalApi } from './market-route-failover-acceptance.mjs';
import { localOrigin } from './market-status-functional-acceptance.mjs';
import { createCompositionCase } from './market-composition-target-case.mjs';
import { findSubmittedCompositionRun } from './market-composition-run-submission.mjs';
import { newCompositionInputAfterFailure, advanceCompositionRecordAfterResponse } from './market-composition-record-input.mjs';

const source = process.argv[2];
assert(source, '需要本次已恢复、提交不明的原记录');
let record = JSON.parse(await fs.readFile(source, 'utf8'));
const responseIndex = process.argv.indexOf('--after-response-record');
const responseSource = responseIndex < 0 ? undefined : process.argv[responseIndex + 1];
if (responseSource) record = advanceCompositionRecordAfterResponse(record,
  JSON.parse(await fs.readFile(responseSource, 'utf8')));
const origin = localOrigin(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000');
assert(record.origin === origin && record.owned === false && record.phase === 'restored' &&
  (!record.runId || responseSource) && typeof record.idempotencyKey === 'string', '只读补证不能改写已有Run或不明恢复');
const api = createLocalApi(origin), state = await api.get('/api/market-data/policy');
const providers = await api.get('/api/market-data/providers');
const catalog = await api.get('/api/market-data/routes/capabilities?contractVersion=3');
const plan = createCompositionCase(state, providers.providers, catalog);
const job = await findSubmittedCompositionRun(api, { strategyVersionId: record.strategyVersionId,
  idempotencyKey: record.idempotencyKey, runConfig: record.preparation?.runConfig });
assert(job, '尚未确认提交，保留原记录，不宣称缺失或创建另一Run');
const confirmed = { ...record, runId: job.id, runStatus: job.status, errorCode: job.errorCode,
  originalRecoveryRecord: path.resolve(source), ...(responseSource ? { responseRecoveryRecord: path.resolve(responseSource) } : {}),
  confirmation: { kind: 'read-only-run-detail', checkedAt: new Date().toISOString() } };
await newCompositionInputAfterFailure(confirmed, plan, await api.get('/api/v1/backtests/strategies'), job);
const destination = path.join(await fs.mkdtemp(path.join(tmpdir(), 'tl-composition-confirmed-')), 'confirmed-submission.json');
await fs.writeFile(destination, JSON.stringify(confirmed, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ record: destination, originalRecordUnchanged: true, runId: job.id,
  status: job.status, policyRevision: plan.baseline.revision, boundary: '仅原API只读确认及新0600旁证文件，无政策/Run变更或重试' }));
