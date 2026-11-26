import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Prisma } from '@prisma/client';
import type { MarketDataBarRouteKeyV3 } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { executionBarRowsV3 } from '../../src/backtest/backtest-v3-execution-bar-rows.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { MarketBarWindowReaderV3 } from '../../src/market/market-bar-reader-v3.js';
import { MarketFrozenWindowReaderV3 } from '../../src/market/market-frozen-window-reader-v3.js';
import { MarketRouteRevisionService } from '../../src/market/market-route-revision.service.js';
import { MarketWindowEvidenceV3Repository } from '../../src/market/market-window-evidence-v3.repository.js';
import { decodeMarketWindowEvidenceInsert } from '../market/market-window-evidence-v3-sql-mock.js';
import { priceResearchFixture } from './price-research.fixtures.js';

const dsaRoot = resolve('../../..', 'daily-stock-analysis');
// 已提交的原始 V1 生产代码。三阶段共用本机 Python 运行时及受控行情样本。
const legacyRevision = '2dec2a938ec9000c5828856934eb27eef52ae347';
const enabled = process.env.BACKTEST_DSA_PROCESS_ISOLATED === '1';

async function startProducer(source: string, cwd: string, args: string[] = []) {
  const child = spawn(resolve(dsaRoot, '.venv/bin/python'), ['-B', '-u',
    resolve(dsaRoot, 'tests/backtest_daily_observation_server.py'), ...args], {
    cwd, stdio: ['pipe', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, HOME: cwd, PYTHONPATH: source,
      DATABASE_PATH: resolve(cwd, 'isolated-dsa.sqlite') },
  });
  let logs = '';
  child.stderr.on('data', (bytes: Buffer) => { logs = (logs + bytes.toString()).slice(-3000); });
  const exited = new Promise<number | null>((done) => child.once('close', (code) => done(code)));
  const lines = createInterface({ input: child.stdout });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ready = new Promise<{ port: number; pid: number }>((done, reject) => {
    child.once('error', reject);
    timer = setTimeout(() => reject(Error(`独立 DSA 启动超时：${logs}`)), 15_000);
    lines.on('line', (line) => {
      if (line.startsWith('{"port":')) done(JSON.parse(line) as { port: number; pid: number });
    });
  });
  try {
    const address = await Promise.race([ready, exited.then((code) => {
      throw Error(`独立 DSA 未就绪即退出（${code}）：${logs}`);
    })]);
    expect(address.pid).not.toBe(process.pid);
    return { ...address, async stop() {
      if (child.exitCode === null && child.signalCode === null) child.stdin.end('\n');
      const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
      try { expect(await exited, logs).toBe(0); }
      finally { clearTimeout(deadline); }
    } };
  } catch (error) {
    child.kill('SIGKILL');
    await exited;
    throw error;
  } finally { clearTimeout(timer); }
}

function clientAt(port: number) {
  vi.stubEnv('DSA_BASE_URL', `http://127.0.0.1:${port}`);
  vi.stubEnv('THESIS_LEDGER_DSA_TOKEN', 'isolated-price-only-contract');
  vi.stubEnv('DATABASE_URL', 'postgresql://unused:unused@127.0.0.1:1/never_connect');
  vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:1');
  return new DsaClient();
}

(enabled ? describe : describe.skip)('独立Python真实V3路由与Server缺量合同', () => {
  let producer: Awaited<ReturnType<typeof startProducer>>;
  let client: DsaClient;
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(resolve(tmpdir(), 'backtest-dsa-wire-'));
    producer = await startProducer(dsaRoot, root);
    client = clientAt(producer.port);
  }, 20_000);
  afterAll(async () => {
    try { await producer?.stop(); }
    finally {
      vi.unstubAllEnvs();
      if (root) await rm(root, { recursive: true, force: true });
    }
  });
  const request = (caseName: string, version?: 1 | 2) => ({ contractVersion: 1 as const,
    requestId: caseName, symbol: '159516.SZ', routeKey: { kind: 'bar' as const, market: 'CN' as const,
      assetType: 'ETF' as const, capability: 'DAILY_BAR' as const, timeframe: '1d' as const, adjustment: 'hfq' as const },
    start: '2026-07-09', end: '2026-07-10', tradabilityMode: 'assume-untradable-no-bar' as const,
    ...(version === 2 ? { dailyObservationContract: 'market-daily-tradability-window-v1' as const } : {}),
  });
  it('能力声明后显式版本2消费未知量价格，实际份额转换拒绝；缺省1继续拒绝', async () => {
    expect((await client.marketDataCapabilitiesV3()).dailyObservationContract).toBe('market-daily-tradability-window-v1');
    const response = await client.marketBarsV3(request('unknown-volume', 2));
    expect(response.bars[0]?.volume).toBeNull();
    expect(response.historicalTradabilityWindows?.[0]?.days[0]?.state).toBe('observed-price-only');
    expect(executionBarRowsV3(response, response.symbol, 'normalized-series', true)[0]?.volume).toBeNull();
    expect(() => executionBarRowsV3(response, response.symbol, 'raw-events')).toThrow('缺少成交量');
    await expect(client.marketBarsV3(request('unknown-volume'))).rejects.toThrow();
  });
  it.each(['zero-volume', 'negative-volume', 'bad-ohlc'])('版本2对%s分别保留拒绝分支', async (caseName) => {
    await expect(client.marketBarsV3(request(caseName, 2))).rejects.toThrow();
  });
  it('版本1缺省与显式1原响应完全相同，2使用独立指纹', async () => {
    const old = await client.marketBarsV3(request('valid-prices'));
    expect(await client.marketBarsV3(request('valid-prices', 1))).toEqual(old);
    const current = await client.marketBarsV3(request('valid-prices', 2));
    expect(current.bars).toEqual(old.bars);
    expect(current.inputFingerprint).not.toBe(old.inputFingerprint);
  });
});

