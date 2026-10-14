import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalApi } from './market-route-failover-acceptance.mjs';
import { localOrigin } from './market-status-functional-acceptance.mjs';
import { createCompositionCase } from './market-composition-target-case.mjs';
import { verifyCompositionJob } from './market-composition-target-acceptance.mjs';

const source = process.argv[2];
assert(source, '需要已恢复的成功运行原记录');
const record = JSON.parse(await fs.readFile(source, 'utf8'));
const origin = localOrigin(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000');
assert(record.origin === origin && record.phase === 'restored' && record.owned === false &&
  record.runStatus === 'succeeded' && typeof record.runId === 'string', '不接受未知提交或不明恢复');
const api = createLocalApi(origin);
const plan = createCompositionCase(await api.get('/api/market-data/policy'),
  (await api.get('/api/market-data/providers')).providers,
  await api.get('/api/market-data/routes/capabilities?contractVersion=3'));
assert.equal(plan.baseline.revision, record.restoredRevision);
assert.equal(plan.baselineFingerprint, record.plan.baselineFingerprint);
assert.deepEqual(plan.configVersions, record.plan.configVersions);
const job = await api.get(`/api/v1/backtests/runs/${record.runId}`);
assert(job.id === record.runId && job.idempotencyKey === record.idempotencyKey &&
  job.strategyVersionId === record.strategyVersionId, '原成功Run身份必须一致');
assert.deepEqual(job.runConfig, record.preparation.runConfig);
const proof = verifyCompositionJob(job, record.input.intent.runConfig.executionModel);
const destination = path.join(await fs.mkdtemp(path.join(tmpdir(), 'tl-composition-success-')), 'verified-success.json');
await fs.writeFile(destination, JSON.stringify({ originalRecoveryRecord: path.resolve(source),
  checkedAt: new Date().toISOString(), policyRevision: plan.baseline.revision,
  configVersions: plan.configVersions, proof }, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ record: destination, originalRecordUnchanged: true, ...proof,
  boundary: '仅原API只读成功补证；partial及警示保持，不重跑Run或改写冻结' }));
