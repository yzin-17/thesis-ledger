import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { makeReaderResult } from './v3-snapshot-fixtures.js';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(missing: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'v3-sparse-runner-'));
  roots.push(root);
  const value = await completeSnapshotFixture();
  value.input.strategyVersionHash = hashCanonicalManifest(value.input.strategy);
  value.reader.readV3.mockImplementation((request) => makeReaderResult(request, false, missing));
  const store = new LocalSnapshotStore(root);
  const builder = new DsaSnapshotBuilder(value.dsa as unknown as DsaClient, store, value.reader);
  return { ...value, store, builder, runner: new LocalSnapshotV3Runner(store) };
}

describe('稀疏行情冻结与 Runner', () => {
  it.each(['2026-05-18', '2026-05-19', '2026-05-20'])(
    '跳过 %s，保留日历估值并可断网重放',
    async (missing) => {
      const f = await fixture([missing]);
      const built = await f.builder.buildV3(f.input);
      expect(f.dsa.backtestInstrumentFacts).toHaveBeenCalledWith(
        expect.objectContaining({ identityOnly: true }),
      );
      const request = {
        runId: f.input.runId,
        snapshotRef: {
          snapshotId: built.manifest.contentHash!,
          contentHash: built.manifest.contentHash!,
        },
        artifactRefs: built.manifest.artifacts,
      };
      const result = await f.runner.run(request, new AbortController().signal);
      expect(result.simulationFills.every((fill) => fill.occurredAt.slice(0, 10) !== missing)).toBe(
        true,
      );
      expect(result.warnings).toContain('按冻结逐日状态跳过 1 个缺 Bar 交易日。');
      expect(result.equityCurve.map((point) => point.occurredAt.slice(0, 10))).toEqual([
        '2026-05-18',
        '2026-05-19',
        '2026-05-20',
      ]);
      expect(result.benchmark).toBeDefined();
      if (missing === '2026-05-19') {
        expect(
          result.simulationFills
            .filter((fill) => fill.side === 'buy')
            .map((fill) => fill.occurredAt.slice(0, 10)),
        ).toEqual(['2026-05-20']);
      }
      if (missing === '2026-05-20')
        expect(result.equityCurve[2]!.value).toEqual(result.equityCurve[1]!.value);
      f.reader.readV3.mockRejectedValue(new Error('offline'));
      f.dsa.backtestInstrumentFacts.mockRejectedValue(new Error('offline'));
      f.dsa.backtestCalendar.mockRejectedValue(new Error('offline'));
      expect(await f.runner.run(request, new AbortController().signal)).toEqual(result);
    },
  );

  it('整个执行范围缺 Bar 时拒绝，不制造零收益成功', async () => {
    const f = await fixture(['2026-05-18', '2026-05-19', '2026-05-20']);
    await expect(f.builder.buildV3(f.input)).rejects.toThrow(/没有交易日/);
  });

  it('缺少实际预热 Bar 时拒绝，即使全部日级状态完整', async () => {
    const f = await fixture([
      '2026-04-24',
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
      '2026-05-04',
      '2026-05-05',
      '2026-05-06',
      '2026-05-07',
      '2026-05-08',
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
      '2026-05-15',
    ]);
    await expect(f.builder.buildV3(f.input)).rejects.toThrow(/预热/);
  });
});
