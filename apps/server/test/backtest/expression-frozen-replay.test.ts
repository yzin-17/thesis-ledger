import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { backtestResultSchemaV3, type BooleanExpression } from '@thesis-ledger/schemas';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const source = { type: 'series' as const, sourceId: 'execution', field: 'high' as const };
const entry: BooleanExpression = {
  type: 'compare',
  operator: 'gt',
  left: { ...source, field: 'close' },
  right: {
    type: 'lag',
    periods: 1,
    input: { type: 'indicator', name: 'Highest', input: source, params: { period: 20 } },
  },
};

it.each([
  ['105', true],
  ['100', false],
] as const)('R11 收盘 %s 经正式冻结与执行，重复回放一致且买入=%s', async (close, shouldBuy) => {
  const root = await mkdtemp(join(tmpdir(), 'strategy-expression-replay-'));
  roots.push(root);
  const fixture = await completeSnapshotFixture();
  fixture.input.strategy.signalSources[0]!.series = ['high', 'close'];
  fixture.input.strategy.entry = entry;
  fixture.input.strategy.exit = {
    type: 'compare',
    operator: 'eq',
    left: { type: 'constant', value: '0' },
    right: { type: 'constant', value: '1' },
  };
  fixture.input.strategy.risk = [];
  fixture.input.strategyVersionHash = hashCanonicalManifest(fixture.input.strategy);
  fixture.reader.readV3.mockImplementation(async (request) => {
    const selected = await makeReaderResult(request);
    if (selected.status !== 'selected') throw Error('模拟来源未选中');
    const response = selected.selection.response;
    response.bars = response.bars.map((bar) => {
      const date = bar.timestamp.slice(0, 10);
      const current = date === '2026-05-18';
      const value = current ? Number(close) : 100;
      return { ...bar, open: 100, high: current ? 110 : 100, low: 99, close: value };
    });
    selected.evidence.completeResponseHash = marketFrozenWindowHashV3(response);
    return selected;
  });
  const snapshots = new LocalSnapshotStore(root);
  const built = await new DsaSnapshotBuilder(
    fixture.dsa as unknown as DsaClient,
    snapshots,
    fixture.reader,
  ).buildV3(fixture.input);
  fixture.reader.readV3.mockImplementation(async () => {
    throw Error('冻结后禁止外部读取');
  });
  const before = await snapshots.v3.replay(fixture.input.runId);
  const request = {
    runId: fixture.input.runId,
    snapshotRef: built.snapshotRef,
    artifactRefs: built.artifactRefs,
  };
  const result = await new LocalSnapshotV3Runner(snapshots).run(
    request,
    new AbortController().signal,
  );
  const repeated = await new LocalSnapshotV3Runner(new LocalSnapshotStore(root)).run(
    request,
    new AbortController().signal,
  );
  expect(backtestResultSchemaV3.safeParse(result).success).toBe(true);
  expect(repeated).toEqual(result);
  expect(await snapshots.v3.replay(fixture.input.runId)).toEqual(before);
  expect(result.simulationFills.some((fill) => fill.side === 'buy')).toBe(shouldBuy);
  if (shouldBuy) expect(result.simulationFills[0]?.occurredAt.slice(0, 10)).toBe('2026-05-19');
});
