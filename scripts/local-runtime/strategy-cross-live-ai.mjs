// 用户显式授权的一次真实生成；宿主只通过正式 HTTP 新增业务记录。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { strategySchema, authoringContentSchema } from '../../packages/schemas/dist/index.js';
import { hashCanonicalManifest } from '../../apps/server/dist/src/backtest/backtest-snapshot.js';
import { verifyDefinition, verifyFills } from './strategy-cross-live-verification.mjs';
import { refreezeRequest, assertRefreezeScope, compareFrozenRows } from './strategy-cross-live-preparation.mjs';

const strategyId = '55f66224-9c77-4773-99c0-630850b47a7d';
const originalRunId = 'a20a39e3-620e-4fb0-ad31-14b6dfa91758';
const providerId = 'lmstudio';
const model = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const docker = (code) => JSON.parse(execFileSync('rtk', ['proxy', 'docker', 'exec', 'thesis-ledger-dev-thesis-ledger-1', 'node', '-e', code], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024, timeout: 30_000 }));
const request = async (path, body) => {
  const response = await fetch('http://127.0.0.1:3000/api/v1' + path, {
    ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    redirect: 'error', signal: AbortSignal.timeout(120_000),
  });
  const result = await response.json();
  assert(response.ok, `${path}: HTTP ${response.status}: ${JSON.stringify(result).slice(0, 1800)}`);
  return result;
};

function witness() {
  return docker(`const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
    (async()=>{try{const strategy=await p.strategy.findUniqueOrThrow({where:{id:'${strategyId}'}});
    const versions=await p.strategyVersion.findMany({where:{strategyId:strategy.id},orderBy:{id:'asc'}});
    const jobs=await p.backtestJob.findMany({where:{strategyVersionId:{in:versions.map(v=>v.id)}},orderBy:{id:'asc'}});
    const related={};const experimentId='71bbc0a2-89ae-48eb-938f-0b7e534aecb2';
    for(const table of ['OptimizationExperiment','OptimizationCandidate','OptimizationAttempt']){
      const field=table==='OptimizationExperiment'?'id':'experimentId';related[table]=await p.$queryRawUnsafe('SELECT * FROM "'+table+'" WHERE "'+field+'"=$1::uuid ORDER BY id',experimentId);}
    related.AiRun=await p.aiRun.findMany({where:{id:{in:related.OptimizationAttempt.map(a=>a.aiRunId).filter(Boolean)}},orderBy:{id:'asc'}});
    const instruments=await p.instrument.findMany({where:{canonicalCode:'00700',market:'HK',instrumentType:'STOCK',active:true},select:{id:true}});
    console.log(JSON.stringify({strategy,versions,jobs,related,instruments}));}finally{await p.$disconnect()}})().catch(e=>{console.error(e.message);process.exitCode=1});`);
}

const describeWitness = (rows) => ({
  strategy: hash(rows.strategy), versions: rows.versions.map((v) => ({ id: v.id, hash: hash(v) })),
  jobs: rows.jobs.map((j) => ({ id: j.id, hash: hash(j) })), related: hash(rows.related),
});

