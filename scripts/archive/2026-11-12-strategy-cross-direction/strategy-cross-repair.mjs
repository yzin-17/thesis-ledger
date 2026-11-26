// 显式新增价格均线交叉修正版与回测；默认只预览，旧业务记录只读。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { strategySchema, strategyCrossDescriptionIssues, backtestRunCreateSchemaV3 } from '../../../packages/schemas/dist/index.js';
import { hashCanonicalManifest } from '../../../apps/server/dist/src/backtest/backtest-snapshot.js';

export function repairPriceCrosses(raw) {
  const before = strategySchema.parse(raw);
  const issues = strategyCrossDescriptionIssues(before);
  assert(issues.length, '策略没有可确定的价格均线反向说明，停止自动修复');
  const after = structuredClone(before);
  for (const { path } of issues) {
    const node = after[path];
    assert.equal(node.type, 'cross', '仅支持明确的单个顶层交叉修复');
    [node.left, node.right] = [node.right, node.left];
  }
  assert.deepEqual(strategyCrossDescriptionIssues(after), []);
  return { before, after, changedPaths: issues.map(({ path }) => path) };
}

const metrics = (job) => {
  const result = job.result;
  assert(result && job.status === 'succeeded', '回测必须成功才统计');
  const dates = result.equityCurve.map((point) => point.occurredAt.slice(0, 10));
  const holding = result.trades.map((trade) => dates.indexOf(trade.closedAt.slice(0, 10)) - dates.indexOf(trade.openedAt.slice(0, 10)));
  const reasons = {};
  for (const trade of result.trades) reasons[trade.closeReason] = (reasons[trade.closeReason] ?? 0) + 1;
  return {
    totalReturn: result.metrics.totalReturn, maxDrawdown: result.metrics.maxDrawdown,
    winRate: result.metrics.winRate, closedTrades: result.trades.length, fills: result.simulationFills.length,
    averageHoldingSessions: holding.length ? holding.reduce((sum, n) => sum + n, 0) / holding.length : null,
    closeReasons: reasons,
  };
};

