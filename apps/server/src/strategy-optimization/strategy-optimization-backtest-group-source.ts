import type {
  OptimizationCandidateSource,
  OptimizationExperimentSource,
} from '@thesis-ledger/schemas';

export type BacktestAssociationRow = {
  runId: string;
  experimentId: string;
  baselineStrategyVersionId: string;
  experimentName: string | null;
  sourceMode: 'existing' | 'discovery';
  discoveryScope: unknown;
  strategySpaceVersion: string | null;
  experimentStage: string;
  relation: 'baseline' | 'candidate';
  split: string;
  candidateId: string | null;
  candidateNumber: number | null;
  candidateStrategyVersionId: string | null;
  strategyId: string | null;
  strategyName: string | null;
  strategyVersion: number | null;
  strategySchemaVersion: number | null;
};

export type BacktestStrategyVersionSource = {
  id: string;
  version: number;
  schemaVersion: number;
  strategy: { id: string; name: string };
};

export function candidateSourceForBacktestAssociation(
  association: BacktestAssociationRow,
): OptimizationCandidateSource | null {
  return association.relation === 'candidate' &&
    association.candidateId &&
    association.candidateNumber &&
    association.candidateStrategyVersionId
    ? {
        kind: 'candidate',
        experimentId: association.experimentId,
        candidateId: association.candidateId,
        candidateStrategyVersionId: association.candidateStrategyVersionId,
        candidateNumber: association.candidateNumber,
        stage: association.experimentStage,
      }
    : null;
}

export function sourceForUserBacktest(
  strategyVersion: BacktestStrategyVersionSource | undefined,
): OptimizationExperimentSource | null {
  let source: OptimizationExperimentSource | null = null;
  if (strategyVersion) {
    source = { kind: 'unknown', reason: 'missing_source', referenceId: strategyVersion.id };
    if (
      Number.isInteger(strategyVersion.version) &&
      strategyVersion.version > 0 &&
      Number.isInteger(strategyVersion.schemaVersion) &&
      strategyVersion.schemaVersion > 0
    ) {
      source = {
        kind: 'existing',
        strategyId: strategyVersion.strategy.id,
        strategyVersionId: strategyVersion.id,
        strategyName: strategyVersion.strategy.name,
        version: strategyVersion.version,
        schemaVersion: strategyVersion.schemaVersion,
      };
    }
  }

  return source;
}
