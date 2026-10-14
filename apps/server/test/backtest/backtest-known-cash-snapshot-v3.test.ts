import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  LocalArtifactStore,
  type ArtifactRow,
} from '../../src/backtest/backtest-artifact-store.js';
import {
  knownCashSnapshotRowsV3,
  readKnownCashSnapshotV3,
} from '../../src/backtest/backtest-known-cash-snapshot-v3.js';
import { knownCashPreparedFixture, knownCashControlFixture } from './known-cash-test-fixtures.js';

describe('独立现金方案Snapshot资料', () => {
  it('真实Parquet往返保留准备/复核/未知覆盖，离线核对不读网络', async () => {
    const prepared = await knownCashPreparedFixture();
    const control = knownCashControlFixture(prepared);
    const encoded = knownCashSnapshotRowsV3(prepared, prepared.contentHash, control);
    const root = await mkdtemp(join(tmpdir(), 'known-cash-artifact-'));
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    try {
      const store = new LocalArtifactStore(root);
      const refs = await Promise.all(
        [encoded.metadata, encoded.records].map((rows, index) =>
          store.put({ key: `test/${index}.parquet`, rows }),
        ),
      );
      const stored: ArtifactRow[][] = [];
      for (const ref of refs) {
        const rows: ArtifactRow[] = [];
        for await (const row of await store.openRead(ref)) rows.push(row);
        stored.push(rows);
      }
      expect(readKnownCashSnapshotV3(stored[0]!, stored[1]!, prepared.contentHash)).toMatchObject({
        prepared,
      });
      expect(encoded.records[0]).toMatchObject({ complete: false, kind: 'known-cash-coverage-v1' });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
  it.each(['missing-metadata', 'records', 'extra', 'wrong-hash', 'control-version'])(
    '拒绝%s',
    async (change) => {
      const prepared = await knownCashPreparedFixture();
      const encoded = knownCashSnapshotRowsV3(
        prepared,
        prepared.contentHash,
        knownCashControlFixture(prepared),
      );
      let hash = prepared.contentHash;
      if (change === 'missing-metadata') encoded.metadata = [];
      else if (change === 'records') encoded.records.pop();
      else if (change === 'extra') encoded.records.push({ kind: 'unexpected' });
      else if (change === 'wrong-hash') hash = 'f'.repeat(64);
      else {
        const control = JSON.parse(String(encoded.metadata[0]!.control));
        control.controlIdentity.providerConfigVersion++;
        encoded.metadata[0]!.control = JSON.stringify(control);
      }
      expect(() => readKnownCashSnapshotV3(encoded.metadata, encoded.records, hash)).toThrow();
    },
  );
  it('空方案仍有独立未知覆盖行，不能作为empty-dataset或完整事件', async () => {
    const prepared = await knownCashPreparedFixture();
    // 重新准备合法空响应；不通过删除冻结记录来伪造零分红。
    const { prepareKnownCashResearchV3 } =
      await import('../../src/backtest/backtest-known-cash-preparation-v3.js');
    const { routeTarget, dataAsOf, ...scope } = prepared.acquisition.exchange.request;
    const empty = await prepareKnownCashResearchV3({
      scope,
      clock: { mode: 'requested-time', requestedDataAsOf: dataAsOf },
      executionPriceProtocol: prepared.input.executionPriceProtocol,
      now: () => '2026-10-09T14:00:00Z',
      read: async () => ({
        request: { ...scope, routeTarget, dataAsOf },
        response: { ...prepared.acquisition.exchange.response, records: [], ignoredEmptyRows: 1 },
      }),
    });
    const rows = knownCashSnapshotRowsV3(empty, empty.contentHash, knownCashControlFixture(empty));
    expect(rows.records).toHaveLength(1);
    expect(rows.records[0]).toMatchObject({ complete: false, ignoredEmptyRows: 1 });
    expect(
      readKnownCashSnapshotV3(rows.metadata, rows.records, empty.contentHash).prepared.input
        .coverage.complete,
    ).toBe(false);
  });
});
