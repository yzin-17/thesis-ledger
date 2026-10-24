import type {
  MonitoringPlan,
  AiExecutionReadModel,
  AiUsageCompleteness,
  OptimizationAdoptionContext,
  OptimizationExperimentCreate,
  OptimizationExperimentSource,
  OptimizationCandidateSource,
  OptimizationCostSummary,
  OptimizationReasoningEffort,
  OptimizationTradingCostReadModel,
  ResultReadEligibility,
  StrategyParameterDescriptor,
} from '@thesis-ledger/schemas';
import { strategyClients } from '@thesis-ledger/api-client';
import { omitUndefinedDeep } from '@thesis-ledger/schemas';
import { parsedDesktopRequest, type DesktopRequestClient } from '../shared/request.js';
import type { BacktestJobSummary } from './strategy.types.js';

export type OptimizationCapabilities = {
  riskApplicationsEnabled: boolean;
  aiOptimizationEnabled: boolean;
  providers: Array<{
    provider: string;
    model: string;
    costStatus: 'known' | 'unknown';
    costCurrency?: string;
    pricingVersion?: string;
    reasoning?: {
      supportedEfforts?: OptimizationReasoningEffort[] | null;
      defaultEffort?: OptimizationReasoningEffort;
      mandatory?: boolean;
    };
  }>;
};

export type OptimizationExperimentSummary = {
  runConfig?: unknown;
  readEligibility?: ResultReadEligibility;
  id: string;
  name: string;
  nameSource: 'stored' | 'legacy_fallback';
  source?: OptimizationExperimentSource;
  sourceMode?: 'existing' | 'discovery';
  discoveryScope?: {
    executionInstrument: {
      symbol: string;
      market: 'CN' | 'HK' | 'US';
      assetType: 'stock' | 'etf' | 'fund';
    };
    primaryTimeframe: string;
  } | null;
  strategySpaceVersion?: string | null;
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
    reasoningEffort?: OptimizationReasoningEffort;
  }>;
  aiCallsUsed: number;
  backtestRunsUsed: number;
  inputTokensUsed: number;
  outputTokensUsed: number;
  costUsed: string | number | null;
  costSummary: OptimizationCostSummary;
  tradingCost: OptimizationTradingCostReadModel;
  selectedCandidateId?: string | null;
  lockedCandidateIds?: string[] | null;
  testExposedAt?: string | null;
  stopReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OptimizationCandidate = {
  readEligibility?: ResultReadEligibility;
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
  source?: OptimizationCandidateSource;
};

export type OptimizationExperimentPage = {
  items: OptimizationExperimentSummary[];
  totalCount: number;
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
};

export type StrategyBacktestGroupPage = {
  items: Array<{
    id: string;
    kind: 'user' | 'experiment';
    name: string;
    experimentId: string | null;
    experimentStage: string | null;
    source: OptimizationExperimentSource | null;
    jobs: BacktestJobSummary[];
    members: Array<{
      jobId: string;
      relation: 'user' | 'baseline' | 'candidate';
      split: string | null;
      candidateSource: OptimizationCandidateSource | null;
    }>;
  }>;
  totalCount: number;
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
};

export type OptimizationAttempt = {
  id: string;
  experimentId: string;
  modelKey: string;
  aiRunId?: string | null;
  attempt: number;
  status: string;
  proposal?: unknown;
  error?: string | null;
  createdAt: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cost?: string | number | null;
  durationMs?: number | null;
  modelMetadata?: Record<string, unknown> | null;
  execution?: AiExecutionReadModel | null;
  usageCompleteness?: AiUsageCompleteness;
};

