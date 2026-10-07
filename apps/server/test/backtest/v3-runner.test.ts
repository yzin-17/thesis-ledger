import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import {
  backtestResultSchemaV3,
  runConfigSchemaV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { hashCanonicalManifest, LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import {
  LocalSnapshotV3Runner,
  projectV3SimulationRejects,
} from '../../src/backtest/backtest-v3-runner.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const setProportionalCosts = (runConfig: RunConfigV3) => {
  if (!runConfig.executionModel) throw new Error('Fixture 缺少 execution model');
  const proportionalize = (fee: { treatment: string }, rate: string) =>
    fee.treatment === 'charged'
      ? {
          ...fee,
          side: 'both' as const,
          basis: 'turnover' as const,
          rate,
          minimum: { kind: 'none' as const },
        }
      : fee;
  const model = structuredClone(runConfig.executionModel);
  const segments: unknown[] = model.segments.map((segment) => {
    if (segment.execution.mode !== 'exchange') return segment;
    const { fees } = segment;
    if (!fees) throw new Error('Exchange Fixture 缺少费用配置');
    return {
      ...segment,
      fees: {
        ...fees,
        commission: {
          ...fees.commission,
          side: 'both' as const,
          rate: '0.0003',
          minimum: { kind: 'none' as const },
        },
        stampDuty: proportionalize(fees.stampDuty, '0.0002'),
        transferFee: proportionalize(fees.transferFee, '0.00001'),
        regulatoryFee: proportionalize(fees.regulatoryFee, '0.00001'),
        handlingFee: proportionalize(fees.handlingFee, '0.00001'),
      },
    };
  });
  Object.assign(
    runConfig,
    runConfigSchemaV3.parse({
      ...runConfig,
      executionModel: { ...model, segments },
    }),
  );
};

const setup = async (options?: {
  complete?: boolean;
  cost?: 'default' | 'proportional';
  signalOnlyAtRangeEnd?: boolean;
  tailSide?: 'sell';
}) => {
  const root = await mkdtemp(join(tmpdir(), 'v3-runner-'));
  directories.push(root);
  const fixture = await completeSnapshotFixture();
  if (options?.cost === 'proportional') {
    setProportionalCosts(fixture.input.runConfig);
    fixture.input.strategy.cost.slippageRate = '0.001';
  }
  const original = fixture.reader.readV3.getMockImplementation()!;
  fixture.reader.readV3.mockImplementation(async (request) => {
    const result = await original(request);
    if (result.status === 'selected' && options?.signalOnlyAtRangeEnd) {
      const response = result.selection.response;
      for (const bar of response.bars) {
        if (options.tailSide !== 'sell') bar.availableAt = response.sourcePriceBasis.observedAt;
        bar.open = 1;
        bar.close = bar === response.bars.at(-1) ? 2 : 1;
        bar.high = bar.close;
        bar.low = 1;
      }
    }
    return result;
  });
  if (options?.tailSide === 'sell') {
    fixture.input.strategy.entry = {
      type: 'compare',
      operator: 'gte',
      left: { type: 'series', sourceId: 'execution', field: 'close' },
      right: {
        type: 'indicator',
        name: 'MA',
        input: { type: 'series', sourceId: 'execution', field: 'close' },
        params: { period: 1 },
      },
    };
    fixture.input.strategy.exit = {
      type: 'compare',
      operator: 'gt',
      left: { type: 'series', sourceId: 'execution', field: 'close' },
      right: {
        type: 'indicator',
        name: 'MA',
        input: { type: 'series', sourceId: 'execution', field: 'close' },
        params: { period: 2 },
      },
    };
  }
  fixture.input.strategyVersionHash = hashCanonicalManifest(fixture.input.strategy);
  if (options?.complete === false) delete fixture.input.runConfig.priceInputBindings;

  const snapshots = new LocalSnapshotStore(root);
  const built = await new DsaSnapshotBuilder(
    fixture.dsa as unknown as DsaClient,
    snapshots,
    fixture.reader,
  ).buildV3(fixture.input);
  fixture.reader.readV3.mockClear();
  return {
    fixture,
    snapshots,
    built,
    runner: new LocalSnapshotV3Runner(snapshots),
    input: {
      runId: fixture.input.runId,
      snapshotRef: built.snapshotRef,
      artifactRefs: built.artifactRefs,
    },
  };
};

const signal = () => new AbortController().signal;

describe('LocalSnapshotV3Runner', () => {
  it('replays a complete frozen Snapshot offline with strict deterministic benchmark disclosure', async () => {
    const { fixture, built, runner, input } = await setup();

    const result = await runner.run(input, signal());
    const repeated = await runner.run(input, signal());
    const { resultChecksum, ...checksumPayload } = result;

    expect(backtestResultSchemaV3.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      runId: fixture.input.runId,
      strategyVersionId: fixture.input.strategyVersionId,
      snapshotId: built.manifest.contentHash,
      schemaVersion: '3',
      snapshotVersion: 'snapshot-manifest-v3',
      executionPriceProtocol: built.manifest.executionPriceProtocol,
      comparableDataFingerprint: built.manifest.comparableDataFingerprint,
      actualSources: built.manifest.actualSources,
      executionModelDisclosure: {
        model: fixture.input.runConfig.executionModel,
        contentHash: built.manifest.executionModel?.contentHash,
      },
      benchmarkCompatibility: {
        costAssumption: { kind: 'unsupported' },
      },
      benchmark: {
        totalReturn: { status: 'unavailable', reason: 'BENCHMARK_COST_MODEL_UNSUPPORTED' },
        excessReturn: { status: 'unavailable' },
      },
    });
    expect(result.completeness).not.toBe('complete');
    expect(result.warnings).toContain(
      'BENCHMARK_EVALUATION:v3-buy-first-in-range-close-liquidate-last-in-range-close-by-trading-date-v2',
    );
    expect(resultChecksum).toBe(deterministicResultChecksum(checksumPayload));
    expect(repeated).toEqual(result);
    expect(fixture.reader.readV3).not.toHaveBeenCalled();
    expect(result).toHaveProperty('benchmarkCompatibility');
    expect(
      deterministicResultChecksum({
        ...checksumPayload,
        benchmark: {
          ...result.benchmark,
          totalReturn: { status: 'available', value: '123.45' },
        },
      }),
    ).not.toBe(resultChecksum);
  });

  it('projects available benchmark and excess returns using frozen proportional costs', async () => {
    const { runner, input } = await setup({ cost: 'proportional' });

    const result = await runner.run(input, signal());

    expect(backtestResultSchemaV3.safeParse(result).success).toBe(true);
    expect(result.benchmarkCompatibility).toMatchObject({
      status: 'compatible',
      costAssumption: {
        kind: 'proportional',
        commissionRate: '0.00051',
        slippageRate: '0.001',
      },
    });
    const benchmark = result.benchmark;
    if (!benchmark) throw new Error('Runner 未返回 benchmark projection');
    const totalReturn = benchmark.totalReturn;
    const excessReturn = benchmark.excessReturn;
    if (totalReturn?.status !== 'available' || excessReturn?.status !== 'available') {
      throw new Error('Fixture 预期可用的 benchmark metrics');
    }
    expect(result.completeness).toBe('complete');
  });

  it('rejects mismatched Snapshot identity, partial refs, duplicate refs, and tampered refs', async () => {
    const { runner, input } = await setup();
    const foreignArtifact = { ...input.artifactRefs[0]!, contentHash: '0'.repeat(64) };

    await expect(
      runner.run(
        { ...input, snapshotRef: { ...input.snapshotRef, snapshotId: 'foreign' } },
        signal(),
      ),
    ).rejects.toThrow('Snapshot contentHash 不匹配');
    await expect(
      runner.run({ ...input, artifactRefs: input.artifactRefs.slice(1) }, signal()),
    ).rejects.toThrow('ArtifactRefs 必须与 finalized Snapshot 完全一致');
    await expect(
      runner.run(
        { ...input, artifactRefs: [...input.artifactRefs, input.artifactRefs[0]!] },
        signal(),
      ),
    ).rejects.toThrow('ArtifactRefs 包含重复 key');
    await expect(
      runner.run(
        {
          ...input,
          artifactRefs: input.artifactRefs.map((artifact, index) =>
            index === 0 ? foreignArtifact : artifact,
          ),
        },
        signal(),
      ),
    ).rejects.toThrow('ArtifactRef 不属于 finalized Snapshot');
    await expect(
      runner.run(
        {
          ...input,
          artifactRefs: input.artifactRefs.map((artifact, index) =>
            index === 0 ? { ...artifact, key: `${input.runId}/foreign.parquet` } : artifact,
          ),
        },
        signal(),
      ),
    ).rejects.toThrow('ArtifactRef 不属于 finalized Snapshot');
  });

  it('requires complete snapshots and a metadata strategy hash matching the manifest', async () => {
    const partial = await setup({ complete: false });
    await expect(partial.runner.run(partial.input, signal())).rejects.toThrow(
      '只执行 finalized complete Snapshot',
    );

    const mismatchedHash = await setup();
    const fixture = await completeSnapshotFixture();
    fixture.input.strategyVersionHash = 'not-the-frozen-strategy-hash';
    const built = await new DsaSnapshotBuilder(
      fixture.dsa as unknown as DsaClient,
      mismatchedHash.snapshots,
      fixture.reader,
    ).buildV3({ ...fixture.input, runId: 'strategy-hash-mismatch' });
    await expect(
      mismatchedHash.runner.run(
        {
          runId: 'strategy-hash-mismatch',
          snapshotRef: built.snapshotRef,
          artifactRefs: built.artifactRefs,
        },
        signal(),
      ),
    ).rejects.toThrow('strategy metadata 与 strategyVersionHash 不一致');
  });

  it('preserves cancellation and projects terminal DAY-expired buy and sell orders', async () => {
    const cancelled = await setup();
    const controller = new AbortController();
    controller.abort();
    await expect(cancelled.runner.run(cancelled.input, controller.signal)).rejects.toThrow(
      '回测已取消',
    );

    const cancelledAfterReplay = await setup();
    const replay = cancelledAfterReplay.snapshots.v3.replay.bind(cancelledAfterReplay.snapshots.v3);
    const replayController = new AbortController();
    vi.spyOn(cancelledAfterReplay.snapshots.v3, 'replay').mockImplementation(async (runId) => {
      const manifest = await replay(runId);
      replayController.abort();
      return manifest;
    });
    await expect(
      cancelledAfterReplay.runner.run(cancelledAfterReplay.input, replayController.signal),
    ).rejects.toThrow('回测已取消');

    const tail = await setup({ signalOnlyAtRangeEnd: true });
    const buyResult = await tail.runner.run(tail.input, signal());
    expect(buyResult.completeness).not.toBe('unavailable');
    expect(buyResult).toMatchObject({
      rejectedOrders: [
        {
          side: 'buy',
          reasonCode: 'DAY_EXPIRED',
          occurredAt: '2026-05-20T07:00:00.000Z',
        },
      ],
      simulationFills: [],
    });
    expect(buyResult.rejectedOrders[0]?.orderId).toBeTruthy();
    expect(buyResult.rejectedOrders[0]?.message).toBeTruthy();

    const sellTail = await setup({ signalOnlyAtRangeEnd: true, tailSide: 'sell' });
    const sellResult = await sellTail.runner.run(sellTail.input, signal());
    expect(sellResult.completeness).not.toBe('unavailable');
    expect(sellResult).toMatchObject({
      rejectedOrders: [
        {
          side: 'sell',
          reasonCode: 'DAY_EXPIRED',
          occurredAt: '2026-05-20T07:00:00.000Z',
        },
      ],
    });
    expect(sellResult.rejectedOrders[0]?.orderId).toBeTruthy();
    expect(sellResult.rejectedOrders[0]?.message).toBeTruthy();
    expect(sellResult.simulationFills.map((fill) => fill.side)).toEqual(['buy']);
  });

  it('keeps non-order diagnostics as warnings and fails closed on incomplete order identity', () => {
    const diagnostic = {
      rejectionId: 'run-1:corporate-action:event-1',
      code: 'RULE_REJECTED',
      reason: 'corporate action port unavailable',
      occurredAt: '2026-05-20T07:00:00.000Z',
      availableAt: '2026-05-20T07:00:00.000Z',
      inputFacts: ['event-1'],
    } as const;
    const projected = projectV3SimulationRejects([diagnostic], '159516.SZ');

    expect(projected.rejectedOrders).toEqual([]);
    expect(projected.warnings).toEqual([
      expect.stringContaining(
        'run-1:corporate-action:event-1 RULE_REJECTED @ 2026-05-20T07:00:00.000Z: corporate action port unavailable',
      ),
    ]);
    for (const incompleteOrder of [
      { ...diagnostic, rejectionId: 'run-1:order:missing-side', orderId: 'order-1' },
      { ...diagnostic, rejectionId: 'run-1:order:missing-id', side: 'buy' as const },
    ]) {
      expect(() => projectV3SimulationRejects([incompleteOrder], '159516.SZ')).toThrow(
        'V3 Runner cannot safely project rejected-order identity',
      );
    }
  });
});
