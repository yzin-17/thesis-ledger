import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { readSnapshotPublicFeesV3 } from '../../src/backtest/backtest-public-fees-snapshot-v3.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import { capturedResearchFixture } from './v3-captured-research-fixtures.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('保存真实股票输入的 Server 准备', () => {
  it.each(['600000.SH', '600519.SH'])(
    '准备 %s 并复用冻结窗口组装 Snapshot',
    async (symbol) => {
      const f = await capturedResearchFixture(symbol);
      const result = await f.service.prepare(f.request);
      if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
      expect(result.executionPreflight.status).toBe('ready');
      expect(result.actualSource.inputFingerprint).toBe(f.sample.response.inputFingerprint);
      expect(result.actualSource.provenance).toEqual(f.sample.response.provenance);
      expect(result.runConfig.executionModel).toEqual(f.request.runConfig.executionModel);
      expect(result.runConfig.frozenExecutionWindow).toBeDefined();
      expect(result.runConfig.frozenWarmupBudgetSessions).toBe(5);
      expect(f.dsa.marketBarsV3).toHaveBeenCalledOnce();
      expect(f.prisma.backtestJob.create).not.toHaveBeenCalled();
      const reference = result.runConfig.frozenExecutionWindow!;
      const parent = await f.repository.findFrozen(reference.identityFingerprint);
      expect(parent!.response.bars).toHaveLength(50);
      expect(
        parent!.response.bars.filter((bar) => bar.timestamp.slice(0, 10) < '2023-08-01'),
      ).toHaveLength(16);
      expect(
        parent!.response.bars.filter((bar) => bar.timestamp.slice(0, 10) >= '2023-08-01'),
      ).toHaveLength(34);
      expect(parent!.response.coverageProof.listing).toEqual(
        f.sample.response.coverageProof.listing,
      );
      f.dsa.marketBarsV3.mockRejectedValue(new Error('禁止新取价'));
      const root = await mkdtemp(join(tmpdir(), 'v3-captured-preparation-'));
      roots.push(root);
      const store = new LocalSnapshotStore(root);
      const builder = new DsaSnapshotBuilder(f.dsa as unknown as DsaClient, store, f.reader);
      const input = {
        runId: `captured-${symbol.replace('.', '-')}`,
        strategyVersionId: f.request.strategyVersionId,
        strategyVersionHash: hashCanonicalManifest(f.input.strategy),
        strategy: f.input.strategy,
        runConfig: result.runConfig,
        executionRouteKey: f.sample.request.routeKey,
      };
      const built = await builder.buildV3(input);
      expect(built.manifest.quality.completeness).toBe('complete');
      const feeRef = built.manifest.artifacts.find(
        (ref) => ref.key === built.manifest.publicFees?.artifactKey,
      )!;
      const feeRows: ArtifactRow[] = [];
      for await (const row of await store.artifacts.openRead(feeRef)) feeRows.push(row);
      const frozenFees = readSnapshotPublicFeesV3(built.manifest, result.runConfig, feeRows);
      expect(frozenFees?.disclosure.status).toBe('executionModel');
      expect(frozenFees?.runConfig.executionModel).toEqual(result.runConfig.executionModel);
      expect(built.manifest.executionModel?.contentHash).toBe(
        hashCanonicalManifest(result.runConfig.executionModel),
      );
      expect(f.dsa.marketPublicFeesV3).toHaveBeenCalledTimes(2);
      expect(f.dsa.backtestInstrumentFacts).toHaveBeenCalledWith(
        expect.objectContaining({ identityOnly: true, symbol }),
      );
      expect(f.dsa.backtestCalendar).toHaveBeenCalledOnce();
      expect(f.dsa.marketBarsV3).toHaveBeenCalledOnce();
      f.dsa.backtestCalendar.mockRejectedValue(new Error('offline'));
      f.dsa.backtestInstrumentFacts.mockRejectedValue(new Error('offline'));
      expect((await builder.buildV3(input)).manifest).toEqual(built.manifest);
      expect(await store.v3.replay(input.runId)).toEqual(built.manifest);
      expect(f.dsa.marketPublicFeesV3).toHaveBeenCalledTimes(2);
      expect(f.prisma.backtestJob.create).not.toHaveBeenCalled();
    },
    30_000,
  );

  it('五日预算的父窗口可派生 MA3 子窗口，保持未知信息且不重复取价', async () => {
    const f = await capturedResearchFixture('600519.SH');
    f.input.strategy.entry = {
      type: 'compare',
      operator: 'gt',
      left: { type: 'series', sourceId: 'execution', field: 'close' },
      right: {
        type: 'indicator',
        name: 'MA',
        input: { type: 'series', sourceId: 'execution', field: 'close' },
        params: { period: 3 },
      },
    };
    const result = await f.service.prepare(f.request);
    if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
    expect(f.reader.readV3).toHaveBeenCalledTimes(2);
    expect(f.dsa.marketBarsV3).toHaveBeenCalledOnce();
    const second = f.reader.readV3.mock.calls[1]![0];
    expect(second.frozenWindowRef).toEqual(result.runConfig.frozenExecutionWindow);
    expect(second.window.start).toBe('2023-07-12');
    const reference = result.runConfig.frozenExecutionWindow!;
    const parent = await f.repository.findFrozen(reference.identityFingerprint);
    expect(parent!.response.bars).toHaveLength(50);
    const child = await f.reader.readV3(second);
    if (child.status !== 'selected') throw new Error('冻结子窗不可用');
    expect(child.selection.response.bars).toHaveLength(48);
    expect(child.selection.response.coverageProof.listing).toEqual({
      symbol: '600519.SH',
      status: 'unknown',
    });
    expect(child.selection.response.historicalTradabilityWindows![0]!.listing).toEqual({
      status: 'unknown',
    });
    expect(f.dsa.marketBarsV3).toHaveBeenCalledOnce();
  });

  it.each(['warmup', 'future', 'identity', 'tamper'])('未知上市仍拒绝 %s 问题', async (mode) => {
    const f = await capturedResearchFixture('600519.SH');
    if (mode === 'warmup')
      f.input.strategy.entry = {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'execution', field: 'close' },
        right: {
          type: 'indicator',
          name: 'MA',
          input: { type: 'series', sourceId: 'execution', field: 'close' },
          params: { period: 60 },
        },
      };
    if (mode === 'future' || mode === 'identity') {
      f.dsa.marketBarsV3.mockImplementation(async (request) => {
        const response = { ...structuredClone(f.sample.response), requestId: request.requestId };
        if (mode === 'future') response.sourcePriceBasis.observedAt = '2099-01-01T00:00:00Z';
        else response.coverageProof.listing.symbol = '600000.SH';
        return response;
      });
    }
    const prepared = await f.service.prepare(f.request);
    if (mode !== 'tamper') {
      expect(prepared.status).toBe('blocked');
      expect(f.prisma.backtestJob.create).not.toHaveBeenCalled();
      return;
    }
    if (prepared.status !== 'prepared') throw new Error(JSON.stringify(prepared));
    const reference = prepared.runConfig.frozenExecutionWindow!;
    f.rows.get(reference.identityFingerprint)!.completeResponse = {};
    const result = await f.reader.readV3({
      market: 'CN',
      symbol: f.request.runConfig.executionModel.scope.symbol,
      routeKey: f.sample.request.routeKey,
      window: { start: '2023-07-08', end: '2023-09-15' },
      frozenWindowRef: reference,
    });
    expect(result.status).toBe('unavailable');
    expect(f.dsa.marketBarsV3).toHaveBeenCalledOnce();
  });
});
