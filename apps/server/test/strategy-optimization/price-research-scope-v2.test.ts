import { expect, it, vi } from 'vitest';
import { priceResearchFixture } from '../backtest/price-research.fixtures.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { createDiscoverySeed } from '../../src/strategy-optimization/strategy-optimization-discovery.js';
import { requireOptimizationPriceResearch, LEGACY_RESEARCH_STRATEGY_SPACE_VERSION,
  RESEARCH_STRATEGY_SPACE_VERSION } from '../../src/strategy-optimization/strategy-optimization-research.js';
import { assertStrategyResearchScopeV3 } from '../../src/backtest/backtest-research-data-scope-v3.js';
import { BacktestConfiguredRunService } from '../../src/backtest/backtest-configured-run.service.js';
import { discoveryGenerationPrompt } from '../../src/strategy-optimization/strategy-discovery-generation-prompt.js';
import { optimizationModelResearchNotice } from '../../src/strategy-optimization/strategy-optimization-model-feedback.js';
import { optimizationResearchRunConfig } from './optimization-research-fixtures.js';
import type { MarketBarWindowReadInputV3 } from '../../src/market/market-bar-reader-v3.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';

async function fixture(failure = { reason: 'route_not_configured' }) {
  const f = await priceResearchFixture();
  const scope = { executionInstrument: f.input.strategy.executionInstrument, primaryTimeframe: '1d' as const };
  f.input.strategy = createDiscoverySeed(scope, true);
  f.input.strategyVersionHash = hashCanonicalManifest(f.input.strategy);
  const request = { ...f.request, priceResearchReference: 'optional' as const };
  const read = f.reader.readV3.getMockImplementation()!;
  f.reader.readV3.mockImplementation(async (input: MarketBarWindowReadInputV3) =>
    input.routeKey.adjustment === 'none' ? { status: 'unavailable', selection: { status: 'unavailable', ...failure } } as never : read(input));
  const prepare = () => prepareBacktestRunConfigV3({ request, strategy: f.input.strategy,
    control: f.control, reader: f.reader, checkedAt: '2026-06-07T08:00:00Z' });
  return { ...f, request, scope, prepare };
}

it.each([
  { reason: 'route_not_configured' },
  { reason: 'primary_unavailable', primaryFailure: 'missing_window' },
  { reason: 'primary_unavailable', primaryFailure: 'fetch_failed', backupFailure: 'target_not_ready' },
])('可选原价缺失仍准备后复权能力，读取保持独立 %j', async (failure) => {
  const f = await fixture(failure);
  const result = await f.prepare();
  expect(result.status, JSON.stringify(result)).toBe('prepared');
  if (result.status !== 'prepared') throw new Error('未准备');
  expect(f.reader.readV3.mock.calls.map(([input]) => input.routeKey.adjustment)).toEqual(['hfq', 'none']);
  expect(result.runConfig.priceResearch).not.toHaveProperty('actualPriceWindow');
  expect(result.runConfig.priceResearch?.dataScope).toMatchObject({ priceCoordinates: ['research'],
    unavailableCapabilities: [{ capability: 'actual-price', code: 'primaryFailure' in failure ? failure.primaryFailure : failure.reason }] });
  expect(() => requireOptimizationPriceResearch(result.runConfig)).not.toThrow();
  expect(() => requireOptimizationPriceResearch(result.runConfig, { strategySpaceVersion: LEGACY_RESEARCH_STRATEGY_SPACE_VERSION })).toThrow('原双价格');
});

it.each(['invalid_response', 'window_mismatch', 'provenance_mismatch'])('可选输入的合同错误仍阻断 %s', async (primaryFailure) => {
  const f = await fixture({ reason: 'primary_unavailable', primaryFailure } as never);
  const result = await f.prepare();
  expect(result.status).toBe('blocked');
  expect(JSON.stringify(result)).toContain(primaryFailure);
});