async function rolloutFixture(client: DsaClient) {
  const researchSource = { providerId: 'tencent', upstreamSource: 'tencent' };
  const f = await priceResearchFixture({ researchSource });
  const { strategy } = f.input;
  strategy.signalSources = [{ id: 'price', asset: strategy.executionInstrument,
    priceCoordinate: 'research', timeframe: '1d', series: ['open', 'close'] }];
  strategy.sizing = { type: 'fixedAmount', amount: '1000' };
  strategy.entry = { type: 'compare', operator: 'gt',
    left: { type: 'series', sourceId: 'price', field: 'close' },
    right: { type: 'series', sourceId: 'price', field: 'open' } };
  const range = { start: '2026-07-09', end: '2026-07-10' };
  const executionModel = f.request.runConfig.executionModel;
  executionModel.scope.range = range;
  for (const segment of executionModel.segments) segment.range = range;
  f.request.freezeTimePolicy = 'after-acquisition';
  Object.assign(f.request.runConfig, { startDate: range.start, endDate: range.end,
    dataAsOf: new Date().toISOString() });

  const routeKey: MarketDataBarRouteKeyV3 = { ...f.input.executionRouteKey, adjustment: 'hfq' };
  // 固定已应用策略与目录，使用真实 Reader 和证据仓储，行只留在本测试内存里。
  vi.spyOn(client, 'effectiveControlPolicyV3').mockResolvedValue({
    contractVersion: 1, consumer: 'thesis-ledger', projection: { effective: {
      contractVersion: 1, consumer: 'thesis-ledger', requestId: 'isolated-rollout-policy',
      revision: 3, sourceDesiredRevision: 7, enabled: true, appliedAt: '2026-07-09T00:00:00Z',
      routes: [{ key: routeKey, reason: null,
        targets: [{ ...researchSource, routeIndex: 0, eligible: true, reason: null }] }],
    } },
  });
  vi.spyOn(client, 'marketRouteCatalogV3').mockResolvedValue({
    contractVersion: 1, consumer: 'thesis-ledger', catalogRevision: 12,
    generatedAt: '2026-07-09T00:00:00Z', integrity: 'complete',
    entries: [{ key: routeKey, target: researchSource, state: 'ready' }],
  });
  const rows = new Map<unknown, Record<string, unknown>>();
  const repository = new MarketWindowEvidenceV3Repository({
    marketBarWindowEvidenceV3: { findUnique: async ({ where }: { where: { identityFingerprint: string } }) =>
      rows.get(where.identityFingerprint) ?? null },
    $queryRaw: async (statement: Prisma.Sql) => {
      const row = decodeMarketWindowEvidenceInsert(statement);
      if (rows.has(row.identityFingerprint)) return [];
      rows.set(row.identityFingerprint, row);
      return [row];
    },
  } as never);
  const revisions = new MarketRouteRevisionService(f.control as never, client);
  const windows = new MarketBarWindowReaderV3(f.control as never, client, repository,
    new MarketFrozenWindowReaderV3(repository, revisions));
  const reader = { readV3: windows.read.bind(windows) };
  const prepare = () => prepareBacktestRunConfigV3({ request: f.request, strategy, control: f.control,
    reader, checkedAt: f.request.runConfig.dataAsOf,
 });
  return { ...f, routeKey, reader, prepare };
}

