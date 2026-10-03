import type { BacktestSnapshotManifestV3 } from '@thesis-ledger/schemas';
import { SnapshotV3InputPlanError } from './backtest-snapshot-v3-input-plan.js';

/** 最终历史窗口验证及离线封存尚未实现，任何快照字段均不能授予该能力。 */
export const assertSnapshotV3PitExecutionAvailable = (
  manifest: BacktestSnapshotManifestV3,
): void => {
  if (manifest.executionPriceProtocol.history.basis === 'point-in-time') {
    throw new SnapshotV3InputPlanError(
      'Snapshot V3 严格历史执行不可用：historicalDecisionWindow 最终证据核验与离线封存尚未实现',
    );
  }
};
