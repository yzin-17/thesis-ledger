import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backtestResultSchemaV3 } from '@thesis-ledger/schemas';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { DsaSnapshotBuilder } from '../../src/backtest/backtest-snapshot-builder.js';
import { LocalSnapshotStore, hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';
import { LocalSnapshotV3Runner } from '../../src/backtest/backtest-v3-runner.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('完整 V3 冻结输入的指标消费', () => {
  it.each(['RSI', 'ATR'] as const)(
    '%s 经真实构建、冻结、执行与离线重放，身份及输入不变',
    async (name) => {
      const root = await mkdtemp(join(tmpdir(), 'indicator-v3-'));
      roots.push(root);
      const fixture = await completeSnapshotFixture();
      const expression = {
        type: 'indicator' as const,
        name,
        params: { period: 2 },
        input: { type: 'series' as const, sourceId: 'execution', field: 'close' as const },
      };
      fixture.input.strategy.entry = {
        type: 'compare',
        operator: name === 'ATR' ? 'lte' : 'gte',
        left:
          name === 'RSI'
            ? { type: 'indicator', name: 'EMA', params: { period: 2 }, input: expression }
            : expression,
        right:
          name === 'ATR'
            ? { type: 'series', sourceId: 'execution', field: 'close' }
            : { type: 'constant', value: '0' },
      };
      fixture.input.strategyVersionHash = hashCanonicalManifest(fixture.input.strategy);
      const snapshots = new LocalSnapshotStore(root);
      const built = await new DsaSnapshotBuilder(
        fixture.dsa as unknown as DsaClient,
        snapshots,
        fixture.reader,
      ).buildV3(fixture.input);
      fixture.reader.readV3.mockClear();
      const before = await snapshots.v3.replay(fixture.input.runId);
      const runner = new LocalSnapshotV3Runner(snapshots);
      const request = {
        runId: fixture.input.runId,
        snapshotRef: built.snapshotRef,
        artifactRefs: built.artifactRefs,
      };
      const result = await runner.run(request, new AbortController().signal);
      const replay = await new LocalSnapshotV3Runner(new LocalSnapshotStore(root)).run(
        request,
        new AbortController().signal,
      );
      expect(backtestResultSchemaV3.safeParse(result).success).toBe(true);
      expect(result.engineVersion).toBe('thesis-ledger-v3-local-runner-v3');
      expect(replay).toEqual(result);
      expect(await snapshots.v3.replay(fixture.input.runId)).toEqual(before);
      expect(fixture.reader.readV3).not.toHaveBeenCalled();
      expect(fixture.dsa.backtestCalendar).toHaveBeenCalledTimes(1);
    },
  );
});
