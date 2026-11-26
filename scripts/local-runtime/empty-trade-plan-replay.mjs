import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DecimalValue as D } from '../../packages/domain/dist/index.js';
import { verifyDefinition, verifyFills } from './strategy-cross-live-verification.mjs';
import { compareFrozenRows } from './strategy-cross-live-preparation.mjs';

const baseRunId = '9c7efea9-9242-494b-8bec-cef825ed4b1d';
const strategyId = '55f66224-9c77-4773-99c0-630850b47a7d';
const versionId = '893ddc7e-1e8e-4f4d-a4a5-6668d340b097';
const containers = ['thesis-ledger-dev-thesis-ledger-1', 'thesis-ledger-dev-backtest-worker-1'];
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const docker = (code, container = containers[0]) => JSON.parse(execFileSync('rtk', ['proxy', 'docker', 'exec', container, 'node', '-e', code], { encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }));
async function request(path, body) {
  const response = await fetch('http://127.0.0.1:3000/api/v1' + path, {
    ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    redirect: 'error', signal: AbortSignal.timeout(120_000),
  });
  const result = await response.json();
  assert(response.ok, `${path}: ${response.status} ${JSON.stringify(result).slice(0, 1500)}`);
  return result;
}

function witness() {
  return docker(`const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();const h=x=>require('crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex');
    (async()=>{try{const strategy=await p.strategy.findUniqueOrThrow({where:{id:'${strategyId}'}});
    const versions=await p.strategyVersion.findMany({where:{strategyId:strategy.id},orderBy:{id:'asc'}});
    const jobs=await p.backtestJob.findMany({where:{strategyVersionId:{in:versions.map(v=>v.id)}},orderBy:{id:'asc'}});
    const related={};for(const table of ['OptimizationExperiment','OptimizationCandidate','OptimizationAttempt']){const field=table==='OptimizationExperiment'?'id':'experimentId';related[table]=await p.$queryRawUnsafe('SELECT * FROM "'+table+'" WHERE "'+field+'"=$1::uuid ORDER BY id','71bbc0a2-89ae-48eb-938f-0b7e534aecb2');}
    related.AiRun=await p.aiRun.findMany({where:{id:{in:related.OptimizationAttempt.map(a=>a.aiRunId).filter(Boolean)}},orderBy:{id:'asc'}});
    console.log(JSON.stringify({strategy:h(strategy),versions:versions.map(v=>({id:v.id,hash:h(v)})),jobs:jobs.map(j=>({id:j.id,hash:h(j)})),related:h(related),definition:versions.find(v=>v.id==='${versionId}').schema}));}finally{await p.$disconnect()}})().catch(e=>{console.error(e.message);process.exitCode=1});`);
}

