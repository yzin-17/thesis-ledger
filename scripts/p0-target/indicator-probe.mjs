import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { numericExpressionKey } from '@thesis-ledger/domain';
import { backtestResultSchemaV3 } from '@thesis-ledger/schemas';

const root = '/app/apps/server/dist/src';
const { DsaSnapshotBuilder } = await import(`${root}/backtest/backtest-snapshot-builder.js`);
const { LocalSnapshotStore, hashCanonicalManifest } = await import(`${root}/backtest/backtest-snapshot.js`);
const { LocalSnapshotV3Runner } = await import(`${root}/backtest/backtest-v3-runner.js`);
const { runBacktestAttempt } = await import(`${root}/backtest/backtest-run-attempt.js`);
const { buildPointInTimeIndicatorSeries } = await import(`${root}/backtest/backtest-adjusted-indicators.js`);
const input = globalThis.__P0_TARGET_INPUTS;
assert.equal(input.version, 'p0-target-inputs-v1');
assert.equal(input.datasetKind, 'synthetic');
assert.deepEqual(input.cases.map((item) => item.name), ['RSI', 'ATR']);
const url = new URL(process.env.P0_DATABASE_URL);
assert.equal(url.pathname, '/p0_indicator_fixture');
assert.equal(url.username, 'fixture_owner');
const prisma = new PrismaClient({ datasourceUrl: url.toString() });
const owned = await mkdtemp(join(tmpdir(), 'p0-target-indicators-'));
const outcomes = [];
const series = (values) => ({ sourceId: 'execution', symbol: 'CONTROLLED', market: 'CN',
  assetType: 'stock', field: 'close', timeframe: '1d', adjusted: false,
  points: values.map((value, i) => ({ occurredAt: `2025-01-0${i + 1}T00:00:00Z`,
    availableAt: i === 0 ? '2025-01-10T00:00:00Z' : `2025-01-0${i + 1}T00:00:00Z`,
    value: String(value), close: String(value), high: String(value + 1), low: String(value - 1), status: 'available' })) });
const expr = (name, period) => ({ type: 'indicator', name, params: { period },
  input: { type: 'series', sourceId: 'execution', field: 'close' } });