function historicalWitness(strategyId, sourceVersionId) {
  const code = `const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
    (async()=>{const strategy=await p.strategy.findUniqueOrThrow({where:{id:${JSON.stringify(strategyId)}}});
    const versions=await p.strategyVersion.findMany({where:{strategyId:strategy.id},orderBy:{id:'asc'}});
    const source=versions.find(v=>v.id===${JSON.stringify(sourceVersionId)});if(!source)throw Error('原版本缺失');
    const versionIds=versions.map(v=>v.id);
    const jobs=await p.backtestJob.findMany({where:{strategyVersionId:{in:versionIds}},orderBy:{id:'asc'}});
    const experimentId=source.source?.referenceId;
    const related={};if(experimentId){for(const table of ['OptimizationExperiment','OptimizationCandidate','OptimizationAttempt']){
      const field=table==='OptimizationExperiment'?'id':'experimentId';
      related[table]=await p.$queryRawUnsafe('SELECT * FROM "'+table+'" WHERE "'+field+'"=$1::uuid ORDER BY id',experimentId);}
      const ids=related.OptimizationAttempt.map(a=>a.aiRunId).filter(Boolean);
      related.AiRun=await p.aiRun.findMany({where:{id:{in:ids}},orderBy:{id:'asc'}});}
    console.log(JSON.stringify({strategy,versions,jobs,related}));})().finally(()=>p.$disconnect());`;
  const [container] = JSON.parse(execFileSync('docker', ['inspect', 'thesis-ledger-dev-thesis-ledger-1'], { encoding: 'utf8' }));
  assert.equal(container.Config.Labels['com.docker.compose.project'], 'thesis-ledger-dev');
  assert.equal(container.Config.Labels['com.docker.compose.service'], 'thesis-ledger');
  assert.equal(container.State.Health.Status, 'healthy');
  return JSON.parse(execFileSync('docker', ['exec', container.Id, 'node', '-e', code], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
}

export async function runRepair(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    'strategy-id': { type: 'string' }, 'source-version-id': { type: 'string' }, 'source-run-id': { type: 'string' },
    output: { type: 'string' }, apply: { type: 'boolean', default: false },
  } });
  const strategyId = values['strategy-id'], sourceVersionId = values['source-version-id'], sourceRunId = values['source-run-id'];
  for (const id of [strategyId, sourceVersionId, sourceRunId]) assert.match(id ?? '', /^[0-9a-f-]{36}$/i);
  assert(values.output && resolve(values.output) === values.output, '必须指定绝对报告路径');
  assert(!existsSync(values.output), '报告路径已存在，请使用新的路径，避免覆盖验收记录');
  const receipt = { strategyId, sourceVersionId, sourceRunId, applied: values.apply, status: 'preview', observedAt: new Date().toISOString() };
  const request = async (path, body) => {
    const response = await fetch('http://127.0.0.1:3000/api/v1' + path, {
      ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      redirect: 'error', signal: AbortSignal.timeout(120_000),
    });
    const result = await response.json();
    assert(response.ok, `${path}: HTTP ${response.status}: ${JSON.stringify(result).slice(0, 1500)}`);
    return result;
  };
  const before = historicalWitness(strategyId, sourceVersionId);
  const original = before.jobs.find((job) => job.id === sourceRunId);
  assert(original && original.strategyVersionId === sourceVersionId && original.status === 'succeeded');
  assert(before.jobs.every((job) => ['succeeded', 'failed', 'cancelled'].includes(job.status)), '该策略仍有在途回测');
  assert(original.runConfig.frozenExecutionWindow, '原回测缺少冻结行情引用');
  const { after, changedPaths } = repairPriceCrosses(before.versions.find((version) => version.id === sourceVersionId).schema);
  receipt.changedPaths = changedPaths;
  receipt.sourceMetrics = metrics(original);
  const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  receipt.beforeWitness = { strategy: hash(before.strategy), versions: hash(before.versions), jobs: hash(before.jobs), related: hash(before.related) };
  try {
    if (!values.apply) return receipt;
    // 同一修复可恢复执行；正式版本由服务端持锁分配，不写数据库版本号。
    let version = before.versions.find((v) => v.version > 0 && hashCanonicalManifest(v.schema) === hashCanonicalManifest(after));
    if (!version) version = await request(`/backtests/strategies/${strategyId}/versions`, { schema: after });
    assert.notEqual(version.id, sourceVersionId);
    receipt.newVersionId = version.id;
    receipt.newVersion = version.version;
    assert.equal(hashCanonicalManifest(strategySchema.parse(version.schema)), hashCanonicalManifest(after));
    const stamp = { ...original.input.preparationStamp, strategyVersionId: version.id, strategyContentHash: hashCanonicalManifest(after) };
    const input = backtestRunCreateSchemaV3.parse({
      contractVersion: 3, strategyVersionId: version.id, runConfig: original.runConfig,
      preparationStamp: stamp, idempotencyKey: `cross-direction-repair:${sourceRunId}:${version.id}`,
    });
    // 服务端仍复核当前路由、冻结配置和版本指纹；不降低原预检标准。
    let job = await request('/backtests/runs', input);
    receipt.newRunId = job.id;
    console.log(JSON.stringify({ newVersion: version.version, newVersionId: version.id, newRunId: job.id, status: job.status }));
    const deadline = Date.now() + 180_000;
    while (['queued', 'running'].includes(job.status) && Date.now() < deadline) {
      await delay(10_000);
      job = await request('/backtests/runs/' + job.id);
    }
    assert.equal(job.status, 'succeeded', `新回测未成功：${job.status} ${job.errorSummary ?? ''}`);
    assert.deepEqual(job.runConfig, original.runConfig, '新回测运行配置改变');
    receipt.sameFrozenPriceInput = hashCanonicalManifest(job.runConfig.frozenExecutionWindow) === hashCanonicalManifest(original.runConfig.frozenExecutionWindow);
    receipt.sameComparableData = job.result.comparableDataFingerprint === original.result.comparableDataFingerprint;
    receipt.newMetrics = metrics(job);
    receipt.fills = job.result.simulationFills.map(({ occurredAt, side, reason }) => ({ occurredAt, side, reason }));
    receipt.warnings = job.result.warnings;
    receipt.status = 'succeeded';
    assert(receipt.sameFrozenPriceInput, '冻结行情发生变化');
    assert(receipt.sameComparableData, '可比输入指纹变化，必须单独核对后才能认定方向对照成立');
    return receipt;
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = error.message;
    throw error;
  } finally {
    const current = historicalWitness(strategyId, sourceVersionId);
    const oldVersionIds = new Set(before.versions.map((row) => row.id));
    const oldJobIds = new Set(before.jobs.map((row) => row.id));
    receipt.afterWitness = {
      strategy: hash(current.strategy), versions: hash(current.versions.filter((row) => oldVersionIds.has(row.id))),
      jobs: hash(current.jobs.filter((row) => oldJobIds.has(row.id))), related: hash(current.related),
    };
    receipt.originalRecordsPreserved = JSON.stringify(receipt.beforeWitness) === JSON.stringify(receipt.afterWitness);
    await writeFile(values.output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    assert(receipt.originalRecordsPreserved, '原记录发生变化，请检查报告');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runRepair().then((receipt) => console.log(JSON.stringify(receipt))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
