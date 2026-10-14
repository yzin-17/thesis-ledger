import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  strategySchema, backtestExecutionModelSchemaV3, marketRouteKeyIdV3,
  backtestRunPreparationRequestV3Schema, backtestRunPreparationResultV3Schema,
  backtestRunCreateSchemaV3, backtestResultSchemaV3,
} from '../packages/schemas/dist/index.js';

// 复用原MA5归一化研究场景；本脚本只编排正常HTTP和临时路由CAS恢复。
const base = spawnSync(process.execPath,
  [fileURLToPath(new URL('./research-window-target.mjs', import.meta.url)), '--symbol=600519.SH'],
  { encoding: 'utf8' });
assert.equal(base.status, 0, '原研究场景构造未通过');
const { strategy: original, intent } = JSON.parse(base.stdout);
const range = { start: '2025-06-23', end: '2025-07-04' };
const clock = new Date().toISOString();
original.name = 'TickFlow免费历史 · 茅台MA5固定序列研究';
const strategy = strategySchema.parse(original);
intent.requestId = randomUUID();
intent.runConfig.startDate = range.start;
intent.runConfig.endDate = range.end;
intent.runConfig.dataAsOf = clock;
const model = intent.runConfig.executionModel;
model.id = 'tickflow-free-cn-stock-normalized-research';
model.scope.range = range;
for (const segment of model.segments) {
  segment.range = range;
  segment.source.configuredAt = clock;
  segment.source.description = 'TickFlow免费历史有界研究，固定前复权序列和连续归一化单位';
  segment.source.references = ['docs/specs/2026-10-09-unified-data-capability-adapter.md'];
  segment.assumptions[0] = 'TickFlow免费历史前复权固定序列、连续归一化价格与数量；上游调整锚点未知，不代表历史当时可见或完整实际总收益，未叠加现金分红。';
  segment.assumptions.push('量额原值保留、通用单位未知；MA5仅消费收盘价格，不使用量额交易信号。');
}
intent.runConfig.executionModel = backtestExecutionModelSchemaV3.parse(model);
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
const resume = process.argv.find(arg => arg.startsWith('--resume='))?.slice(9);
const prior = resume ? JSON.parse(await readFile(resume, 'utf8')) : undefined;
if (prior) {
  assert(!prior.queued, '已有Run不能再次创建');
  assert.notEqual(resume, output, '保留此前回执，恢复结果另存');
  assert.deepEqual(prior.strategy, strategy);
  Object.assign(intent, prior.intent);
}
if (!process.argv.includes('--run')) {
  console.log(JSON.stringify({ mode: 'plan', strategy, intent }));
} else {
  assert(output, '真实验收必须提供原始回执保存路径');
  const capture = { version: 'tickflow-free-history-target-v1', strategy, intent };
  const save = () => writeFile(output, JSON.stringify(capture, null, 2), { mode: 0o600 });
  const api = async (path, body, method = 'POST') => {
    const response = await fetch(`http://127.0.0.1:3000${path}`, {
      method: body ? method : 'GET', headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(120000),
    });
    const data = await response.json();
    assert(response.ok, `${path}: HTTP ${response.status}: ${JSON.stringify(data).slice(0, 600)}`);
    return data;
  };
  const previous = await api('/api/market-data/policy');
  assert.equal(previous.syncState, 'applied');
  capture.previousPolicy = previous;
  await save();
  const key = { kind: 'bar', market: 'CN', assetType: 'STOCK', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'qfq' };
  const desired = { key, targets: [{ providerId: 'tickflow-free', upstreamSource: 'tickflow-free-history' }] };
  const routes = structuredClone(previous.routes);
  const index = routes.findIndex(route => marketRouteKeyIdV3(route.key) === marketRouteKeyIdV3(key));
  if (index < 0) routes.push(desired); else routes[index] = desired;
  const writePolicy = (revision, selected) => api('/api/market-data/policy', {
    contractVersion: 3, consumer: 'thesis-ledger', requestId: randomUUID(), revision,
    enabled: previous.enabled, routes: selected,
  }, 'PUT');
  let policyAttempted = false;
  try {
    policyAttempted = true;
    capture.appliedPolicy = await writePolicy(previous.revision + 1, routes);
    await save();
    const current = await api('/api/market-data/policy');
    assert.equal(current.syncState, 'applied');
    assert.deepEqual(current.routes, routes);
    const created = prior?.created ?? await api('/api/v1/backtests/strategies', {
      name: `${strategy.name} ${clock}`, schema: strategy,
      description: '免费历史来源、有限口径核对后的正常新准备/执行/固定快照研究验收',
    });
    capture.created = created;
    const strategyVersionId = created.versions[0].id;
    const request = backtestRunPreparationRequestV3Schema.parse({ ...intent, strategyVersionId });
    capture.prepared = backtestRunPreparationResultV3Schema.parse(await api('/api/v1/backtests/run-config/prepare', request));
    await save();
    const prepareDeadline = Date.now() + 360000;
    while (capture.prepared.status === 'preparing' && Date.now() < prepareDeadline) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      capture.prepared = backtestRunPreparationResultV3Schema.parse(await api('/api/v1/backtests/run-config/prepare', request));
      await save();
    }
    assert.equal(capture.prepared.status, 'prepared', '实际准备未通过，保留原回执');
    const prepared = capture.prepared;
    const queued = await api('/api/v1/backtests/runs', backtestRunCreateSchemaV3.parse({
      contractVersion: 3, strategyVersionId, runConfig: prepared.runConfig,
      preparationStamp: prepared.executionPreflight.revisionStamp,
      idempotencyKey: `tickflow-free-history-${randomUUID()}`,
    }));
    capture.queued = queued;
    await save();
    let job = queued;
    const deadline = Date.now() + 180000;
    while (['queued', 'running'].includes(job.status) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 8000));
      job = await api(`/api/v1/backtests/runs/${queued.id}`);
    }
    capture.job = job;
    await save();
    assert.equal(job.status, 'succeeded', job.errorSummary ?? '实际Worker未成功');
    const result = backtestResultSchemaV3.parse(job.result);
    assert.equal(job.snapshotManifest.executionPriceProtocol.priceBasis.adjustment, 'qfq');
    assert.equal(job.snapshotManifest.executionPriceProtocol.priceBasis.quantityBasis, 'normalized-units');
    const execution = job.snapshotManifest.actualSources.find(source => source.purpose === 'execution');
    assert.equal(execution.provenance.providerId, 'tickflow-free');
    assert.equal(execution.provenance.upstreamSource, 'tickflow-free-history');
    assert(result.simulationFills.length > 0, '需要原策略真实模拟成交');
    console.log(JSON.stringify({ runId: job.id, snapshotId: job.snapshotId,
      checksum: job.resultChecksum, fills: result.simulationFills.length, output }));
  } catch (error) {
    capture.error = { message: error.message };
    await save();
    throw error;
  } finally {
    if (policyAttempted) {
      const current = await api('/api/market-data/policy');
      if (current.revision === previous.revision) {
        assert.deepEqual(current.routes, previous.routes, '同修订路线已变化，拒绝覆盖');
      } else {
        assert.equal(current.revision, previous.revision + 1, '存在并行政策修订，拒绝覆盖');
        assert.deepEqual(current.routes, routes, '存在并行路由变更，拒绝覆盖');
        capture.restoredPolicy = await writePolicy(current.revision + 1, previous.routes);
      }
      const restored = await api('/api/market-data/policy');
      assert.equal(restored.syncState, 'applied');
      assert.deepEqual(restored.routes, previous.routes);
      await save();
      console.error(JSON.stringify({ restoredRevision: restored.revision }));
    }
  }
}
