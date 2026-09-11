import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { canonicalStrategyMonitoringJson } from '@thesis-ledger/domain';

export type ExperimentRow = {
  id: string;
  ownerKey: string;
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
  createdAt: Date;
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
  totalReturn?: string;
  maxDrawdown?: string;
  turnover?: string;
  score?: number;
  reason?: string;
};

export const optimizationSha256 = (value: unknown) =>
  createHash('sha256').update(canonicalStrategyMonitoringJson(value)).digest('hex');

export const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

export const redactOptimizationError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/(?:sk-|api[_-]?key[=:])\S+/giu, '[REDACTED]')
    .slice(0, 500);

export const optimizationFeatureEnabled = () =>
  process.env.STRATEGY_AI_OPTIMIZATION_ENABLED !== 'false';
