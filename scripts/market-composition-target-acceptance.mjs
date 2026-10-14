import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { backtestRunPreparationRequestV3Schema, backtestRunPreparationResultV3Schema,
  backtestRunCreateSchemaV3, backtestResultSchemaV3 } from '../packages/schemas/dist/index.js';
import { createLocalApi } from './market-route-failover-acceptance.mjs';
import { localOrigin } from './market-status-functional-acceptance.mjs';
import { createCompositionCase, executeCompositionCase } from './market-composition-target-case.mjs';
import { createCompositionTargetInput, compositionScope } from './market-composition-target-input.mjs';
import { resumeCompositionInput, newCompositionInputAfterFailure } from './market-composition-record-input.mjs';
import { confirmCompositionRunSubmission, compositionRunConfirmationMs,
  runSubmissionMayBeUnconfirmed } from './market-composition-run-submission.mjs';
export { resumeCompositionInput } from './market-composition-record-input.mjs';

export function assertCompositionExecutionArgs(args, revision) {
  assert(args.includes('--execute') && args.includes('--authorized-composition-case'), '业务冻结与临时政策需本次精确授权');
  assert(args.includes(`--expected-policy=${revision}`), '政策已变化，停止执行');
}

export function verifyTwoSessionAnalytics(result, manifest) {
  assert.equal(manifest.status, 'finalized');
  assert.equal(manifest.quality.completeness, 'complete', '数据快照必须完整');
  assert.equal(result.completeness, 'partial', '两会话/零平仓按原指标可用性如实标partial');
  assert.equal(result.equityCurve.length, 2);
  assert.equal(result.trades.length, 0);
  const expected = { volatility: 'VOLATILITY_UNAVAILABLE', sharpe: 'SHARPE_UNAVAILABLE',
    winRate: 'NO_CLOSED_TRADES', profitFactor: 'NO_CLOSED_TRADES' };
  for (const [name, metric] of Object.entries(result.metrics)) {
    if (name in expected) assert.deepEqual(metric, { status: 'unavailable', reason: expected[name] });
    else assert.equal(metric.status, 'available', `本案例其他指标不能缺失:${name}`);
  }
  assert.deepEqual(Object.keys(result.metrics).filter((name) => result.metrics[name].status === 'unavailable').sort(),
    Object.keys(expected).sort());
}

export function verifyCompositionJob(job, model) {
  assert.equal(job.status, 'succeeded', '原Worker业务运行未成功');
  const result = backtestResultSchemaV3.parse(job.result);
  verifyTwoSessionAnalytics(result, job.snapshotManifest);
  assert.deepEqual(job.runConfig.executionModel, model, '原执行模型不能被来源结果改写');
  assert.equal(job.runConfig.executionPriceProtocol.accountingBasis, 'normalized-series');
  assert.equal(job.runConfig.executionPriceProtocol.history.basis, 'fixed-provider-snapshot');
  assert(job.snapshotManifest.statusComposition, '必须冻结新组合，不能只有旧聚合');
  assert.equal(job.snapshotManifest.tradingStatus, undefined, '新状态选择不得重复旧聚合');
  assert.equal(job.resultChecksum, result.resultChecksum);
  return { runId: job.id, resultChecksum: result.resultChecksum, snapshotId: job.snapshotId,
    contentHash: job.snapshotManifest.contentHash,
    statusComposition: job.snapshotManifest.statusComposition,
    artifactCount: job.snapshotManifest.artifacts.length, completeness: result.completeness };
}

export async function runCompositionBusiness(api, post, input, journal, pause = wait) {
  let created;
  if (input.existingStrategy) {
    created = { id: input.existingStrategy.id, versions: [{ id: input.existingStrategy.versionId }] };
    await journal({ phase: 'strategy_reused', input, strategyId: created.id,
      strategyVersionId: input.existingStrategy.versionId });
  } else {
    await journal({ phase: 'strategy_submission_prepared', input });
    created = await post('/api/v1/backtests/strategies', { name: `${input.strategy.name} ${input.intent.runConfig.dataAsOf}`,
      schema: input.strategy, description: '统一能力真实组合/冻结验收；独立新策略，不改真实Ledger或旧资产。' });
  }
  const strategyVersionId = created.versions?.[0]?.id;
  assert(typeof created.id === 'string' && typeof strategyVersionId === 'string', '策略提交未确认');
  await journal({ phase: 'strategy_created', strategyId: created.id, strategyVersionId });
  const request = backtestRunPreparationRequestV3Schema.parse({ ...input.intent, strategyVersionId });
  const prepared = backtestRunPreparationResultV3Schema.parse(await post('/api/v1/backtests/run-config/prepare', request));
  await journal({ phase: 'prepared_response', preparation: prepared });
  assert.equal(prepared.status, 'prepared', '原准备未通过，保留结果并恢复政策');
  assert.deepEqual(prepared.runConfig.executionModel, input.intent.runConfig.executionModel);
  const body = backtestRunCreateSchemaV3.parse({ contractVersion: 3, strategyVersionId,
    runConfig: prepared.runConfig, preparationStamp: prepared.executionPreflight.revisionStamp,
    idempotencyKey: `unified-composition-${randomUUID()}` });
  await journal({ phase: 'run_submission_prepared', idempotencyKey: body.idempotencyKey });
  let job = await post('/api/v1/backtests/runs', body);
  assert(typeof job.id === 'string', '运行提交未确认');
  const runId = job.id;
  await journal({ phase: 'run_created', runId });
  const deadline = Date.now() + 120000;
  while (['queued', 'running'].includes(job.status) && Date.now() < deadline) {
    await pause(1000);
    job = await api.get(`/api/v1/backtests/runs/${runId}`);
  }
  await journal({ phase: 'run_observed', runId, runStatus: job.status, errorCode: job.errorCode });
  return verifyCompositionJob(job, input.intent.runConfig.executionModel);
}

