import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { priceResearchFixture } from './price-research.fixtures.js';
import { prepareBacktestRunConfigV3 } from '../../src/backtest/backtest-run-preparation.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { executionBarRowsV3 } from '../../src/backtest/backtest-v3-execution-bar-rows.js';
import { instrumentFact } from '../../src/backtest/backtest-instrument-fact-v3.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';

async function fixture() {
  const f = await priceResearchFixture();
  f.input.strategy.signalSources = [{ id: 'price', asset: f.input.strategy.executionInstrument,
    priceCoordinate: 'research', timeframe: '1d', series: ['close'] }];
  f.input.strategy.sizing = { type: 'fixedAmount', amount: '1000' };
  f.input.strategy.entry = { type: 'compare', operator: 'gt',
    left: { type: 'series', sourceId: 'price', field: 'close' },
    right: { type: 'indicator', name: 'MA', input: { type: 'series', sourceId: 'price', field: 'close' }, params: { period: 2 } } };
  const read = f.reader.readV3.getMockImplementation()!;
  f.reader.readV3.mockImplementation(async (input) => {
    const result = await read(input);
    result.selection.response.bars.forEach((bar) => { bar.volume = null; bar.amount = null; });
    result.selection.response.historicalTradabilityWindows!.forEach((window) => {
      window.days.forEach((day) => { if (day.state === 'observed-traded') day.state = 'observed-price-only'; });
    });
    result.evidence.completeResponseHash = marketFrozenWindowHashV3(result.selection.response);
    return result;
  });
  const prepare = () => prepareBacktestRunConfigV3({ strategy: f.input.strategy, request: f.request,
    control: f.control, reader: f.reader, checkedAt: '2026-06-07T08:00:00Z' });
  return { ...f, prepare };
}

it('未知量价格研究从准备到冻结与离线Runner贯通，真实执行资格保持关闭', async () => {
  const f = await fixture();
  const prepared = await f.prepare();
  expect(prepared.status, JSON.stringify(prepared)).toBe('prepared');
  if (prepared.status !== 'prepared') throw new Error('未准备');
  expect(prepared.runConfig.priceResearch?.dailyObservationContract).toBe('market-daily-tradability-window-v1');
  expect(prepared.runConfig.priceResearch?.dataScope?.sources[0]?.fields).not.toContain('volume');
  expect(f.reader.readV3.mock.calls[0]?.[0]).toMatchObject({ priceResearch: true, dailyObservationContract: 'market-daily-tradability-window-v1' });
  const root = await mkdtemp(join(tmpdir(), 'daily-price-only-'));
  try {
    const snapshots = new LocalSnapshotStore(root);
    const built = await new DsaSnapshotBuilder(f.dsa as never, snapshots, f.reader).buildV3({ ...f.input,
      strategyVersionHash: hashCanonicalManifest(f.input.strategy), runConfig: prepared.runConfig,
      executionRouteKey: { ...f.input.executionRouteKey, adjustment: 'hfq' } });
    expect(built.manifest.priceResearch?.dailyObservationContract).toBe('market-daily-tradability-window-v1');
    const instrument = built.artifactRefs.find((ref) => ref.key.includes('/instrumentFacts/'))!;
    const facts: ArtifactRow[] = [];
    for await (const row of await snapshots.artifacts.openRead(instrument)) facts.push(row);
    expect(facts[0]?.tradable).toBe(false);
    expect(instrumentFact(facts[0]!, false).tradable).toBe(false);
    expect(instrumentFact(facts[0]!, true).tradable).toBe(true);
    f.reader.readV3.mockRejectedValue(new Error('offline'));
    const result = await new LocalSnapshotV3Runner(snapshots).run({ runId: f.input.runId,
      snapshotRef: built.snapshotRef, artifactRefs: built.artifactRefs }, new AbortController().signal);
    expect(result.simulationFills.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes('成交量未知'))).toBe(true);
    expect(await new LocalSnapshotV3Runner(snapshots).run({ runId: f.input.runId,
      snapshotRef: built.snapshotRef, artifactRefs: built.artifactRefs }, new AbortController().signal)).toEqual(result);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('显式量指标缺失指出规则、字段与二十根窗口，价格观察不能转为实际执行', async () => {
  const f = await fixture();
  const captured = await f.reader.readV3({ market: 'CN', symbol: f.input.strategy.executionInstrument.symbol,
    routeKey: { ...f.input.executionRouteKey, adjustment: 'hfq' }, window: { start: '2026-05-01', end: '2026-05-20' },
    tradabilityMode: 'assume-untradable-no-bar', priceResearch: true, dailyObservationContract: 'market-daily-tradability-window-v1' });
  expect(() => executionBarRowsV3(captured.selection.response, captured.request.symbol, 'raw-events')).toThrow('缺少成交量');
  f.input.strategy.signalSources[0]!.series.push('volume');
  f.input.strategy.entry = { type: 'compare', operator: 'gt',
    left: { type: 'indicator', name: 'MA', input: { type: 'series', sourceId: 'price', field: 'volume' }, params: { period: 20 } },
    right: { type: 'constant', value: '0' } };
  const result = await f.prepare();
  expect(result.status).toBe('blocked');
  expect(JSON.stringify(result)).toContain('entry.left.input');
  expect(JSON.stringify(result)).toContain('volume');
  expect(JSON.stringify(result)).toContain('20根');
});

it('当前准备要求具名日级观察，丢失观察绑定时保留原冻结结果并阻断新准备', async () => {
  const f = await priceResearchFixture();
  const prepare = () => prepareBacktestRunConfigV3({
    request: f.request, strategy: f.input.strategy, control: f.control, reader: f.reader,
    checkedAt: '2026-06-07T08:00:00Z'
  });
  const current = await prepare();
  expect(current.status, JSON.stringify(current)).toBe('prepared');
  if (current.status !== 'prepared') throw new Error('未准备');
  expect(current.runConfig.priceResearch?.dailyObservationContract).toBe('market-daily-tradability-window-v1');
  expect(f.reader.readV3.mock.calls.every(([input]) => input.dailyObservationContract !== undefined)).toBe(true);
  const before = JSON.stringify(current);
  const read = f.reader.readV3.getMockImplementation()!;
  f.reader.readV3.mockImplementation(async (input) => {
    const result = await read(input);
    if (result.status !== 'selected') throw new Error('缺少受控日线数据');
    delete result.request.dailyObservationContract;
    return result;
  });
  expect((await prepare()).status).toBe('blocked');
  expect(JSON.stringify(current)).toBe(before);
});