async function main() {
  const { values } = parseArgs({ options: { receipt: { type: 'string' }, 'retry-from': { type: 'string' }, apply: { type: 'boolean', default: false }, resume: { type: 'boolean', default: false }, refreeze: { type: 'boolean', default: false } } });
  assert(values.receipt && resolve(values.receipt) === values.receipt, '必须指定绝对报告路径');
  assert(values.apply, '真实调用与新增业务记录必须显式指定 --apply');
  assert(values.resume || !existsSync(values.receipt), '报告已存在；恢复须显式使用 --resume');
  const receipt = values.resume ? JSON.parse(await readFile(values.receipt, 'utf8')) : { observedAt: new Date().toISOString(), strategyId, originalRunId, providerId, model };
  if (values.refreeze) assert(values.resume && receipt.operationId && receipt.newVersionId, '重新冻结只恢复已有 AI 操作与版本');
  if (values.resume && receipt.error) {
    receipt.verificationHistory ??= [];
    receipt.verificationHistory.push({ observedAt: new Date().toISOString(), error: receipt.error });
    delete receipt.error;
  }
  if (values['retry-from']) {
    assert.notEqual(resolve(values['retry-from']), values.receipt, '重试不得覆盖原报告');
    const previous = JSON.parse(await readFile(values['retry-from'], 'utf8'));
    assert.equal(previous.status, 'failed');
    assert(!previous.retryOf, '只允许对原失败尝试重试一次');
    assert.equal(previous.providerId, providerId);
    assert.equal(previous.model, model);
    assert.equal(previous.originalRecordsPreserved, true);
    const failed = await request('/strategy-authoring/operations/' + previous.operationId);
    assert.equal(failed.status, 'failed');
    receipt.retryOf ??= { operationId: failed.id, hash: hash(failed), reportHash: hash(previous), report: values['retry-from'] };
    receipt.beforeWitness ??= previous.beforeWitness;
  }
  const persist = () => writeFile(values.receipt, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  const before = witness();
  const original = before.jobs.find((j) => j.id === originalRunId);
  assert(original?.status === 'succeeded' && original.runConfig.frozenExecutionWindow);
  assert.equal(before.instruments.length, 1, '目录标的必须唯一');
  receipt.beforeWitness ??= describeWitness(before);
  const prior = receipt.beforeWitness;
  const compareHistory = () => {
    const current = describeWitness(witness());
    receipt.afterWitness = { ...current, versions: current.versions.filter((v) => prior.versions.some((p) => p.id === v.id)), jobs: current.jobs.filter((j) => prior.jobs.some((p) => p.id === j.id)) };
    receipt.originalRecordsPreserved = JSON.stringify(prior) === JSON.stringify(receipt.afterWitness);
    assert(receipt.originalRecordsPreserved, '原业务记录摘要变化');
  };
  const compareFailure = async () => {
    if (!receipt.retryOf) return;
    const failed = await request('/strategy-authoring/operations/' + receipt.retryOf.operationId);
    receipt.failedOperationPreserved = hash(failed) === receipt.retryOf.hash;
    assert(receipt.failedOperationPreserved, '原失败操作或调用事实变化');
  };
  try {
    compareHistory();
    await compareFailure();
    const readiness = await request('/ai/providers/lmstudio/readiness');
    const route = readiness.find((r) => r.model === model && r.contract.id === 'strategy_authoring_generation');
    assert(route?.readiness.state === 'ready' && route.liveValidation.status === 'passed', '原模型的策略生成用途未就绪');
    receipt.route ??= route;
    const base = strategySchema.parse(before.versions.find((v) => v.version === 2).schema);
    const description = '腾讯控股（00700.HK）日线趋势策略：收盘价上穿20日指数移动平均线时买入，下穿同一均线时卖出。每次投入研究权益的50%，固定止损3%，最多持有10个交易周期。信号后在下一可交易日开盘执行，佣金率和滑点率均为0。价格与均线使用后复权序列，不增加其他交易条件或交易计划。';
    if (!receipt.draftId) {
      const content = authoringContentSchema.parse({
        title: '腾讯控股EMA趋势跟踪真实AI验证', description, questions: [],
        requirements: [{ id: 'trend-rules', quote: description, interpretation: description, state: 'understood', definitionPaths: [] }],
        runtimeIntents: [], removedRequirements: [], definitionText: '', manualChanges: [],
        confirmation: { instrumentId: before.instruments[0].id, instrument: base.executionInstrument, timeframe: '1d',
          entrySummary: '收盘价上穿20日指数移动平均线时买入', exitSummary: '收盘价下穿20日指数移动平均线时卖出',
          sizing: base.sizing, risk: base.risk, noExtraRiskConfirmed: false, periodsAreBarsConfirmed: true, execution: base.execution, cost: base.cost },
      });
      const draft = await request('/strategy-authoring/drafts', content);
      receipt.draftId = draft.id;
      receipt.content = content;
      await persist();
    }
    if (!receipt.operationId) {
      // 幂等键固定于本次草稿；恢复不会产生第二次生成意图。
      const operation = await request(`/strategy-authoring/drafts/${receipt.draftId}/operations`, {
        kind: 'generate', expectedRevision: 1, idempotencyKey: `cross-live:${receipt.draftId}`, providerId, model,
        intent: '请严格根据已确认的自然语言规则生成策略，保持规则含义及参数，不增加其他条件。', unknownCostAcknowledgedAt: null,
      });
      receipt.operationId = operation.id;
      await persist();
      console.log(JSON.stringify({ stage: 'ai-submitted', draftId: receipt.draftId, operationId: operation.id }));
    }
    let operation = await request(`/strategy-authoring/operations/${receipt.operationId}`);
    const deadline = Date.now() + 600_000;
    while (['queued', 'running'].includes(operation.status) && Date.now() < deadline) {
      await delay(20_000);
      operation = await request(`/strategy-authoring/operations/${receipt.operationId}`);
    }
    receipt.operation = operation;
    await persist();
    assert.equal(operation.status, 'succeeded', `真实 AI 生成未成功：${operation.status} ${operation.outcome?.errorCode ?? operation.errorCode ?? ''}`);
    assert(operation.invocations?.some((i) => i.requestedModel === model), '缺少实际模型调用事实');
    const output = JSON.parse(operation.outcome.outputText);
    const definition = strategySchema.parse(output.definition);
    receipt.definition = definition;
    receipt.directionVerification = verifyDefinition(definition);
    assert.deepEqual(definition.sizing, base.sizing);
    assert.deepEqual(definition.execution, base.execution);
    assert.deepEqual(definition.cost, base.cost);
    assert.deepEqual([...definition.risk].sort((a, b) => a.type.localeCompare(b.type)), [...base.risk].sort((a, b) => a.type.localeCompare(b.type)));
    receipt.definitionHash = hashCanonicalManifest(definition);
    // 仅使用 AI 原始定义；schema.parse 的十进制规范化属于公共合同解析。
    assert.equal(receipt.definitionHash, hashCanonicalManifest(strategySchema.parse(output.definition)));
    if (operation.disposition === 'unapplied') await request(`/strategy-authoring/operations/${receipt.operationId}/apply-generation`, { expectedRevision: 1 });
    if (!receipt.newVersionId) {
      compareHistory();
      // 现有版本发布 API 将 source 标为 manual；真实 AI 来源由 operation、原始输出及定义摘要关联留证，不伪造来源字段。
      const existing = witness().versions.find((v) => v.version > 2 && hashCanonicalManifest(strategySchema.parse(v.schema)) === receipt.definitionHash);
      const version = existing ?? await request(`/backtests/strategies/${strategyId}/versions`, { schema: definition });
      receipt.newVersionId = version.id;
      receipt.newVersion = version.version;
      receipt.publicationSource = version.source;
      assert.equal(hashCanonicalManifest(strategySchema.parse(version.schema)), receipt.definitionHash);
      await persist();
    }
    assert.equal(hashCanonicalManifest(strategySchema.parse(witness().versions.find((v) => v.id === receipt.newVersionId)?.schema)), receipt.definitionHash, '正式版本不再匹配原始 AI 输出');
    // AI 自主命名 sourceId；仅重绑定配置中的引用，保留定义和全部冻结输入。
    let runConfig = structuredClone(original.runConfig);
    assert.equal(runConfig.priceInputBindings.signals.length, 1);
    runConfig.priceInputBindings.signals[0].sourceId = definition.signalSources[0].id;
    receipt.runConfigBinding = { original: original.runConfig.priceInputBindings, current: runConfig.priceInputBindings };
    if (values.refreeze) {
      if (!receipt.refreezePreparation) {
        receipt.refreezeInput = refreezeRequest(original.runConfig, receipt.newVersionId, `cross-live:${receipt.operationId}:refreeze`);
        receipt.refreezePreparation = await request('/backtests/run-config/prepare', receipt.refreezeInput);
        await persist();
      }
      assert.equal(receipt.refreezePreparation.status, 'prepared', JSON.stringify(receipt.refreezePreparation));
      runConfig = receipt.refreezePreparation.runConfig;
      assertRefreezeScope(original.runConfig, runConfig, definition.signalSources[0].id);
    }
    if (!receipt.newRunId) {
      receipt.preflight = await request('/backtests/run-config/preflight', {
        contractVersion: 1, requestId: `cross-live:${receipt.operationId}:preflight`, strategyVersionId: receipt.newVersionId, runConfig,
      });
      await persist();
      assert.equal(receipt.preflight.status, 'ready', JSON.stringify(receipt.preflight.diagnostics));
      const job = await request('/backtests/runs', { contractVersion: 1, strategyVersionId: receipt.newVersionId, runConfig,
        preparationStamp: receipt.preflight.revisionStamp, idempotencyKey: `cross-live:${receipt.operationId}:${receipt.newVersionId}` });
      receipt.newRunId = job.id;
      await persist();
      console.log(JSON.stringify({ stage: 'backtest-submitted', version: receipt.newVersion, runId: job.id }));
    }
    let job = await request('/backtests/runs/' + receipt.newRunId);
    const runDeadline = Date.now() + 240_000;
    while (['queued', 'running'].includes(job.status) && Date.now() < runDeadline) { await delay(15_000); job = await request('/backtests/runs/' + receipt.newRunId); }
    receipt.job = job;
    assert.equal(job.status, 'succeeded', `回测未成功：${job.status} ${job.errorSummary ?? ''}`);
    assert.deepEqual(job.runConfig, runConfig, 'RunConfig 与正式准备结果不一致');
    receipt.sameComparableData = job.result.comparableDataFingerprint === original.result.comparableDataFingerprint;
    if (!values.refreeze) assert(receipt.sameComparableData, '可比数据变化');
    const artifacts = docker(`const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{try{
      const {LocalSnapshotStore}=await import('/app/apps/server/dist/src/backtest/backtest-snapshot.js');const s=new LocalSnapshotStore(process.env.BACKTEST_SNAPSHOT_ROOT||'/app/var/backtest');
      const all=[];for(const id of ['${originalRunId}','${receipt.newRunId}']){const j=await p.backtestJob.findUniqueOrThrow({where:{id}});const ref=j.snapshotManifest.artifacts.find(r=>r.key.endsWith('/execution/bars.parquet'));const rows=[];for await(const row of await s.artifacts.openRead(ref))rows.push(row);all.push(rows);}console.log(JSON.stringify(all));
      }finally{await p.$disconnect()}})().catch(e=>{console.error(e.message);process.exitCode=1});`);
    receipt.frozenRowsComparison = compareFrozenRows(artifacts[0], artifacts[1]);
    if (!values.refreeze) assert(receipt.frozenRowsComparison.sameRows, '执行行情逐行不一致');
    receipt.sameRunConfigExceptSignalSourceId = !values.refreeze;
    receipt.sameFrozenRows = receipt.frozenRowsComparison.sameRows;
    receipt.fillVerification = verifyFills(artifacts[1], job.result.simulationFills);
    receipt.status = 'succeeded';
    console.log(JSON.stringify({ stage: 'verified', version: receipt.newVersion, runId: job.id, signalFills: receipt.fillVerification.signalFills, riskExits: receipt.fillVerification.riskExits, totalReturn: job.result.metrics.totalReturn }));
  } catch (error) {
    receipt.status = 'failed'; receipt.error = error.message;
    throw error;
  } finally {
    try { compareHistory(); await compareFailure(); } finally { await persist(); }
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