async function main() {
  const args = process.argv.slice(2), origin = localOrigin(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000');
  const api = createLocalApi(origin);
  const [state, providers, catalog] = await Promise.all([api.get('/api/market-data/policy'),
    api.get('/api/market-data/providers'), api.get('/api/market-data/routes/capabilities?contractVersion=3')]);
  const plan = createCompositionCase(state, providers.providers, catalog);
  let input = await createCompositionTargetInput();
  const resumeIndex = args.indexOf('--resume-record');
  const failedIndex = args.indexOf('--new-case-after-failed-record');
  assert(!(resumeIndex >= 0 && failedIndex >= 0), '接续与新失败后案例不能同时选择');
  const recordIndex = Math.max(resumeIndex, failedIndex);
  if (recordIndex >= 0) {
    const record = JSON.parse(await fs.readFile(args[recordIndex + 1], 'utf8'));
    assert.equal(record.origin, origin, '接续目标不一致');
    const strategies = await api.get('/api/v1/backtests/strategies');
    if (failedIndex >= 0) {
      assert(typeof record.runId === 'string', '旧Run身份缺失');
      input = await newCompositionInputAfterFailure(record, plan, strategies,
        await api.get(`/api/v1/backtests/runs/${record.runId}`));
    } else input = await resumeCompositionInput(record, plan, strategies);
  }
  if (!args.includes('--execute')) {
    console.log(JSON.stringify({ mode: 'read-only-preview', expectedPolicy: plan.baseline.revision,
      revisions: [plan.baseline.revision, plan.temporary.revision, plan.temporary.revision + 1],
      scope: compositionScope, additions: plan.temporary.routes.slice(plan.baseline.routes.length),
      configVersions: plan.configVersions, input,
      persistence: input.existingStrategy ? '复用原验收版本，最多一条新Run；旧Run保留，不调用retry/cancel；必要新窗口/快照/结果保留'
        : '新隔离验收策略/版本/Run；原准备窗口证据、原Worker快照/结果保留，不改旧资产或Ledger',
      uncovered: '目标准备/依赖仍可能阻断；组合事实与可选真实失败、断网Worker两次重放须另行只读核对',
      creation: '原Server同步Snapshot后投递Worker；POST原90秒，提交不明后最多45秒只读确认，期间保留并核对本案例政策/配置；无POST重试',
      boundary: '不改价格主备/全局来源/凭据/准入/研究语义，不注入故障；并行变化或未知提交停止覆盖' }));
    return;
  }
  assertCompositionExecutionArgs(args, plan.baseline.revision);
  const destination = path.join(await fs.mkdtemp(path.join(tmpdir(), 'tl-composition-case-')), 'recovery.json');
  let previous = {};
  const journal = async (record) => {
    previous = { ...previous, ...record };
    await fs.writeFile(destination + '.tmp', JSON.stringify({ origin, ...previous }, null, 2), { mode: 0o600 });
    await fs.rename(destination + '.tmp', destination);
  };
  const allowed = new Set(['/api/v1/backtests/strategies', '/api/v1/backtests/run-config/prepare', '/api/v1/backtests/runs']);
  const post = async (endpoint, body) => {
    assert(allowed.has(endpoint), '仅允许原三项业务入口');
    let response;
    try {
      response = await fetch(new URL(endpoint, origin), { method: 'POST', signal: AbortSignal.timeout(90000),
        headers: { 'content-type': 'application/json', ...(process.env.SERVER_API_TOKEN
          ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` } : {}) }, body: JSON.stringify(body) });
      assert(response.ok, `原业务入口状态异常:${response.status}`);
      return await response.json();
    } catch (error) {
      if (endpoint !== '/api/v1/backtests/runs' ||
        (!runSubmissionMayBeUnconfirmed(error) && !(response?.status >= 500))) throw error;
      return confirmCompositionRunSubmission(
        createLocalApi(origin, fetch, AbortSignal.timeout(compositionRunConfirmationMs)), plan, body, journal);
    }
  };
  console.log(`恢复记录：${destination}`);
  console.log(JSON.stringify(await executeCompositionCase(api, plan, journal,
    (checkpoint) => runCompositionBusiness(api, post, input, checkpoint))));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('组合业务验收未完成；保留策略/Run与恢复记录，核对原政策恢复。'); process.exitCode = 1; });
}
