import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { canonicalStrategyMonitoringJson } from '@thesis-ledger/domain';
import type {
  OptimizationAdoptionDiffEntry,
  OptimizationCandidateSource,
  OptimizationCostSummary,
  OptimizationExperimentSource,
  OptimizationTradingCostReadModel,
  ResultReadEligibility,
} from '@thesis-ledger/schemas';

export type ExperimentRow = {
  id: string;
  ownerKey: string;
  name: string | null;
  sourceMode: 'existing' | 'discovery';
  discoveryScope: unknown;
  strategySpaceVersion: string | null;
  baselineStrategyVersionId: string;
  status: string;
  stage: string;
  objective: unknown;
  allowedParameterIds: unknown;
  split: unknown;
  runConfig: unknown;
  dataFingerprint: string;
  modelConfig: unknown;
  budget: unknown;
  maxRounds: number;
  aiCallsUsed: number;
  backtestRunsUsed: number;
  inputTokensUsed: number;
  outputTokensUsed: number;
  pausedDurationMs: number;
  costUsed: Prisma.Decimal;
  baselineRunRefs: unknown;
  baselineMetrics: unknown;
  frozenDataFingerprints: unknown;
  lockedCandidateIds: unknown;
  selectedCandidateId: string | null;
  testExposedAt: Date | null;
  exposure: unknown;
  stopReason: string | null;
  cancelRequestedAt: Date | null;
  leaseUntil: Date | null;
  executionAttempt: number;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ExperimentReadRow = ExperimentRow & {
  strategyId: string | null;
  strategyName: string | null;
  strategyVersion: number | null;
  strategySchemaVersion: number | null;
  baselineStrategySchema?: unknown;
};

export type CandidateReadRow = CandidateRow & {
  experimentStage: string | null;
};

export type EnrichedExperiment = Omit<ExperimentRow, 'costUsed'> & {
  costUsed: Prisma.Decimal | null;
  costSummary: OptimizationCostSummary;
  nameSource: 'stored' | 'legacy_fallback';
  source: OptimizationExperimentSource;
  readEligibility: ResultReadEligibility;
  tradingCost: OptimizationTradingCostReadModel;
};

export type EnrichedCandidate = CandidateRow & {
  source: OptimizationCandidateSource;
  readEligibility: ResultReadEligibility;
};

export type CandidateRow = {
  id: string;
  experimentId: string;
  candidateNumber: number;
  modelKey: string;
  candidateStrategyVersionId: string;
  executionHash: string;
  parentCandidateId: string | null;
  proposal: unknown;
  diff: unknown;
  validationStatus: string;
  duplicateOfId: string | null;
  runRefs: unknown;
  metrics: unknown;
  adoptedStrategyVersionId: string | null;
  createdAt: Date;
};

export type AttemptRow = {
  id: string;
  experimentId: string;
  modelKey: string;
  aiRunId: string | null;
  attempt: number;
  status: string;
  proposal: unknown;
  error: string | null;
  startedAt: Date | null;
  leaseUntil: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: Prisma.Decimal | null;
  durationMs: number | null;
  modelMetadata: unknown;
};

export type StrategyVersionRecord = {
  id: string;
  strategyId: string;
  version: number;
  schemaVersion: number;
  schema: unknown;
};

export type SplitName = 'development' | 'validation' | 'test';

export type EvaluationSummary = {
  runId: string;
  status: 'valid' | 'invalid';
  completeness: string;
  tradeCount: number;
  fillCount?: number;
  rejectedOrderCount?: number;
  rejectionReasons?: Record<string, number>;
  totalReturn?: string;
  maxDrawdown?: string;
  turnover?: string;
  score?: number;
  reason?: string;
};

export const optimizationSha256 = (value: unknown) =>
  createHash('sha256').update(canonicalStrategyMonitoringJson(value)).digest('hex');

const sameJsonValue = (left: unknown, right: unknown) => {
  try {
    return canonicalStrategyMonitoringJson(left) === canonicalStrategyMonitoringJson(right);
  } catch {
    return Object.is(left, right);
  }
};

/** 返回完整定义之间的可审阅差异；数组按整体值比较，避免伪造数组内稳定身份。 */
export const strategyDefinitionDiff = (
  before: unknown,
  after: unknown,
  path = '$',
): OptimizationAdoptionDiffEntry[] => {
  if (sameJsonValue(before, after)) return [];
  if (
    before === null ||
    after === null ||
    typeof before !== 'object' ||
    typeof after !== 'object' ||
    Array.isArray(before) ||
    Array.isArray(after)
  )
    return [{ path, before, after }];
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.flatMap((key) => strategyDefinitionDiff(left[key], right[key], `${path}.${key}`));
};

export const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

export const defaultExperimentName = (input: {
  sourceMode: 'existing' | 'discovery';
  strategyName?: string | null;
  discoveryScope?: unknown;
}) => {
  if (input.sourceMode === 'existing' && input.strategyName?.trim())
    return `${input.strategyName.trim()} · AI 优化`;
  const scope = toRecord(input.discoveryScope);
  const instrument = toRecord(scope.executionInstrument);
  if (input.sourceMode === 'discovery' && typeof instrument.symbol === 'string')
    return `从零探索 · ${instrument.symbol}`;
  return input.sourceMode === 'discovery' ? '从零探索实验' : 'AI 策略优化';
};

export const experimentDisplayName = (
  row: Pick<ExperimentRow, 'name' | 'sourceMode' | 'discoveryScope'> & {
    strategyName?: string | null;
  },
) => row.name?.trim() || defaultExperimentName(row);

export const optimizationRemainingDurationMs = (
  input: Pick<ExperimentRow, 'createdAt' | 'pausedDurationMs' | 'budget'>,
  now = Date.now(),
) => {
  const raw = toRecord(input.budget).maxDurationSeconds;
  const maxSeconds = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 1_800;
  const activeElapsedMs = Math.max(0, now - input.createdAt.getTime() - input.pausedDurationMs);
  return Math.max(0, maxSeconds * 1_000 - activeElapsedMs);
};

export const optimizationAttemptFailureStatus = (error: unknown) => {
  const name = error instanceof Error ? error.name : '';
  return name === 'AbortError' || name === 'TimeoutError' ? 'unknown_outcome' : 'failed';
};

export const redactOptimizationError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/(?:sk-|api[_-]?key[=:])\S+/giu, '[REDACTED]')
    .slice(0, 500);

export const optimizationFeatureEnabled = () =>
  process.env.STRATEGY_AI_OPTIMIZATION_ENABLED !== 'false';
