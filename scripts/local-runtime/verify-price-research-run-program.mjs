import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  strategySchema,
  backtestRunPreparationRequestV3Schema,
  statusCompositionArtifactKeyV1,
  marketDataErrorCodeV3,
  marketDataErrorMessageV3,
} from '@thesis-ledger/schemas';
import { DsaClient } from '/app/apps/server/dist/src/integration/dsa/dsa.client.js';
import { MarketBarWindowReaderV3 } from '/app/apps/server/dist/src/market/market-bar-reader-v3.js';
import { MarketWindowEvidenceV3Repository } from '/app/apps/server/dist/src/market/market-window-evidence-v3.repository.js';
import { MarketFrozenWindowReaderV3 } from '/app/apps/server/dist/src/market/market-frozen-window-reader-v3.js';
import { MarketRouteRevisionService } from '/app/apps/server/dist/src/market/market-route-revision.service.js';
import { marketPolicyCatalogResponse } from '/app/apps/server/dist/src/market/market-policy-catalog.js';
import { prepareBacktestRunConfigV3 } from '/app/apps/server/dist/src/backtest/backtest-run-preparation.js';
import { DsaSnapshotBuilder } from '/app/apps/server/dist/src/backtest/backtest-snapshot-builder.js';
import {
  LocalSnapshotStore,
  hashCanonicalManifest,
} from '/app/apps/server/dist/src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '/app/apps/server/dist/src/backtest/backtest-v3-runner.js';