const evaluate = (source, expression, points = source.points) => {
  const ticks = [...points, { occurredAt: '2025-01-10T00:00:00Z' }];
  return buildPointInTimeIndicatorSeries({ expressions: [expression],
    sourceSeries: new Map([['execution:close', source]]), corporateActions: [],
    ticks: ticks.map((point) => ({ occurredAt: point.occurredAt, availableAt: point.occurredAt })) })
    .get(numericExpressionKey(expression));
};
try {
  assert.deepEqual(await prisma.$queryRaw`SELECT current_database() AS database, current_user AS owner`,
    [{ database: 'p0_indicator_fixture', owner: 'fixture_owner' }]);
  for (const name of ['RSI', 'EMA']) {
    assert.equal(evaluate(series([100, 90, 91, 92, 93]), expr(name, 2)).points[4].status, 'unavailable');
  }
  const atrSource = series([100, 11]);
  for (const points of [atrSource.points, [atrSource.points.at(-1)]])
    assert.equal(evaluate(atrSource, expr('ATR', 1), points).points.at(-2).status, 'unavailable');
  outcomes.push('实际 Server 消费者拒绝 RSI/EMA 晚到种子及 ATR 晚到前收；批量与单 tick 一致');

  for (const sample of input.cases) {
    const buildInput = structuredClone(sample.input);
    const strategy = await prisma.strategy.create({ data: { name: `P0 ${sample.name}`, schemaVersion: 3 } });
    const version = await prisma.strategyVersion.create({ data: { strategyId: strategy.id,
      version: 1, schemaVersion: 3, schema: buildInput.strategy } });
    buildInput.runId = randomUUID();
    buildInput.strategyVersionId = version.id;
    const queue = structuredClone(sample.tape);
    let sourceReads = 0;
    const consume = (method) => async (request) => {
      const position = queue.findIndex((item) => item.method === method &&
        hashCanonicalManifest(item.request) === hashCanonicalManifest(request));
      assert(position >= 0, `未登记的合成来源请求：${method}`);
      const { response } = queue.splice(position, 1)[0];
      if (response.evidence?.fetchedAt) response.evidence.fetchedAt = new Date(response.evidence.fetchedAt);
      sourceReads++;
      return response;
    };
    const snapshots = new LocalSnapshotStore(join(owned, sample.name));
    const built = await new DsaSnapshotBuilder({ backtestCalendar: consume('calendar'),
      backtestInstrumentFacts: consume('instrument') }, snapshots, { readV3: consume('bars') }).buildV3(buildInput);
    assert.equal(queue.length, 0);
    const before = await snapshots.v3.replay(buildInput.runId);
    const runner = new LocalSnapshotV3Runner(snapshots);
    const job = await prisma.backtestJob.create({ data: { id: buildInput.runId, strategyVersionId: version.id,
      mode: 'V3', status: 'queued', stage: 'queued', periodStart: new Date(buildInput.runConfig.startDate),
      periodEnd: new Date(buildInput.runConfig.endDate), dataAsOf: new Date(buildInput.runConfig.dataAsOf),
      input: { contractVersion: 3, schemaVersion: '3', runConfig: buildInput.runConfig },
      runConfig: buildInput.runConfig, engineVersion: runner.id } });
    const request = { runId: job.id, snapshotRef: built.snapshotRef, artifactRefs: built.artifactRefs };
    const finished = await runBacktestAttempt({ prisma, job, runnerId: runner.id, activeControllers: new Map(),
      execute: async (_, signal) => {
        const result = backtestResultSchemaV3.parse(await runner.run(request, signal));
        return { result, resultChecksum: hashCanonicalManifest(result) };
      }, classifyFailure: (error) => ({ code: 'P0_ACCEPTANCE_FAILED', summary: error.message, retryable: false }) });
    assert.equal(finished.status, 'succeeded', finished.errorSummary ?? '目标 V3 执行失败');
    assert.equal(finished.executionAttempt, 1);
    assert.equal(finished.engineVersion, 'thesis-ledger-v3-local-runner-v3');
    const replay = await new LocalSnapshotV3Runner(new LocalSnapshotStore(join(owned, sample.name)))
      .run(request, new AbortController().signal);
    assert.deepEqual(replay, finished.result);
    assert.deepEqual(await snapshots.v3.replay(buildInput.runId), before);
    assert.equal(sourceReads, sample.tape.length);
    const preserved = await prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } });
    for (const status of ['queued', 'succeeded', 'failed', 'cancelled']) {
      const old = await prisma.backtestJob.create({ data: { strategyVersionId: version.id, mode: 'V3', status,
        periodStart: job.periodStart, periodEnd: job.periodEnd, dataAsOf: job.dataAsOf,
        input: job.input, engineVersion: 'thesis-ledger-v3-local-runner-v2', result: { original: true },
        resultChecksum: 'original-checksum', snapshotId: 'original-snapshot', snapshotManifest: { original: true } } });
      let executed = false;
      await runBacktestAttempt({ prisma, job: old, runnerId: runner.id, activeControllers: new Map(),
        execute: async () => { executed = true; throw new Error('旧 Run 不应执行'); },
        classifyFailure: () => ({ code: 'UNEXPECTED', summary: '不应到达', retryable: false }) });
      assert.equal(executed, false);
      const after = await prisma.backtestJob.findUniqueOrThrow({ where: { id: old.id } });
      for (const key of ['engineVersion', 'result', 'resultChecksum', 'snapshotId', 'snapshotManifest'])
        assert.deepEqual(after[key], old[key]);
      if (status === 'queued') assert.equal(after.errorCode, 'INDICATOR_ENGINE_VERSION_CHANGED');
      else assert.deepEqual(after, old);
    }
    assert.deepEqual(await prisma.backtestJob.findUniqueOrThrow({ where: { id: job.id } }), preserved);
    outcomes.push(`${sample.name}：实际目标构建/冻结/执行/SQL 终态及离线重放通过；四种旧 Run 不重算、不改结果或快照`);
  }
  console.log('P0_RESULT ' + JSON.stringify({ gate: 'IVAG', outcomes, realSourceReads: 0, realModelCalls: 0 }));
} finally {
  await prisma.$disconnect();
  await rm(owned, { recursive: true, force: true });
}