export type OptimizationCompare = {
  experiment: OptimizationExperimentSummary;
  baseline: { runRefs: Record<string, string>; metrics: Record<string, unknown> };
  candidates: OptimizationCandidate[];
  attempts: OptimizationAttempt[];
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

export type RiskRuleDiff = {
  sourceKey: string;
  before: MonitoringPlan['rules'][number] | null;
  after: MonitoringPlan['rules'][number] | null;
  change: 'added' | 'removed' | 'changed' | 'unchanged';
};

export type RiskApplicationUpgradePreview = RiskApplicationPreview & {
  currentRevision: number;
  diff: RiskRuleDiff[];
  targetApplication?: {
    id: string;
    strategyVersionId: string;
    accountId: string;
    symbol: string;
    cycleMode: string;
    revision: number;
    enabled: boolean;
    archivedAt?: string | null;
  } | null;
};

export type StrategyRiskNotification = {
  enabled: boolean;
  cooldownMinutes: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  channels: Array<'feishu'>;
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
  notification: StrategyRiskNotification;
  coverage: MonitoringPlan['coverage'];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  applicationResolution?: {
    kind: 'reused' | 'upgrade_target_exists' | 'already_bound';
    reason?: 'same_identity';
    sourceApplicationId?: string;
    management: {
      applicationId: string;
      actions: Array<'view' | 'edit'>;
    };
  };
};

export type AdoptionRiskApplicationDiff = {
  applicationId: string;
  accountId: string;
  symbol: string;
  currentStrategyVersionId: string;
  currentRevision: number;
  enabled: boolean;
  diff: RiskRuleDiff[];
};

const optimization = (client?: DesktopRequestClient) =>
  strategyClients(parsedDesktopRequest(client)).optimization;
const risk = (client?: DesktopRequestClient) => strategyClients(parsedDesktopRequest(client)).risk;
export const fetchOptimizationCapabilities = (
  client?: DesktopRequestClient,
): Promise<OptimizationCapabilities> => optimization(client).capabilities().then(omitUndefinedDeep);
export const fetchStrategyOptimizationParameters = (
  id: string,
  client?: DesktopRequestClient,
): Promise<StrategyParameterDescriptor[]> =>
  optimization(client).parameters(id).then(omitUndefinedDeep);
export const fetchMonitoringPlan = (
  id: string,
  client?: DesktopRequestClient,
): Promise<MonitoringPlan> => optimization(client).monitoringPlan(id).then(omitUndefinedDeep);
type ListOptions = Parameters<ReturnType<typeof optimization>['list']>[0];
export const fetchOptimizationExperiments = (
  options: ListOptions = {},
  client?: DesktopRequestClient,
): Promise<OptimizationExperimentPage> =>
  optimization(client).list(options).then(omitUndefinedDeep);
export const fetchStrategyBacktestGroups = (
  options: ListOptions = {},
  client?: DesktopRequestClient,
): Promise<StrategyBacktestGroupPage> =>
  optimization(client).groups(options).then(omitUndefinedDeep);
export const fetchOptimizationExperiment = (
  id: string,
  client?: DesktopRequestClient,
): Promise<{
  experiment: OptimizationExperimentSummary;
  candidates: OptimizationCandidate[];
  attempts: OptimizationAttempt[];
}> => optimization(client).read(id).then(omitUndefinedDeep);
export const fetchOptimizationCompare = (
  id: string,
  client?: DesktopRequestClient,
): Promise<OptimizationCompare> => optimization(client).compare(id).then(omitUndefinedDeep);
export const createOptimizationExperiment = (
  input: OptimizationExperimentCreate,
  client?: DesktopRequestClient,
): Promise<OptimizationExperimentSummary> =>
  optimization(client).create(input).then(omitUndefinedDeep);
export const cloneOptimizationExperiment = (
  id: string,
  options: { acknowledgeUnknownCost?: boolean; name?: string } = {},
  client?: DesktopRequestClient,
): Promise<OptimizationExperimentSummary> =>
  optimization(client)
    .clone(id, { ...options, idempotencyKey: crypto.randomUUID() })
    .then(omitUndefinedDeep);
export const renameOptimizationExperiment = (
  id: string,
  name: string,
  client?: DesktopRequestClient,
): Promise<OptimizationExperimentSummary> =>
  optimization(client).rename(id, name).then(omitUndefinedDeep);
export const cancelOptimizationExperiment = (
  id: string,
  client?: DesktopRequestClient,
): Promise<OptimizationExperimentSummary> =>
  optimization(client).cancel(id).then(omitUndefinedDeep);
export const finalizeOptimizationExperiment = (
  id: string,
  input: Parameters<ReturnType<typeof optimization>['finalize']>[1],
  client?: DesktopRequestClient,
): Promise<OptimizationCompare> => optimization(client).finalize(id, input).then(omitUndefinedDeep);
export const adoptOptimizationCandidate = (
  id: string,
  input: Parameters<ReturnType<typeof optimization>['adopt']>[1],
  client?: DesktopRequestClient,
) => optimization(client).adopt(id, input).then(omitUndefinedDeep);
export const fetchOptimizationAdoptionContext = (
  id: string,
  candidateId: string,
  client?: DesktopRequestClient,
): Promise<OptimizationAdoptionContext> =>
  optimization(client).adoptionContext(id, candidateId).then(omitUndefinedDeep);
export const previewStrategyRiskApplication = (
  input: Parameters<ReturnType<typeof risk>['preview']>[0],
  client?: DesktopRequestClient,
): Promise<RiskApplicationPreview> => risk(client).preview(input).then(omitUndefinedDeep);
export const createStrategyRiskApplication = (
  input: Parameters<ReturnType<typeof risk>['create']>[0],
  client?: DesktopRequestClient,
): Promise<StrategyRiskApplication> => risk(client).create(input).then(omitUndefinedDeep);
export const fetchStrategyRiskApplications = (
  accountId?: string,
  symbol?: string,
  client?: DesktopRequestClient,
): Promise<StrategyRiskApplication[]> =>
  risk(client)
    .list({ ...(accountId ? { accountId } : {}), ...(symbol ? { symbol } : {}) })
    .then(omitUndefinedDeep);
export const updateStrategyRiskApplication = (
  id: string,
  input: Parameters<ReturnType<typeof risk>['update']>[1],
  client?: DesktopRequestClient,
): Promise<StrategyRiskApplication> => risk(client).update(id, input).then(omitUndefinedDeep);
export const deleteStrategyRiskApplication = (
  id: string,
  expectedRevision: number,
  client?: DesktopRequestClient,
): Promise<StrategyRiskApplication> =>
  risk(client).archive(id, expectedRevision).then(omitUndefinedDeep);
export const previewStrategyRiskApplicationUpgrade = (
  id: string,
  targetStrategyVersionId: string,
  client?: DesktopRequestClient,
): Promise<RiskApplicationUpgradePreview> =>
  risk(client).previewUpgrade(id, targetStrategyVersionId).then(omitUndefinedDeep);
export const upgradeStrategyRiskApplication = (
  id: string,
  input: Parameters<ReturnType<typeof risk>['upgrade']>[1],
  client?: DesktopRequestClient,
): Promise<StrategyRiskApplication> => risk(client).upgrade(id, input).then(omitUndefinedDeep);