it('固定份数将可选原价升级为必需，明确freeze也不能降级', async () => {
  const f = await fixture();
  f.input.strategy.sizing = { type: 'fixedQuantity', quantity: '100' };
  expect((await f.prepare()).status).toBe('blocked');
  f.input.strategy.sizing = { type: 'fixedAmount', amount: '1000' };
  f.request.priceResearchReference = 'freeze' as never;
  expect((await f.prepare()).status).toBe('blocked');
});

it('范围进入提示、创建前检查与候选预检；越界候选不触发行情读取', async () => {
  const f = await fixture();
  const result = await f.prepare();
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const experiment = { runConfig: result.runConfig, strategySpaceVersion: RESEARCH_STRATEGY_SPACE_VERSION,
    discoveryScope: f.scope, objective: { mode: 'balanced' } } as never;
  const prompt = discoveryGenerationPrompt(experiment, f.input.strategy, 1, []);
  expect(JSON.stringify(prompt)).toContain('dataScope');
  expect(optimizationModelResearchNotice(result.runConfig)).toContain('缺少actual时');
  expect(() => requireOptimizationPriceResearch(optimizationResearchRunConfig())).toThrow('能力范围');
  f.input.strategy.sizing = { type: 'fixedQuantity', quantity: '100' };
  expect(() => assertStrategyResearchScopeV3(f.input.strategy, result.runConfig)).toThrow('sizing');
  const prisma = { strategyVersion: { findUnique: vi.fn(async () => ({ schemaVersion: 1, schema: f.input.strategy })) },
    backtestJob: { findFirst: vi.fn(async () => null) } };
  const reader = { readV3: vi.fn() }, revisions = { readCurrent: vi.fn() };
  const service = new BacktestConfiguredRunService(prisma as never, reader as never, revisions as never);
  await expect(service.resolve('version', result.runConfig, 'scope-key', { rebindStrategyInputs: true })).rejects.toThrow('sizing');
  expect(reader.readV3).not.toHaveBeenCalled();
  expect(revisions.readCurrent).not.toHaveBeenCalled();
});

it('旧双窗口合同继续校验，新空间不能把无范围旧配置当作本次范围', () => {
  const old = optimizationResearchRunConfig();
  expect(() => requireOptimizationPriceResearch(old, { strategySpaceVersion: LEGACY_RESEARCH_STRATEGY_SPACE_VERSION })).not.toThrow();
  expect(() => requireOptimizationPriceResearch(old, { strategySpaceVersion: RESEARCH_STRATEGY_SPACE_VERSION })).toThrow();
  delete old.priceResearch!.actualPriceWindow;
  expect(() => requireOptimizationPriceResearch(old, { strategySpaceVersion: LEGACY_RESEARCH_STRATEGY_SPACE_VERSION })).toThrow('原双价格');
});

it('仅后复权的探索范围可物化快照并离线完成，不在Worker补原价', async () => {
  const f = await fixture();
  const result = await f.prepare();
  if (result.status !== 'prepared') throw new Error(JSON.stringify(result));
  const root = await mkdtemp(join(tmpdir(), 'research-scope-v2-'));
  try {
    const snapshots = new LocalSnapshotStore(root);
    f.reader.readV3.mockClear();
    const built = await new DsaSnapshotBuilder(f.dsa as never, snapshots, f.reader).buildV3({
      ...f.input, runConfig: result.runConfig, executionRouteKey: { ...f.input.executionRouteKey, adjustment: 'hfq' },
    });
    expect(f.reader.readV3.mock.calls.every(([input]) => input.routeKey.adjustment === 'hfq')).toBe(true);
    f.reader.readV3.mockRejectedValue(new Error('offline'));
    const output = await new LocalSnapshotV3Runner(snapshots).run({
      runId: f.input.runId, snapshotRef: built.snapshotRef, artifactRefs: built.artifactRefs,
    }, new AbortController().signal);
    expect(output.analyticsVersion).toBe('research-analytics-v2');
    expect(output.simulationFills.length).toBeGreaterThan(0);
    expect(output.simulationFills.every((fill) => fill.actualReferencePrice === undefined)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