// 业务表只读；允许正式 Market 读取保存观测，计算产物仅写入本脚本拥有的临时目录。
const prisma = new PrismaClient();
const tables = [
  'Strategy',
  'StrategyVersion',
  'BacktestJob',
  'Account',
  'LedgerEvent',
  'DesiredProviderPolicy',
  'DesiredProviderPolicyRevision',
  'OptimizationExperiment',
  'OptimizationAttempt',
  'AiRun',
];
async function witness() {
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => {
        const [row] = await prisma.$queryRawUnsafe(
          `SELECT count(*)::text AS count, md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS hash FROM "${table}" t`,
        );
        return [table, row];
      }),
    ),
  );
}
let root;
const originalFetch = globalThis.fetch;
const injectedStatusErrors = [];
if (process.env.PRICE_RESEARCH_STATUS_SOURCE_ERROR === '1') {
  assert.equal(process.env.PRICE_RESEARCH_FROZEN_INPUT, '1');
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (
      url.pathname === '/api/v1/thesis-ledger/market/status-capabilities' &&
      typeof init?.body === 'string'
    ) {
      const query = JSON.parse(init.body);
      if (query.routeKey?.capability === 'DAILY_TRADING_STATUS') {
        injectedStatusErrors.push({ requestId: query.requestId, target: query.routeTarget });
        return new Response(
          JSON.stringify({
            detail: {
              contractVersion: 1,
              requestId: query.requestId,
              error: {
                code: marketDataErrorCodeV3.invalidResponse,
                message: marketDataErrorMessageV3.invalidResponse,
              },
            },
          }),
          { status: 502 },
        );
      }
    }
    return originalFetch(input, init);
  };
}
try {
  const before = await witness();
  const job = await prisma.backtestJob.findUniqueOrThrow({
    where: { id: process.env.PRICE_RESEARCH_RUN_ID },
  });
  const version = await prisma.strategyVersion.findUniqueOrThrow({
    where: { id: job.strategyVersionId },
  });
  const frozenInput = process.env.PRICE_RESEARCH_FROZEN_INPUT === '1';
  const request = frozenInput
    ? null
    : backtestRunPreparationRequestV3Schema.parse(job.input.preparation);
  if (request) {
    assert.equal(request.priceResearch, 'price-research-v1');
    assert.equal(request.freezeTimePolicy, 'after-acquisition');
  } else {
    assert.equal(job.runConfig.priceResearch.protocolVersion, 'price-research-v1');
    assert(job.runConfig.frozenExecutionWindow && job.runConfig.priceResearch.actualPriceWindow);
  }
  const strategy = strategySchema.parse(version.schema);
  const stored = await prisma.desiredProviderPolicy.findUnique({
    where: { consumer: 'thesis-ledger' },
    include: { history: { orderBy: { revision: 'desc' }, take: 20 } },
  });
  assert.equal(stored?.syncState, 'applied', '当前路由未应用，停止核验');
  const policy = marketPolicyCatalogResponse(stored);
  const control = { getPolicy: () => Promise.resolve(policy) };
  const dsa = new DsaClient();
  const dataReadErrors = [];
  const post = dsa.post.bind(dsa);
  dsa.post = async (path, query, ...options) => {
    try {
      return await post(path, query, ...options);
    } catch (error) {
      dataReadErrors.push({
        path,
        capability: query.routeKey?.capability,
        target: query.routeTarget,
        code: error.code,
        status: error.status,
        sourceReason: error.sourceReason,
        message: error.message,
      });
      throw error;
    }
  };
  const evidence = new MarketWindowEvidenceV3Repository(prisma);
  const frozen = new MarketFrozenWindowReaderV3(
    evidence,
    new MarketRouteRevisionService(control, dsa),
  );
  const windows = new MarketBarWindowReaderV3(control, dsa, evidence, frozen);
  const reads = [];
  const reader = {
    readV3: async (input) => {
      assert(!frozenInput || input.frozenWindowRef, '冻结输入模式禁止重新采集行情');
      const read = await windows.read(input);
      reads.push({
        adjustment: input.routeKey.adjustment,
        frozen: Boolean(input.frozenWindowRef),
        status: read.status,
        ...(read.status === 'selected'
          ? {
              provenance: read.selection.response.provenance,
              bars: read.selection.response.bars.length,
            }
          : { selection: read.selection }),
      });
      return read;
    },
  };
  const item = {
    originalRunId: job.id,
    strategyVersionId: version.id,
    strategyHash: hashCanonicalManifest(strategy),
    symbol: strategy.executionInstrument.symbol,
    startDate: (request?.runConfig ?? job.runConfig).startDate,
    endDate: (request?.runConfig ?? job.runConfig).endDate,
    status: 'blocked',
    reads,
    dataReadErrors,
    injectedStatusErrors,
  };
  try {
    const cached = JSON.parse(process.env.PRICE_RESEARCH_PREPARED ?? 'null');
    if (cached) {
      assert.equal(cached.originalRunId, job.id);
      assert.equal(cached.strategyVersionId, version.id);
      assert.equal(cached.strategyHash, item.strategyHash);
      assert.equal(cached.preparation.runConfig.startDate, item.startDate);
      assert.equal(cached.preparation.runConfig.endDate, item.endDate);
    }
    const frozenExecution = frozenInput
      ? await evidence.findFrozen(job.runConfig.frozenExecutionWindow.identityFingerprint)
      : null;
    if (frozenInput) assert(frozenExecution, '原运行冻结行情缺失');
    const prepared = frozenInput
      ? {
          status: 'prepared',
          runConfig: job.runConfig,
          actualSource: { routeKey: frozenExecution.response.routeKey },
        }
      : (cached?.preparation ??
        (await prepareBacktestRunConfigV3({
          request,
          strategy,
          reader,
          control,
          checkedAt: new Date().toISOString(),
        })));
    item.preparation = prepared;
    item.reusedPreparedReport = Boolean(cached);
    item.reusedOriginalFrozenInput = frozenInput;
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared.diagnostics));
    root = await mkdtemp(join(tmpdir(), 'price-research-live-run-'));
    const snapshots = new LocalSnapshotStore(root);
    const runId = randomUUID();
    const snapshot = await new DsaSnapshotBuilder(dsa, snapshots, reader).buildV3({
      runId,
      strategyVersionId: version.id,
      strategyVersionHash: item.strategyHash,
      strategy,
      runConfig: prepared.runConfig,
      executionRouteKey: prepared.actualSource.routeKey,
    });
    const runner = new LocalSnapshotV3Runner(snapshots);
    const compositionRef = snapshot.artifactRefs.find((ref) =>
      ref.key.endsWith(`/${statusCompositionArtifactKeyV1}`),
    );
    if (compositionRef) {
      const rows = [];
      for await (const row of await snapshots.artifacts.openRead(compositionRef)) rows.push(row);
      const value = JSON.parse(rows[0].payload);
      item.statusComposition = value.composition.entries.map((entry) => ({
        capability: entry.query.routeKey.capability,
        status: entry.status,
        ...(entry.status === 'failed'
          ? { error: entry.error }
          : { target: entry.result.routeTarget }),
      }));
    }
    if (process.env.PRICE_RESEARCH_STATUS_SOURCE_ERROR === '1') {
      assert(injectedStatusErrors.length > 0 && injectedStatusErrors.length <= 2);
      assert(
        item.statusComposition.some(
          (entry) =>
            entry.capability === 'DAILY_TRADING_STATUS' &&
            entry.status === 'failed' &&
            entry.error === 'invalid-response',
        ),
      );
      assert(
        item.statusComposition.some((entry) => entry.status === 'included'),
        '其他能力事实未保留',
      );
    }
    const runnerInput = {
      runId,
      snapshotRef: snapshot.snapshotRef,
      artifactRefs: snapshot.artifactRefs,
    };
    const result = await runner.run(runnerInput, new AbortController().signal);
    const replay = await runner.run(runnerInput, new AbortController().signal);
    assert.equal(replay.resultChecksum, result.resultChecksum, '离线重放结果不一致');
    item.status = 'prepared';
    item.manifest = snapshot.manifest;
    item.result = {
      resultChecksum: result.resultChecksum,
      completeness: result.completeness,
      warnings: result.warnings,
      metrics: result.metrics,
      benchmark: result.benchmark,
      simulationFills: result.simulationFills.length,
      rejectedOrders: result.rejectedOrders.length,
      equityPoints: result.equityCurve.length,
      lastEquity: result.equityCurve.at(-1),
      researchBalances: result.priceResearch,
      offlineReplayMatched: true,
    };
  } catch (error) {
    item.error = String(error.stack ?? error);
  }
  const businessStateUnchanged = JSON.stringify(await witness()) === JSON.stringify(before);
  console.log(
    'PRICE_RESEARCH_LIVE_RECEIPT=' +
      JSON.stringify({
        checkedAt: new Date().toISOString(),
        policyRevision: policy.revision,
        businessStateUnchanged,
        createdBacktestJobs: 0,
        persistedResearchVersions: 0,
        cases: [item],
      }),
  );
  if (!businessStateUnchanged || item.status !== 'prepared') process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  if (root) await rm(root, { recursive: true, force: true });
  await prisma.$disconnect();
}
