import type {
  MonitoringPlan,
  OptimizationExperimentCreate,
  StrategyParameterDescriptor,
} from '@thesis-ledger/schemas';
import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';

export type OptimizationCapabilities = {
  riskApplicationsEnabled: boolean;
  aiOptimizationEnabled: boolean;
  providers: Array<{
    provider: string;
    model: string;
    costStatus: 'known' | 'unknown';
    costCurrency?: string;
    pricingVersion?: string;
  }>;
};

export type OptimizationExperimentSummary = {
  id: string;
  baselineStrategyVersionId: string;
  status: string;
  stage: string;
  objective: Record<string, unknown>;
  split: Record<string, unknown>;
  modelConfig: Array<{
    provider: string;
    model: string;
    costStatus?: 'known' | 'unknown';
    costCurrency?: string;
    pricingVersion?: string;
  }>;
  aiCallsUsed: number;
  backtestRunsUsed: number;
  inputTokensUsed: number;
  outputTokensUsed: number;
  costUsed: string | number;
  selectedCandidateId?: string | null;
  lockedCandidateIds?: string[] | null;
  testExposedAt?: string | null;
  stopReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OptimizationCandidate = {
  id: string;
  experimentId: string;
  candidateNumber: number;
  modelKey: string;
  candidateStrategyVersionId: string;
  executionHash: string;
  proposal: Record<string, unknown>;
  diff: Array<Record<string, unknown>>;
  validationStatus: string;
  runRefs: Record<string, string>;
  metrics: Record<string, unknown>;
  adoptedStrategyVersionId?: string | null;
  validationScore?: number | null;
};

export type OptimizationCompare = {
  experiment: OptimizationExperimentSummary;
  baseline: { runRefs: Record<string, string>; metrics: Record<string, unknown> };
  candidates: OptimizationCandidate[];
  attempts: Array<Record<string, unknown>>;
  note: string;
};

export type RiskApplicationPreview = {
  previewHash: string;
  plan: MonitoringPlan;
  evaluations: Array<{
    sourceKey: string;
    state: 'triggered' | 'not_triggered' | 'unavailable' | 'not_applicable';
    value?: string;
    threshold: string;
    reason?: string;
  }>;
  cycleMode: 'existingAndFuture' | 'nextPositionCycle';
  context: Record<string, unknown>;
};

export type RiskApplicationUpgradePreview = RiskApplicationPreview & {
  currentRevision: number;
  diff: Array<{
    sourceKey: string;
    before: MonitoringPlan['rules'][number] | null;
    after: MonitoringPlan['rules'][number] | null;
    change: 'added' | 'removed' | 'changed' | 'unchanged';
  }>;
};

export type StrategyRiskApplication = {
  id: string;
  strategyVersionId: string;
  accountId: string;
  symbol: string;
  revision: number;
  planHash: string;
  plan: MonitoringPlan;
  cycleMode: string;
  enabled: boolean;
  notification: { enabled?: boolean; cooldownMinutes?: number };
  coverage: MonitoringPlan['coverage'];
  createdAt: string;
  updatedAt: string;
};

const jsonPost = <T>(path: string, body: unknown, client?: DesktopRequestClient) =>
  requestDesktopJson<T>(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    client,
  );

export const fetchOptimizationCapabilities = (client?: DesktopRequestClient) =>
  requestDesktopJson<OptimizationCapabilities>('/strategy-optimization/capabilities', undefined, client);

export const fetchStrategyOptimizationParameters = (
  strategyVersionId: string,
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<StrategyParameterDescriptor[]>(
    `/strategy-optimization/strategies/${encodeURIComponent(strategyVersionId)}/parameters`,
    undefined,
    client,
  );

export const fetchMonitoringPlan = (strategyVersionId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<MonitoringPlan>(
    `/strategy-optimization/strategies/${encodeURIComponent(strategyVersionId)}/monitoring-plan`,
    undefined,
    client,
  );

export const fetchOptimizationExperiments = (client?: DesktopRequestClient) =>
  requestDesktopJson<OptimizationExperimentSummary[]>(
    '/strategy-optimization/experiments?limit=50',
    { cache: 'no-store' },
    client,
  );

export const fetchOptimizationExperiment = (id: string, client?: DesktopRequestClient) =>
  requestDesktopJson<{
    experiment: OptimizationExperimentSummary;
    candidates: OptimizationCandidate[];
    attempts: Array<Record<string, unknown>>;
  }>(`/strategy-optimization/experiments/${encodeURIComponent(id)}`, { cache: 'no-store' }, client);

export const fetchOptimizationCompare = (id: string, client?: DesktopRequestClient) =>
  requestDesktopJson<OptimizationCompare>(
    `/strategy-optimization/experiments/${encodeURIComponent(id)}/compare`,
    { cache: 'no-store' },
    client,
  );

export const createOptimizationExperiment = (
  input: OptimizationExperimentCreate,
  client?: DesktopRequestClient,
) => jsonPost<OptimizationExperimentSummary>('/strategy-optimization/experiments', input, client);

export const cancelOptimizationExperiment = (id: string, client?: DesktopRequestClient) =>
  jsonPost<OptimizationExperimentSummary>(
    `/strategy-optimization/experiments/${encodeURIComponent(id)}/cancel`,
    {},
    client,
  );

export const finalizeOptimizationExperiment = (
  id: string,
  input: { candidateIds: string[]; selectedCandidateId: string; expectedStage: 'awaiting_finalization' },
  client?: DesktopRequestClient,
) =>
  jsonPost<OptimizationCompare>(
    `/strategy-optimization/experiments/${encodeURIComponent(id)}/finalize`,
    input,
    client,
  );

export const adoptOptimizationCandidate = (
  id: string,
  input: {
    candidateId: string;
    candidateHash: string;
    expectedStrategyVersion: number;
    idempotencyKey: string;
    acknowledgeTestExposure?: boolean;
  },
  client?: DesktopRequestClient,
) =>
  jsonPost<{
    strategyVersion: { id: string; version: number };
    monitoringPlan: MonitoringPlan;
    riskApplicationEnabled: boolean;
  }>(`/strategy-optimization/experiments/${encodeURIComponent(id)}/adopt`, input, client);

export const previewStrategyRiskApplication = (
  input: {
    strategyVersionId: string;
    accountId: string;
    symbol: string;
    cycleMode: 'existingAndFuture' | 'nextPositionCycle';
  },
  client?: DesktopRequestClient,
) => jsonPost<RiskApplicationPreview>('/strategy-optimization/risk-applications/preview', input, client);

export const createStrategyRiskApplication = (
  input: {
    strategyVersionId: string;
    accountId: string;
    symbol: string;
    cycleMode: 'existingAndFuture' | 'nextPositionCycle';
    previewHash: string;
    idempotencyKey: string;
    enabled: boolean;
    notification: { enabled: boolean; cooldownMinutes: number };
  },
  client?: DesktopRequestClient,
) => jsonPost<StrategyRiskApplication>('/strategy-optimization/risk-applications', input, client);

export const fetchStrategyRiskApplications = (
  accountId?: string,
  symbol?: string,
  client?: DesktopRequestClient,
) => {
  const query = new URLSearchParams();
  if (accountId) query.set('accountId', accountId);
  if (symbol) query.set('symbol', symbol);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return requestDesktopJson<StrategyRiskApplication[]>(
    `/strategy-optimization/risk-applications${suffix}`,
    { cache: 'no-store' },
    client,
  );
};

export const updateStrategyRiskApplication = (
  id: string,
  input: { expectedRevision: number; enabled?: boolean },
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<StrategyRiskApplication>(
    `/strategy-optimization/risk-applications/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );

export const previewStrategyRiskApplicationUpgrade = (
  id: string,
  targetStrategyVersionId: string,
  client?: DesktopRequestClient,
) =>
  jsonPost<RiskApplicationUpgradePreview>(
    `/strategy-optimization/risk-applications/${encodeURIComponent(id)}/upgrade-preview`,
    { targetStrategyVersionId },
    client,
  );

export const upgradeStrategyRiskApplication = (
  id: string,
  input: {
    expectedRevision: number;
    targetStrategyVersionId: string;
    previewHash: string;
    idempotencyKey: string;
  },
  client?: DesktopRequestClient,
) =>
  jsonPost<StrategyRiskApplication>(
    `/strategy-optimization/risk-applications/${encodeURIComponent(id)}/upgrade`,
    input,
    client,
  );
