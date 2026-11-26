// 由宿主通过stdin执行；只读取编译产物、业务任务和冻结文件，结果仅在内存中复算。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { researchTradeActivity, materializeEntryPolicy, backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import { LocalSnapshotStore } from './apps/server/dist/src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from './apps/server/dist/src/backtest/backtest-v3-runner.js';
import { stockSnapshotStoreForJob, loadVerifiedBacktestV3Snapshot } from './apps/server/dist/src/backtest/backtest-v3-run-execution.js';
import { compileBacktestStrategy } from './apps/server/dist/src/backtest/backtest-strategy-compiler.js';
import { AUTHORING_PROMPT_VERSION } from './apps/server/dist/src/strategy-authoring/authoring-prompt.js';
import { STRATEGY_OPTIMIZATION_PROMPT_VERSION } from './apps/server/dist/src/strategy-optimization/strategy-optimization-prompt.js';

const input = globalThis.__BACKTEST_PRACTICAL_READONLY;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const require = createRequire(resolve('package.json'));
const areas = { server: resolve('apps/server/dist/src'),
  domain: dirname(require.resolve('@thesis-ledger/domain')),
  schemas: dirname(require.resolve('@thesis-ledger/schemas')),
  shared: dirname(require.resolve('@thesis-ledger/shared')) };
for (const file of input.hashes) {
  assert(!file.path.split('/').includes('..'));
  assert(areas[file.area]);
  assert.equal(digest(await readFile(resolve(areas[file.area], file.path))), file.sha256, file.path);
}
assert.deepEqual([aiGenerationContracts.authoringGeneration.ref.version, aiGenerationContracts.authoringModification.ref.version,
  aiGenerationContracts.strategyDiscovery.ref.version], ['authoring-generation-v6', 'authoring-modification-v6', 'strategy-discovery-v6']);
assert.deepEqual(researchTradeActivity([{ quantity: '100', price: '10' }, { quantity: '50', price: '10' }], '1000'), {
  tradedNotional: { status: 'available', value: '1500' }, turnoverRate: { status: 'available', value: '1.5' } });
const old = materializeEntryPolicy({});
assert.equal(materializeEntryPolicy({ ...old, tradePlan: input.protection }).entryTrigger, 'rising-edge');
assert.equal(materializeEntryPolicy({ tradePlan: input.protection }).entryTrigger, 'while-flat');
assert.equal(compileBacktestStrategy(input.outline, input.scope).status, 'compiled');
const invalid = structuredClone(input.outline);
invalid.entry = { type: 'compare', operator: 'gt', left: { type: 'series', sourceId: 'undeclared', field: 'close' }, right: { type: 'constant', value: '0' } };
invalid.exit = { type: 'compare', operator: 'gt', left: { type: 'eventValue' }, right: { type: 'constant', value: '0' } };
const rejected = compileBacktestStrategy(invalid, input.scope);
assert.equal(rejected.status, 'rejected');
assert(rejected.diagnostics.length >= 2);
assert(rejected.diagnostics.some((issue) => issue.code === 'UNDECLARED_SOURCE'));
assert(rejected.diagnostics.some((issue) => issue.code === 'EVENT_VALUE_UNBOUND'));
assert.equal(AUTHORING_PROMPT_VERSION, 'authoring-prompt-v36-research-coordinate');
assert.equal(STRATEGY_OPTIMIZATION_PROMPT_VERSION, 'strategy-optimization-v28-comparison-readback');
const anchorStrategy = {
  ...input.outline,
  signalSources: [{ id: 'daily', asset: { symbol: '159516.SZ', market: 'CN', assetType: 'stock' } }],
  entry: { type: 'compare', operator: 'gt',
    left: { type: 'cumulative', statistic: 'sum', anchorAt: '2026-03-02T15:00:00+08:00',
      input: { type: 'series', sourceId: 'daily', field: 'volume' } },
    right: { type: 'constant', value: '0' } },
};
const anchorReadback = backtestStrategyPlanReadback(anchorStrategy)[0];
assert(anchorReadback.includes('15:00:00（Asia/Shanghai）'));
const prisma = new PrismaClient();
try {
  const jobs = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    assert.equal(await tx.aiRun.count({ where: { status: { in: ['queued', 'running', 'pending'] } } }), 0);
    assert.equal(await tx.backtestJob.count({ where: { status: { in: ['queued', 'running'] } } }), 0);
    return tx.backtestJob.findMany({ where: { status: 'succeeded', mode: 'V3', snapshotId: { not: null } }, orderBy: { createdAt: 'desc' }, take: 156 });
  });
  const job = jobs.find((row) => row.snapshotManifest && row.snapshotManifest.inputKind !== 'nav');
  assert(job, '目标环境没有可读取的股票冻结样本');
  const signature = JSON.stringify(job);
  const snapshots = new LocalSnapshotStore(process.env.BACKTEST_SNAPSHOT_ROOT ?? 'var/backtest');
  const manifest = await loadVerifiedBacktestV3Snapshot(job, snapshots);
  const store = stockSnapshotStoreForJob(job, snapshots);
  const runner = new LocalSnapshotV3Runner(store);
  const request = { runId: job.id, snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash }, artifactRefs: manifest.artifacts };
  globalThis.fetch = async () => { throw Error('只读冻结复算禁止Provider网络请求'); };
  const first = await runner.run(request, AbortSignal.timeout(60_000));
  assert.deepEqual(await runner.run(request, AbortSignal.timeout(60_000)), first);
  assert.equal(first.analyticsVersion, 'research-analytics-v2');
  assert.equal(JSON.stringify(await prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } })), signature);
  console.log('BACKTEST_PRACTICAL_READONLY ' + JSON.stringify({ hashesVerified: input.hashes.length,
    currentRunner: runner.id, generationVersions: ['authoring-generation-v6', 'authoring-modification-v6', 'strategy-discovery-v6'],
    promptVersions: { authoring: AUTHORING_PROMPT_VERSION, discovery: STRATEGY_OPTIMIZATION_PROMPT_VERSION },
    anchorReadback,
    compilerDiagnostics: rejected.diagnostics.map(({ code, path }) => ({ code, path })),
    stockFrozenReplay: { runId: job.id, savedEngine: job.engineVersion, currentChecksum: first.resultChecksum,
      originalResultUnchanged: true, repeatedResultEqual: true, fills: first.simulationFills.length },
    targetNavSamples: jobs.filter((row) => row.snapshotManifest?.inputKind === 'nav').length,
    modelCalls: 0, providerRequests: 0, businessWrites: 0 }));
} finally { await prisma.$disconnect(); }
