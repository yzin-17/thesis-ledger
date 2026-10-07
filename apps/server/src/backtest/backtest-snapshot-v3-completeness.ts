import {
  validateCompleteSnapshotSourceBindingsV3,
  validateCompleteSnapshotExecutionFactsV3,
} from './backtest-snapshot-v3-completeness-checks.js';
export {
  priceInputBindingsArtifactKeyV3,
  snapshotPriceInputBindingsRowV3,
} from './backtest-snapshot-v3-completeness-checks.js';
import {
  runConfigSchemaV3,
  strategySchema,
  type BacktestSnapshotManifestV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest } from './backtest-snapshot.js';
import {
  dependencyEvidenceKey,
  type SnapshotDependencyV3Artifact,
} from './backtest-snapshot-v3-dependencies.js';
import { validateSnapshotDependencyArtifactsV3 } from './backtest-snapshot-v3-dependency-validation.js';
import { validateSnapshotCalendarAlignmentV3 } from './backtest-snapshot-v3-calendar-alignment.js';
import { parseSettlementCalendarPolicy } from './backtest-settlement-calendar.js';
import { tradabilityWindowFromArtifactsV3 } from './backtest-snapshot-v3-tradability.js';
import { snapshotEventRevisionsV3Schema } from './backtest-snapshot-v3-events.js';
import {
  planSnapshotInputsV3,
  SnapshotV3InputPlanError,
} from './backtest-snapshot-v3-input-plan.js';

function fail(message: string): never {
  throw new SnapshotV3InputPlanError(message);
}

const same = (left: unknown, right: unknown) =>
  canonicalizeManifest(left) === canonicalizeManifest(right);

const json = (row: ArtifactRow, field: string): unknown => {
  const encoded = row[field];
  if (typeof encoded !== 'string') fail(`V3 完整快照缺少 ${field}`);
  try {
    return JSON.parse(encoded) as unknown;
  } catch {
    fail(`V3 完整快照 ${field} 不是有效 JSON`);
  }
};

/** Reconstruct readiness from frozen inputs. Caller verifies physical artifact hashes. */
export const validateCompleteSnapshotInputsV3 = (
  manifest: BacktestSnapshotManifestV3,
  artifacts: readonly SnapshotDependencyV3Artifact[],
): void => {
  if (manifest.quality.completeness !== 'complete') return;
  const byKey = new Map(artifacts.map((artifact) => [artifact.key, artifact.rows]));
  if (byKey.size !== artifacts.length) fail('V3 完整快照 Artifact key 重复');
  const metadata = byKey.get('metadata/snapshot-metadata-v3.parquet');
  if (metadata?.length !== 1 || metadata[0]?.kind !== 'snapshot-metadata-v3') {
    fail('V3 完整快照 metadata 缺失');
  }
  const strategyValue = json(metadata[0], 'strategy');
  strategySchema.parse(strategyValue);
  const strategy = strategyValue as BacktestStrategy;
  const runConfig = runConfigSchemaV3.parse(json(metadata[0], 'runConfig'));
  const inputPlan = planSnapshotInputsV3({ strategy, runConfig });
  const marketEvidence = byKey.get('metadata/market-window-evidence-v3.parquet');
  if (marketEvidence?.length !== 1) fail('V3 完整快照缺少唯一行情证据。');
  const eventRevisions = snapshotEventRevisionsV3Schema.parse(
    json(marketEvidence[0]!, 'revisions'),
  );
  const settlementCalendarPolicy = parseSettlementCalendarPolicy(
    metadata[0].settlementCalendarPolicy,
  );
  const input = {
    strategy,
    runConfig,
    plan: inputPlan.plan,
    eventRevisions,
    settlementCalendarPolicy,
    tradabilityWindow: tradabilityWindowFromArtifactsV3(
      strategy.executionInstrument.symbol, marketEvidence[0]!, byKey.get('execution/bars.parquet') ?? [],
    ),
  };
  validateCompleteSnapshotSourceBindingsV3(manifest, byKey, strategy, runConfig, inputPlan);
  const dependencies = artifacts.filter(
    ({ key }) =>
      key === dependencyEvidenceKey ||
      ['calendar/', 'instrumentFacts/', 'corporateActions/'].some((prefix) =>
        key.startsWith(prefix),
      ),
  );
  const validated = validateSnapshotDependencyArtifactsV3(input, dependencies);
  validateSnapshotCalendarAlignmentV3(
    inputPlan,
    byKey,
    settlementCalendarPolicy ? runConfig : undefined,
  );
  if (!same(manifest.providerRevisions, validated.providerRevisions)) {
    fail('V3 完整快照非价格事实版本与证据不一致');
  }
  validateCompleteSnapshotExecutionFactsV3(byKey, strategy, runConfig, inputPlan, validated);
};
