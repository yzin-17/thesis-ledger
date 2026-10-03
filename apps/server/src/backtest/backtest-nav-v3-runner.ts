import type { BacktestNavResultV3 } from '@thesis-ledger/schemas';
import type { ArtifactRef } from './backtest-artifact-store.js';
import type { LocalNavSnapshotStore } from './backtest-nav-snapshot-store.js';
import { canonicalizeManifest } from './backtest-snapshot.js';
import { runNavOfflineStrategyV3 } from './backtest-nav-offline-strategy.js';
import {
  projectNavResultV3,
  verifyNavResultV3,
  NAV_V3_RUNNER_VERSION,
} from './backtest-nav-result-v3.js';

export interface BacktestNavV3RunnerInput {
  runId: string;
  snapshotRef: { snapshotId: string; contentHash: string };
  artifactRefs: readonly ArtifactRef[];
}

export interface BacktestNavV3Runner {
  readonly navId: string;
  runNav(input: BacktestNavV3RunnerInput, signal: AbortSignal): Promise<BacktestNavResultV3>;
}

const notAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new Error('NAV 离线执行已取消');
};

export class LocalNavSnapshotV3Runner implements BacktestNavV3Runner {
  readonly navId = NAV_V3_RUNNER_VERSION;
  constructor(private readonly snapshots: LocalNavSnapshotStore) {}

  async runNav(input: BacktestNavV3RunnerInput, signal: AbortSignal): Promise<BacktestNavResultV3> {
    notAborted(signal);
    const frozen = await this.snapshots.replay(input.runId);
    notAborted(signal);
    const { manifest } = frozen;
    if (
      input.snapshotRef.snapshotId !== manifest.contentHash ||
      input.snapshotRef.contentHash !== manifest.contentHash
    )
      throw new Error('NAV Runner Snapshot 身份不符');
    const expected: ArtifactRef[] = [manifest.artifact, manifest.contextArtifact].map((ref) => ({
      ...ref,
      artifactId: ref.contentHash,
      key: `${manifest.runId}/${ref.key}`,
    }));
    const refs = new Map(input.artifactRefs.map((ref) => [ref.key, ref]));
    if (
      refs.size !== input.artifactRefs.length ||
      refs.size !== expected.length ||
      expected.some((ref) => {
        const supplied = refs.get(ref.key);
        return !supplied || canonicalizeManifest(supplied) !== canonicalizeManifest(ref);
      })
    )
      throw new Error('NAV Runner Artifact 引用必须与冻结产物完全一致');
    const output = runNavOfflineStrategyV3(frozen, signal);
    notAborted(signal);
    const result = verifyNavResultV3(projectNavResultV3(frozen, output), frozen);
    notAborted(signal);
    return result;
  }
}
