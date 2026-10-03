import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { BacktestRunService } from '../../src/backtest/backtest-run.service.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { planSnapshotInputsV3 } from '../../src/backtest/backtest-snapshot-v3-input-plan.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function build(
  period: number,
  responseHash = 'b'.repeat(64),
  revision?: string,
  ignorePin = false,
) {
  const root = await mkdtemp(join(tmpdir(), 'v3-frozen-comparison-'));
  roots.push(root);
  const fixture = await completeSnapshotFixture();
  const { input } = fixture;
  if (input.strategy.entry.type !== 'compare' || input.strategy.entry.right.type !== 'indicator')
    throw new Error('fixture');
  input.strategy.entry.right.params.period = period;
  if (period === 0) {
    input.strategy.entry = { type: 'positionState', field: 'isOpen' };
    input.strategy.exit = { type: 'not', expression: { type: 'positionState', field: 'isOpen' } };
    input.runConfig.priceInputBindings = {
      signals: [],
      benchmark: { binding: 'execution-series' },
    };
  }
  input.strategyVersionHash = hashCanonicalManifest(input.strategy);
  input.runConfig.frozenExecutionWindow = {
    version: 'market-frozen-window-v1',
    identityFingerprint: 'a'.repeat(64),
    responseHash,
  };
  if (revision)
    input.runConfig.executionPriceProtocol.priceBasis.revision = {
      origin: 'provider',
      id: revision,
    };
  fixture.reader.readV3.mockImplementation(async (request) => {
    const result = await makeReaderResult(request);
    if (result.status !== 'selected') throw new Error('fixture');
    // 同一父窗口的价格按日期确定，不能随子窗口的预热起点变化。
    result.selection.response.bars = result.selection.response.bars.map((bar) => ({
      ...bar,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 1000,
      amount: 1500,
    }));
    if (revision) {
      result.selection.response.sourcePriceBasis.revision = { origin: 'provider', id: revision };
      result.evidence.sourcePriceBasis = structuredClone(
        result.selection.response.sourcePriceBasis,
      );
    }
    return ignorePin ? result : { ...result, frozenWindowRef: request.frozenWindowRef! };
  });
  const store = new LocalSnapshotStore(root);
  const built = await new DsaSnapshotBuilder(
    fixture.dsa as unknown as DsaClient,
    store,
    fixture.reader,
  ).buildV3(input);
  const job = {
    id: input.runId,
    mode: 'V3',
    strategyVersionId: input.strategyVersionId,
    periodStart: new Date(`${input.runConfig.startDate}T00:00:00.000Z`),
    periodEnd: new Date(`${input.runConfig.endDate}T00:00:00.000Z`),
    dataAsOf: new Date(input.runConfig.dataAsOf),
    runConfig: input.runConfig,
    snapshotId: built.manifest.contentHash,
    snapshotManifest: built.manifest,
    input: {
      contractVersion: 3,
      schemaVersion: '3',
      strategyVersionId: input.strategyVersionId,
      runConfig: input.runConfig,
      snapshotId: built.manifest.contentHash,
      snapshotVersion: built.manifest.manifestVersion,
    },
  };
  const runs = new BacktestRunService(
    { backtestJob: { findUnique: async () => job } } as never,
    undefined,
    store,
  );
  const fingerprint = await runs.comparableDataFingerprint(input.runId, {
    start: input.runConfig.startDate,
    end: input.runConfig.endDate,
  });
  return { fingerprint, built, reader: fixture.reader, store };
}

describe('V3 冻结窗口的离线比较', () => {
  it('候选预热超过已冻结预算时在读取行情前拒绝', async () => {
    const { input } = await completeSnapshotFixture();
    input.runConfig.frozenExecutionWindow = {
      version: 'market-frozen-window-v1',
      identityFingerprint: 'a'.repeat(64),
      responseHash: 'b'.repeat(64),
    };
    input.runConfig.frozenWarmupBudgetSessions = 4;
    expect(() => planSnapshotInputsV3(input)).toThrow('超过实验已冻结');
    input.runConfig.frozenWarmupBudgetSessions = 5;
    expect(() => planSnapshotInputsV3(input)).not.toThrow();
  });
  it('不同预热策略复用相同父窗口，执行区间指纹一致', async () => {
    const baseline = await build(5);
    const candidate = await build(10);
    expect(candidate.built.manifest.dateRange.warmupStartDate).not.toBe(
      baseline.built.manifest.dateRange.warmupStartDate,
    );
    expect(candidate.fingerprint).toBe(baseline.fingerprint);
    expect((await build(0)).fingerprint).toBe(baseline.fingerprint);
    expect(candidate.reader.readV3).toHaveBeenCalledWith(
      expect.objectContaining({
        frozenWindowRef: candidate.built.manifest.frozenExecutionWindow,
        warmup: expect.objectContaining({ minimumSessions: 10 }),
      }),
    );
    await expect(candidate.store.v3.replay(candidate.built.manifest.runId)).resolves.toMatchObject({
      frozenExecutionWindow: candidate.built.manifest.frozenExecutionWindow,
    });
  });

  it('父窗口或来源修订变化不能归入同一比较组', async () => {
    const baseline = await build(5);
    expect((await build(5, 'c'.repeat(64))).fingerprint).not.toBe(baseline.fingerprint);
    expect((await build(5, 'b'.repeat(64), 'different-revision')).fingerprint).not.toBe(
      baseline.fingerprint,
    );
  });

  it('Reader 忽略固定引用时拒绝生成 Snapshot', async () => {
    await expect(build(5, 'b'.repeat(64), undefined, true)).rejects.toThrow('未使用指定的冻结窗口');
  });
});
