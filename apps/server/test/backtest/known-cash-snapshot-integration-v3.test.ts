import { knownCashSnapshotFixture } from './known-cash-snapshot-fixtures.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalSnapshotStore } from '../../src/backtest/backtest-snapshot.js';
import { buildBacktestSnapshotV3 } from '../../src/backtest/backtest-snapshot-v3-builder.js';

describe('已知现金研究的真实本地Snapshot冻结', () => {
  it('冻结资料/控制/来源及未知覆盖，离线重放不再读当前来源', async () => {
    const root = await mkdtemp(join(tmpdir(), 'known-snapshot-'));
    try {
      const f = await knownCashSnapshotFixture();
      const snapshots = new LocalSnapshotStore(root);
      const result = await buildBacktestSnapshotV3(
        f.input,
        snapshots.v3,
        f.reader,
        f.dsa,
        undefined,
        undefined,
        f.control,
      );
      expect(result.manifest.knownCash).toMatchObject({
        coverageComplete: false,
        preparationHash: f.input.runConfig.knownCashPreparation!.contentHash,
      });
      expect(
        result.manifest.artifacts.some((x) => x.key.endsWith('knownCash/events-v1.parquet')),
      ).toBe(true);
      const calls = f.control.mock.calls.length;
      f.control.mockRejectedValue(new Error('latest-unavailable'));
      f.reader.readV3.mockRejectedValue(new Error('latest-unavailable'));
      expect((await snapshots.v3.replay(f.input.runId)).contentHash).toBe(
        result.manifest.contentHash,
      );
      expect(f.control).toHaveBeenCalledTimes(calls);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('finalize前配置/原包变化拒绝，不能换版本完成', async () => {
    const root = await mkdtemp(join(tmpdir(), 'known-snapshot-'));
    try {
      const f = await knownCashSnapshotFixture();
      const snapshots = new LocalSnapshotStore(root);
      f.input.beforeFinalize = async () => {
        f.control.mockRejectedValue(new Error('configuration_changed'));
      };
      await expect(
        buildBacktestSnapshotV3(
          f.input,
          snapshots.v3,
          f.reader,
          f.dsa,
          undefined,
          undefined,
          f.control,
        ),
      ).rejects.toThrow('configuration_changed');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
