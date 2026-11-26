import type { BacktestNavResultV3 } from '@thesis-ledger/schemas';
import type { ArtifactRef } from './backtest-artifact-store.js';
import type { LocalNavSnapshotStore } from './backtest-nav-snapshot-store.js';
import { canonicalizeManifest } from './backtest-snapshot.js';
import { navOfflineStrategySteps } from './backtest-nav-offline-strategy.js';
import { advanceBacktestComputation } from '@thesis-ledger/domain';
import {
  navResultV3Steps,
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
  runNav(input: BacktestNavV3RunnerInput, signal: AbortSignal, context?: NavRunnerContext): Promise<BacktestNavResultV3>;
}

export interface NavRunnerContext {
  snapshots: LocalNavSnapshotStore;
  onStage?: (stage: 'simulating' | 'analyzing') => Promise<void>;
}

const notAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new Error('NAV 离线执行已取消');
};

export class LocalNavSnapshotV3Runner implements BacktestNavV3Runner {
  readonly navId = NAV_V3_RUNNER_VERSION;
  constructor(private readonly snapshots: LocalNavSnapshotStore) {}

  async runNav(input: BacktestNavV3RunnerInput, signal: AbortSignal, context?: NavRunnerContext): Promise<BacktestNavResultV3> {
    notAborted(signal);
    const frozen = await (context?.snapshots ?? this.snapshots).replay(input.runId);
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
    await context?.onStage?.('simulating');
    const output = await advanceBacktestComputation(navOfflineStrategySteps(frozen, signal), { signal });
    notAborted(signal);
    await context?.onStage?.('analyzing');
    const result = verifyNavResultV3(await advanceBacktestComputation(navResultV3Steps(frozen, output), { signal }), frozen);
    notAborted(signal);
    return result;
  }
}
