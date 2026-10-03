import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deterministicResultChecksum } from '@thesis-ledger/domain';
import type { BacktestNavResultV3 } from '@thesis-ledger/schemas';
import { LocalNavSnapshotStore } from '../../src/backtest/backtest-nav-snapshot-store.js';
import {
  LocalNavSnapshotV3Runner,
  type BacktestNavV3RunnerInput,
} from '../../src/backtest/backtest-nav-v3-runner.js';
import { verifyNavResultV3 } from '../../src/backtest/backtest-nav-result-v3.js';
import { navFreezeFixture } from '../backtest/nav-freeze.fixtures.js';

let root: string;
let store: LocalNavSnapshotStore;
let inputs: BacktestNavV3RunnerInput[];
let results: BacktestNavResultV3[];

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'e03-run-association-'));
  store = new LocalNavSnapshotStore(root);
  inputs = [];
  results = [];
  for (const runId of ['e03-economic-run-a', 'e03-economic-run-b']) {
    const manifest = await store.freeze(navFreezeFixture(runId));
    const input = {
      runId,
      snapshotRef: { snapshotId: manifest.contentHash, contentHash: manifest.contentHash },
      artifactRefs: [manifest.artifact, manifest.contextArtifact].map((ref) => ({
        ...ref,
        artifactId: ref.contentHash,
        key: `${runId}/${ref.key}`,
      })),
    };
    inputs.push(input);
    results.push(
      await new LocalNavSnapshotV3Runner(store).runNav(input, new AbortController().signal),
    );
  }
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe('E03 现行 Backtest 经济结果的 Run 关联', () => {
  it('相同经济输入保持相同现金和份额，各 Run 的申请与成交身份独立', async () => {
    const first = results[0]!;
    const second = results[1]!;
    expect(first.cash).toEqual(second.cash);
    expect(first.position).toEqual(second.position);
    expect(first.simulationFills.length).toBeGreaterThan(0);
    expect(first.simulationFills.length).toBe(second.simulationFills.length);
    for (const result of results) {
      expect(result.requests.length).toBeGreaterThan(0);
      expect(
        result.requests.every((request) => request.requestId.startsWith(`${result.runId}:`)),
      ).toBe(true);
      const requestIds = new Set(result.requests.map((request) => request.requestId));
      expect(result.simulationFills.every((fill) => requestIds.has(fill.orderId))).toBe(true);
      expect(verifyNavResultV3(result, await store.replay(result.runId))).toEqual(result);
    }
    const firstIds = new Set(first.requests.map((request) => request.requestId));
    expect(second.requests.some((request) => firstIds.has(request.requestId))).toBe(false);
  });

  it.each(['runId', 'strategyVersionId', 'snapshotId'] as const)(
    '重新计算校验和仍拒绝被改写的 %s',
    async (field) => {
      const changed = structuredClone(results[0]!);
      changed[field] = field === 'snapshotId' ? 'f'.repeat(64) : 'foreign-run-identity';
      const { resultChecksum, ...payload } = changed;
      void resultChecksum;
      const frozen = await store.replay(inputs[0]!.runId);
      expect(() =>
        verifyNavResultV3(
          { ...payload, resultChecksum: deterministicResultChecksum(payload) },
          frozen,
        ),
      ).toThrow('冻结身份');
    },
  );

  it('另一 Run 的结果和冻结引用不能用于本 Run', async () => {
    const frozen = await store.replay(inputs[0]!.runId);
    expect(() => verifyNavResultV3(results[1]!, frozen)).toThrow('冻结身份');
    await expect(
      new LocalNavSnapshotV3Runner(store).runNav(
        { ...inputs[0]!, runId: inputs[1]!.runId },
        new AbortController().signal,
      ),
    ).rejects.toThrow('身份');
  });
});
