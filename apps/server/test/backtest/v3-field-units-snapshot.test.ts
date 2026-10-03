import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import {
  marketFrozenWindowHashV3,
  marketWindowSeriesVersionV3,
} from '../../src/market/market-frozen-window-v3.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('V3 字段单位冻结消费', () => {
  it('单位影响完整响应哈希，并经 Parquet 和新 Store 离线读取保留', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v3-field-units-'));
    roots.push(root);
    const f = await completeSnapshotFixture();
    f.input.strategyVersionHash = hashCanonicalManifest(f.input.strategy);
    const units = { volume: 'unknown', amount: 'unknown' } as const;
    f.input.runConfig.executionPriceProtocol.priceBasis.fieldUnits = units;
    const original = f.reader.readV3.getMockImplementation()!;
    f.reader.readV3.mockImplementation(async (input) => {
      const result = await original(input);
      if (result.status !== 'selected') throw new Error('fixture selection unavailable');
      const response = result.selection.response;
      const previousHash = marketFrozenWindowHashV3(response);
      response.sourcePriceBasis.fieldUnits = units;
      const hash = marketFrozenWindowHashV3(response);
      expect(hash).not.toBe(previousHash);
      expect(marketFrozenWindowHashV3(JSON.parse(JSON.stringify(response)))).toBe(hash);
      result.evidence.sourcePriceBasis = response.sourcePriceBasis;
      result.evidence.completeResponseHash = hash;
      result.seriesVersion = marketWindowSeriesVersionV3(result.request, response);
      result.evidence.seriesVersion = result.seriesVersion;
      return result;
    });
    const store = new LocalSnapshotStore(root);
    const built = await new DsaSnapshotBuilder(
      f.dsa as unknown as DsaClient,
      store,
      f.reader,
    ).buildV3(f.input);
    f.reader.readV3.mockRejectedValue(new Error('offline'));
    f.dsa.backtestCalendar.mockRejectedValue(new Error('offline'));
    f.dsa.backtestInstrumentFacts.mockRejectedValue(new Error('offline'));
    const fresh = new LocalSnapshotStore(root);
    const manifest = await fresh.v3.replay(f.input.runId);
    expect(manifest).toEqual(built.manifest);
    let sources = 0;
    for (const ref of manifest.artifacts) {
      for await (const row of await fresh.artifacts.openRead(ref)) {
        if (row.kind !== 'market-window-evidence-v3') continue;
        sources += 1;
        expect(JSON.parse(String(row.sourcePriceBasis)).fieldUnits).toEqual(units);
      }
    }
    expect(sources).toBeGreaterThan(0);
    const request = {
      runId: f.input.runId,
      snapshotRef: { snapshotId: manifest.contentHash!, contentHash: manifest.contentHash! },
      artifactRefs: manifest.artifacts,
    };
    const first = await new LocalSnapshotV3Runner(fresh).run(request, new AbortController().signal);
    const replay = await new LocalSnapshotV3Runner(new LocalSnapshotStore(root)).run(
      request,
      new AbortController().signal,
    );
    expect(replay).toEqual(first);
    expect(f.reader.readV3).toHaveBeenCalledOnce();
  });
});