async function main() {
  const { values } = parseArgs({ options: { receipt: { type: 'string' }, apply: { type: 'boolean', default: false }, resume: { type: 'boolean', default: false } } });
  assert(values.apply && values.receipt && resolve(values.receipt) === values.receipt, '必须显式指定 --apply 与绝对报告路径');
  assert(values.resume || !existsSync(values.receipt), '报告已存在，恢复须指定 --resume');
  const receipt = values.resume ? JSON.parse(await readFile(values.receipt, 'utf8')) : { observedAt: new Date().toISOString(), baseRunId, versionId };
  const persist = () => writeFile(values.receipt, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  const aiWitness = async () => {
    const rows = [];
    for (const id of ['bb3516ea-610f-4d5d-b730-f9e8fa43f179', '849b83bf-1923-42ed-98e7-17482d7f8043']) rows.push({ id, hash: hash(await request('/strategy-authoring/operations/' + id)) });
    return rows;
  };
  const assertHistory = async () => {
    const current = witness(), before = receipt.before;
    current.jobs = current.jobs.filter((j) => before.jobs.some((p) => p.id === j.id));
    assert.deepEqual(current, before, '原策略／版本／回测／实验发生变化');
    assert.deepEqual(await aiWitness(), receipt.aiBefore, '原 AI 操作或调用事实发生变化');
    receipt.originalRecordsPreserved = true;
  };
  receipt.before ??= witness();
  receipt.aiBefore ??= await aiWitness();
  await persist();
  try {
    await assertHistory();
    receipt.runtime = containers.map((container) => ({ container, ...docker(`(async()=>{const d=await import('@thesis-ledger/domain');const fs=require('fs'),crypto=require('crypto');const domainRoot=require('path').dirname(require.resolve('@thesis-ledger/domain'));const empty={version:1,evaluation:'barClose',stages:[]};const paths=['/app/packages/domain/dist/backtest-trade-plan-contract.js','/app/packages/domain/dist/backtest-engine.js','/app/apps/server/dist/src/backtest/backtest-exchange-sizing.js','/app/apps/server/dist/src/backtest/backtest-trade-plan-execution.js'];console.log(JSON.stringify({emptyActive:Boolean(d.activeBacktestTradePlan(empty)),configuredActive:Boolean(d.activeBacktestTradePlan({...empty,initialStop:{kind:'percent',percent:'0.03'}})),hashes:Object.fromEntries(paths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p.replace('/app/packages/domain/dist',domainRoot))).digest('hex')]))}));})().catch(e=>{console.error(e.message);process.exitCode=1})`, container) }));
    for (const runtime of receipt.runtime) {
      assert.equal(runtime.emptyActive, false);
      assert.equal(runtime.configuredActive, true);
      for (const [path, expected] of Object.entries(runtime.hashes)) {
        const local = await readFile(new URL(path.slice('/app/'.length), new URL('../../', import.meta.url)));
        assert.equal(createHash('sha256').update(local).digest('hex'), expected, `${runtime.container} 模块未同步：${path}`);
      }
    }
    const base = await request('/backtests/runs/' + baseRunId);
    assert.equal(base.status, 'succeeded');
    assert.deepEqual(receipt.before.definition.tradePlan, { version: 1, evaluation: 'barClose', stages: [] });
    receipt.direction = verifyDefinition(receipt.before.definition);
    if (!receipt.newRunId) {
      receipt.preflight = await request('/backtests/run-config/preflight', { contractVersion: 1, requestId: `empty-plan:${baseRunId}`, strategyVersionId: versionId, runConfig: base.runConfig });
      await persist();
      assert.equal(receipt.preflight.status, 'ready', JSON.stringify(receipt.preflight.diagnostics));
      const job = await request('/backtests/runs', { contractVersion: 1, strategyVersionId: versionId, runConfig: base.runConfig, preparationStamp: receipt.preflight.revisionStamp, idempotencyKey: `empty-plan-fix:${baseRunId}` });
      receipt.newRunId = job.id;
      await persist();
      console.log(JSON.stringify({ stage: 'submitted', runId: job.id }));
    }
    let job = await request('/backtests/runs/' + receipt.newRunId);
    const deadline = Date.now() + 240_000;
    while (['queued', 'running'].includes(job.status) && Date.now() < deadline) { await delay(15_000); job = await request('/backtests/runs/' + receipt.newRunId); }
    receipt.job = job;
    assert.equal(job.status, 'succeeded', job.errorSummary);
    assert.deepEqual(job.runConfig, base.runConfig, '完整 RunConfig 不一致');
    assert.equal(job.result.comparableDataFingerprint, base.result.comparableDataFingerprint);
    const artifacts = docker(`const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{try{const {LocalSnapshotStore}=await import('/app/apps/server/dist/src/backtest/backtest-snapshot.js');const s=new LocalSnapshotStore(process.env.BACKTEST_SNAPSHOT_ROOT||'/app/var/backtest');const all=[];for(const id of ['${baseRunId}','${receipt.newRunId}']){const j=await p.backtestJob.findUniqueOrThrow({where:{id}});const ref=j.snapshotManifest.artifacts.find(r=>r.key.endsWith('/execution/bars.parquet'));const rows=[];for await(const row of await s.artifacts.openRead(ref))rows.push(row);all.push(rows)}console.log(JSON.stringify(all));}finally{await p.$disconnect()}})().catch(e=>{console.error(e.message);process.exitCode=1});`);
    receipt.frozenRowsComparison = compareFrozenRows(artifacts[0], artifacts[1]);
    assert(receipt.frozenRowsComparison.sameRows, '冻结行情逐行变化');
    receipt.fillVerification = verifyFills(artifacts[1], job.result.simulationFills);
    const first = job.result.simulationFills[0];
    const expectedQuantity = D.from(base.runConfig.initialCash.HKD).times('0.5').dividedBy(first.price).toString();
    assert.equal(first.quantity, expectedQuantity, '首笔数量未恢复普通仓位参考价');
    receipt.firstFill = { previous: base.result.simulationFills[0], current: first, expectedQuantity };
    const priorCorrected = await request('/backtests/runs/ec5dd526-7083-4697-980a-3c209ca91dce');
    const tradeFacts = (r) => r.simulationFills.map(({ side, occurredAt, quantity, price, reason }) => ({ side, occurredAt, quantity, price, reason }));
    receipt.matchesCorrectedV2Fills = JSON.stringify(tradeFacts(job.result)) === JSON.stringify(tradeFacts(priorCorrected.result));
    receipt.sameRunConfig = true;
    receipt.status = 'succeeded';
    console.log(JSON.stringify({ stage: 'verified', runId: job.id, totalReturn: job.result.metrics.totalReturn, sameRows: true, sameRunConfig: true, matchesCorrectedV2Fills: receipt.matchesCorrectedV2Fills }));
  } catch (error) {
    receipt.status = 'failed'; receipt.error = error.message; throw error;
  } finally {
    try { await assertHistory(); } finally { await persist(); }
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
