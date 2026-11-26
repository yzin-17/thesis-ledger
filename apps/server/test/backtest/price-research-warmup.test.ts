import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BacktestStrategy } from '@thesis-ledger/schemas';
import type { MarketBarWindowReadResultV3 } from '../../src/market/market-bar-reader-v3.js';
import { deriveFrozenMarketWindowViewV3 } from '../../src/market/market-frozen-window-view-v3.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { hashCanonicalManifest, LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { planSnapshotInputsV3 } from '../../src/backtest/backtest-snapshot-v3-input-plan.js';
import { BacktestConfiguredRunService } from '../../src/backtest/backtest-configured-run.service.js';
import { priceResearchFixture } from './price-research.fixtures.js';

describe('实验双价格候选预算父窗口', () => {
  it('零周期基线冻结完整预算，MA20／MA60 三段均从原父窗派生并离线重放', async () => {
    const f = await priceResearchFixture({
      researchSource: { providerId: 'futu', upstreamSource: 'futu' },
    });
    f.request.runConfig.endDate = '2026-05-29';
    f.request.runConfig.dataAsOf = '2026-06-07T08:00:00Z';
    const model = f.request.runConfig.executionModel!;
    model.scope.range.end = '2026-05-29';
    for (const segment of model.segments) segment.range.end = '2026-05-29';
    type Selected = Extract<MarketBarWindowReadResultV3, { status: 'selected' }>;
    const stored = new Map<string, Selected>();
    const acquire = f.reader.readV3.getMockImplementation()!;
    f.reader.readV3.mockImplementation(async (input) => {
      if (!input.frozenWindowRef) {
        const read = await acquire(input);
        read.evidence.identityFingerprint = hashCanonicalManifest(read.request);
        stored.set(read.evidence.identityFingerprint, structuredClone(read));
        return read;
      }
      const parent = stored.get(input.frozenWindowRef.identityFingerprint)!;
      const view = deriveFrozenMarketWindowViewV3(
        {
          request: parent.request,
          response: parent.selection.response,
          seriesVersion: parent.seriesVersion,
          completeResponseHash: parent.evidence.completeResponseHash!,
          evidence: parent.evidence,
        },
        input.frozenWindowRef,
        input,
      );
      return {
        ...parent,
        request: view.request,
        seriesVersion: view.seriesVersion,
        frozenWindowRef: input.frozenWindowRef,
        selection: { ...parent.selection, response: view.response },
        evidence: {
          ...parent.evidence,
          identityFingerprint: hashCanonicalManifest(view.request),
          completeResponseHash: marketFrozenWindowHashV3(view.response),
          window: input.window,
          seriesVersion: view.seriesVersion,
          inputFingerprint: view.response.inputFingerprint,
          coverageProof: view.response.coverageProof,
        },
      };
    });
    const prepared = await prepareBacktestRunConfigV3({
      request: { ...f.request, warmupBudgetSessions: 60, priceResearchReference: 'freeze' },
      strategy: f.input.strategy,
      reader: f.reader,
      control: f.control,
      checkedAt: '2026-06-07T08:00:00Z',
    });
    if (prepared.status !== 'prepared') throw new Error(JSON.stringify(prepared));
    const execution = stored.get(prepared.runConfig.frozenExecutionWindow!.identityFingerprint)!;
    const reference = stored.get(
      prepared.runConfig.priceResearch!.actualPriceWindow!.identityFingerprint,
    )!;
    expect(reference.request.start).toBe(execution.request.start);
    expect(reference.request.end).toBe(execution.request.end);
    expect(reference.selection.target.providerId).toBe('hithink');
    expect(execution.selection.target.providerId).toBe('futu');
    const acquisitions = () =>
      f.reader.readV3.mock.calls.filter(([input]) => !input.frozenWindowRef);
    expect(acquisitions()).toHaveLength(2);
    const configured = new BacktestConfiguredRunService({ strategyVersion: {
      findUnique: async () => ({ schema: f.input.strategy }),
    } } as never, f.reader as never, {} as never);
    await expect(configured.assertFrozenResearchBudget('version', prepared.runConfig)).resolves.toBeUndefined();
    const validReader = f.reader.readV3.getMockImplementation()!;
    f.reader.readV3.mockImplementation(async (input) => {
      if (input.routeKey.adjustment === 'none' && input.window.start < f.request.runConfig.startDate)
        return { status: 'unavailable', selection: { status: 'unavailable', reason: 'primary_unavailable', primaryFailure: 'invalid_response' } } as never;
      return validReader(input);
    });
    await expect(configured.assertFrozenResearchBudget('version', prepared.runConfig)).rejects.toThrow('重新准备配置后新建实验');
    f.reader.readV3.mockImplementation(validReader);
    const strategyFor = (period: number): BacktestStrategy => ({
      ...f.input.strategy,
      signalSources: [
        { ...f.input.strategy.signalSources[0]!, id: 'execution', priceCoordinate: 'research' },
      ],
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'execution', field: 'close' },
        right: {
          type: 'indicator',
          name: 'MA',
          input: { type: 'series', sourceId: 'execution', field: 'close' },
          params: { period },
        },
      },
    });
    const root = await mkdtemp(join(tmpdir(), 'price-research-budget-'));
    try {
      const snapshots = new LocalSnapshotStore(root);
      for (const period of [20, 60]) {
        const strategy = strategyFor(period);
        for (const [startDate, endDate] of [
          ['2026-05-18', '2026-05-20'],
          ['2026-05-21', '2026-05-25'],
          ['2026-05-26', '2026-05-29'],
        ] as const) {
          const runConfig = {
            ...prepared.runConfig,
            startDate,
            endDate,
            priceInputBindings: {
              signals: [{ sourceId: 'execution', binding: 'execution-series' as const }],
              benchmark: { binding: 'execution-series' as const },
            },
          };
          const plan = planSnapshotInputsV3({ strategy, runConfig });
          expect(plan.warmup.startDate >= reference.request.start).toBe(true);
          const runId = `candidate-${period}-${startDate}`;
          const built = await new DsaSnapshotBuilder(f.dsa as never, snapshots, f.reader).buildV3({
            ...f.input,
            runId,
            strategy,
            strategyVersionHash: hashCanonicalManifest(strategy),
            runConfig,
            executionRouteKey: { ...f.input.executionRouteKey, adjustment: 'hfq' },
          });
          const runner = new LocalSnapshotV3Runner(snapshots);
          const run = { runId, snapshotRef: built.snapshotRef, artifactRefs: built.artifactRefs };
          const result = await runner.run(run, new AbortController().signal);
          expect(built.manifest.quality.completeness).toBe('complete');
          expect(result.equityCurve.length).toBeGreaterThan(1);
          expect((await runner.run(run, new AbortController().signal)).resultChecksum).toBe(
            result.resultChecksum,
          );
        }
      }
      expect(acquisitions()).toHaveLength(2);
      expect(() =>
        planSnapshotInputsV3({ strategy: strategyFor(62), runConfig: prepared.runConfig }),
      ).toThrow('预热需求超过实验已冻结');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
