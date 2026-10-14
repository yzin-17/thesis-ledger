import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { statusExecutionFixture } from './trading-status-execution-fixtures.js';
import { lifecycleResponseFixtureV3 } from '../market/lifecycle-response.fixture.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { tradabilityFixtureV3 } from './v3-tradability-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';
import { deriveLifecyclePreparationV3 } from '../../src/backtest/backtest-lifecycle-preparation-v3.js';
import { buildBacktestSnapshotV3 } from '../../src/backtest/backtest-snapshot-v3-builder.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);
describe('准备生命周期版本绑定新快照，领域执行和旧身份保持', () => {
  it.each([
    { ipo: '2023-08-18', out: null },
    { ipo: '2000-01-01', out: '2023-08-21' },
  ])('生命周期 $ipo / $out 的冻结执行与离线重放', async ({ ipo, out }) => {
    const root = await mkdtemp(join(tmpdir(), 'prepared-life-'));
    roots.push(root);
    const state = await statusExecutionFixture(root, { source: 'unknown' });
    const runner = new LocalSnapshotV3Runner(state.snapshots);
    const oldRun = {
      runId: state.input.runId,
      snapshotRef: state.built.snapshotRef,
      artifactRefs: state.built.artifactRefs,
    };
    const old = await runner.run(oldRun, new AbortController().signal);
    const input = structuredClone(state.input);
    input.runId += '-life';
    input.runConfig.endDate = '2023-08-25';
    input.runConfig.executionModel!.scope.range.end = input.runConfig.endDate;
    input.runConfig.executionModel!.segments.forEach(
      (segment) => (segment.range.end = input.runConfig.endDate),
    );
    const window = {
      start: state.built.manifest.dateRange.warmupStartDate,
      end: input.runConfig.endDate,
    };
    const missing: string[] = [];
    for (
      let day = new Date(`${window.start}T00:00:00Z`);
      day.toISOString().slice(0, 10) < ipo;
      day.setUTCDate(day.getUTCDate() + 1)
    )
      missing.push(day.toISOString().slice(0, 10));
    const readInput = {
      market: 'CN' as const,
      symbol: '000995.SZ',
      routeKey: input.executionRouteKey,
      window,
      tradabilityMode: 'assume-untradable-no-bar' as const,
    };
    const selected = await makeReaderResult(readInput, false, missing, true);
    if (selected.status !== 'selected') throw new Error('行情未取得');
    input.runConfig.frozenExecutionWindow = {
      version: 'market-frozen-window-v1',
      identityFingerprint: selected.evidence.identityFingerprint,
      responseHash: selected.evidence.completeResponseHash!,
    };
    const response = lifecycleResponseFixtureV3('000995.SZ', window.start, window.end, ipo, out);
    input.runConfig.lifecyclePreparation = deriveLifecyclePreparationV3({
      response,
      bars: selected.selection.response.bars,
      start: input.runConfig.startDate,
      end: input.runConfig.endDate,
      required: state.built.manifest.warmup.lookbackPeriods,
      priceResponseHash: selected.evidence.completeResponseHash!,
    });
    const reader = {
      readV3: vi.fn(async () => ({
        ...selected,
        frozenWindowRef: input.runConfig.frozenExecutionWindow!,
      })),
    };
    const originalFacts = state.dsa.backtestInstrumentFacts.getMockImplementation()!;
    state.dsa.backtestInstrumentFacts.mockImplementation(async (request) => {
      const value = await originalFacts(request);
      if (!request.identityOnly) {
        const prices = await makeReaderResult(
          { ...readInput, window: { start: request.start, end: request.end } },
          false,
          missing,
          true,
        );
        if (prices.status !== 'selected') throw new Error('依赖行情不可用');
        value.historicalTradability = tradabilityFixtureV3(
          tradabilityWindowFromResponseV3(prices.selection.response),
        );
      }
      return value;
    });
    const lifecycle = { read: vi.fn(async () => response) };
    const built = await buildBacktestSnapshotV3(
      input,
      state.snapshots.v3,
      reader,
      state.dsa as never,
      undefined,
      lifecycle,
    );
    expect(built.manifest.tradingStatus?.freezeVersion).toBe('frozen-trading-status-v5');
    lifecycle.read.mockRejectedValue(new Error('离线不得查最新生命周期'));
    state.dsa.marketTradingStatusV3.mockRejectedValue(new Error('离线不得查最新状态'));
    const run = {
      runId: input.runId,
      snapshotRef: built.snapshotRef,
      artifactRefs: built.artifactRefs,
    };
    const result = await runner.run(run, new AbortController().signal);
    expect(result.simulationFills.length).toBeGreaterThan(0);
    expect(
      result.simulationFills.every(
        (fill) =>
          fill.occurredAt.slice(0, 10) >= input.runConfig.lifecyclePreparation!.signalStartDate &&
          (!out || fill.occurredAt.slice(0, 10) < out),
      ),
    ).toBe(true);
    expect(result.benchmark?.totalReturn?.status).toBe('available');
    expect(await runner.run(run, new AbortController().signal)).toEqual(result);
    expect(await runner.run(oldRun, new AbortController().signal)).toEqual(old);
    const changed = structuredClone(response);
    changed.basicLifecycle!.ipoDate = '2023-08-19';
    lifecycle.read.mockResolvedValue(changed);
    await expect(
      buildBacktestSnapshotV3(
        { ...input, runId: input.runId + '-changed' },
        state.snapshots.v3,
        reader,
        state.dsa as never,
        undefined,
        lifecycle,
      ),
    ).rejects.toThrow('准备输入变化');
  });
});