(enabled ? it : it.skip)('T06／T13f：同一兼容消费者分阶段上线、回退 DSA 并离线读取两版冻结产物', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'backtest-dsa-rollout-'));
  const legacy = resolve(root, 'legacy');
  let producer: Awaited<ReturnType<typeof startProducer>> | undefined;
  try {
    await mkdir(legacy);
    const archive = resolve(root, 'dsa-v1.tar');
    execFileSync('git', ['-C', dsaRoot, 'archive', '-o', archive, legacyRevision]);
    execFileSync('tar', ['-xf', archive, '-C', legacy]);

    producer = await startProducer(legacy, root, ['--rollout-sample', 'positive-volume']);
    const { port, pid: legacyPid } = producer;
    const client = clientAt(port);
    const f = await rolloutFixture(client);
    const wire = vi.spyOn(client, 'marketBarsV3');
    const snapshots = new LocalSnapshotStore(root);
    const builder = new DsaSnapshotBuilder(f.dsa as never, snapshots, f.reader);
    const runner = new LocalSnapshotV3Runner(snapshots);
    const prepareVersion = async (version: 1 | 2) => {
      wire.mockClear();
      const prepared = await f.prepare();
      expect(prepared.status, JSON.stringify(prepared)).toBe('prepared');
      if (prepared.status !== 'prepared') throw Error('分阶段准备未通过');
      expect(prepared.runConfig.priceResearch?.dailyObservationContract).toBe(version);
      expect(wire).toHaveBeenCalledOnce();
      const request = wire.mock.calls[0]![0];
      if (version === 1) expect(request).not.toHaveProperty('dailyObservationContract');
      else expect(request.dailyObservationContract).toBe(2);
      const response = await wire.mock.results[0]!.value;
      expect(response.historicalTradabilityWindows?.[0]?.contractVersion).toBe(version);
      return { prepared, response };
    };
    const freeze = async (runId: string, version: 1 | 2) => {
      const { prepared, response } = await prepareVersion(version);
      const frozen = await builder.buildV3({ ...f.input, runId, runConfig: prepared.runConfig,
        strategyVersionHash: hashCanonicalManifest(f.input.strategy), executionRouteKey: f.routeKey });
      expect(frozen.manifest.priceResearch?.dailyObservationContract).toBe(version);
      expect(wire).toHaveBeenCalledOnce();
      const replay = () => runner.run({ runId, ...frozen }, new AbortController().signal);
      const result = await replay();
      expect(result.simulationFills.length).toBeGreaterThan(0);
      const manifestPath = resolve(root, 'snapshots', runId, 'finalized.json');
      const manifest = await readFile(manifestPath);
      return { result, replay, manifest, manifestPath, prepared, response };
    };

    await expect(client.marketDataCapabilitiesV3()).rejects.toThrow();
    const v1 = await freeze('rollout-v1', 1);
    await producer.stop();
    producer = await startProducer(dsaRoot, root, ['--port', String(port), '--rollout-sample', 'unknown-volume']);
    const currentPid = producer.pid;
    expect((await client.marketDataCapabilitiesV3()).dailyObservationContract).toBe('market-daily-tradability-window-v1');
    const v2 = await freeze('rollout-v2', 2);
    expect(v2.response.bars.at(-1)?.volume).toBeNull();
    expect(v2.response.historicalTradabilityWindows?.[0]?.days.at(-1)?.state).toBe('observed-price-only');
    expect(v2.prepared.runConfig.frozenExecutionWindow).not.toEqual(v1.prepared.runConfig.frozenExecutionWindow);

    // 等本轮准备、冻结和运行全部完成后暂停新准备，退出新版，恢复旧版后再接收。
    await producer.stop();
    producer = await startProducer(legacy, root, ['--port', String(port), '--rollout-sample', 'positive-volume']);
    const rollbackPid = producer.pid;
    expect(new Set([legacyPid, currentPid, rollbackPid]).size).toBe(3);
    await expect(client.marketDataCapabilitiesV3()).rejects.toThrow();
    const afterRollback = await prepareVersion(1);
    expect(afterRollback.prepared.runConfig.frozenExecutionWindow).toEqual(v1.prepared.runConfig.frozenExecutionWindow);
    await producer.stop();
    for (const sample of [v1, v2]) {
      expect(await readFile(sample.manifestPath)).toEqual(sample.manifest);
      expect(await sample.replay()).toEqual(sample.result);
    }
    expect(wire).toHaveBeenCalledOnce();
    console.log('OBSERVATION_ROLLOUT_EVIDENCE', JSON.stringify({ legacyRevision, port,
      pids: [legacyPid, currentPid, rollbackPid], versions: [1, 2, 1],
      snapshots: [v1.result.snapshotId, v2.result.snapshotId],
      results: [v1.result.resultChecksum, v2.result.resultChecksum], unchangedManifestBytes: true, offlineReplays: 2 }));
  } finally {
    try { await producer?.stop(); }
    finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  }
}, 90_000);
