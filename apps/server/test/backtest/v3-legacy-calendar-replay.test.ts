import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { collectSnapshotDependenciesV3 } from '../../src/backtest/backtest-snapshot-v3-dependencies.js';
import { planSnapshotInputsV3 } from '../../src/backtest/backtest-snapshot-v3-input-plan.js';
import type { ArtifactRow } from '../../src/backtest/backtest-artifact-store.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';
import { tradabilityWindowFromResponseV3 } from '../../src/backtest/backtest-snapshot-v3-tradability.js';

it('旧无结算策略标记的完整 V3 快照落盘后保持原请求、身份和离线重放', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legacy-v3-calendar-'));
  try {
    const { input, dsa, reader } = await completeSnapshotFixture();
    const source = new LocalSnapshotStore(join(root, 'source'));
    const { manifest } = await new DsaSnapshotBuilder(
      dsa as unknown as DsaClient, source, reader,
    ).buildV3(input);
    const plan = planSnapshotInputsV3({ strategy: input.strategy, runConfig: input.runConfig });
    const selected = await reader.readV3.mock.results[0]!.value;
    if (selected.status !== 'selected') throw new Error('fixture 行情不可用');
    // 旧合同：无策略标记，日历请求截止运行结束日。
    const legacy = await collectSnapshotDependenciesV3({
      strategy: input.strategy, runConfig: input.runConfig, plan: plan.plan,
      tradabilityWindow: tradabilityWindowFromResponseV3(selected.selection.response),
    }, dsa as unknown as DsaClient);
    expect(dsa.backtestCalendar).toHaveBeenLastCalledWith(expect.objectContaining({
      end: input.runConfig.endDate,
    }));
    const records = new Map(legacy.artifacts.map((artifact) => [artifact.key, artifact.rows]));
    for (const ref of manifest.artifacts) {
      const key = ref.key.slice(input.runId.length + 1);
      if (records.has(key)) continue;
      const rows: ArtifactRow[] = [];
      for await (const row of await source.artifacts.openRead(ref)) rows.push(row);
      if (key === 'metadata/snapshot-metadata-v3.parquet') {
        delete rows[0]!.settlementCalendarPolicy;
      }
      records.set(key, rows);
    }
    const destinationRoot = join(root, 'legacy');
    const destination = new LocalSnapshotStore(destinationRoot);
    const building = { ...manifest, status: 'building' as const, artifacts: [] };
    delete building.contentHash;
    delete building.comparableDataFingerprint;
    await destination.v3.startBuild(building);
    const refs = [];
    for (const [key, rows] of records) {
      refs.push(await destination.v3.putArtifact(input.runId, {
        key, rows, artifactId: hashCanonicalManifest({ key, rows }),
      }));
    }
    const frozen = await destination.v3.finalize(input.runId, building, refs);
    reader.readV3.mockRejectedValue(new Error('offline'));
    dsa.backtestCalendar.mockRejectedValue(new Error('offline'));
    dsa.backtestInstrumentFacts.mockRejectedValue(new Error('offline'));
    const reopened = new LocalSnapshotStore(destinationRoot);
    expect(await reopened.v3.replay(input.runId)).toEqual(frozen);
    const rebuilt = await new DsaSnapshotBuilder(
      dsa as unknown as DsaClient, reopened, reader,
    ).buildV3(input);
    expect(rebuilt.manifest).toEqual(frozen);
    expect(reader.readV3).toHaveBeenCalledOnce();
    expect(dsa.backtestCalendar).toHaveBeenCalledTimes(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
