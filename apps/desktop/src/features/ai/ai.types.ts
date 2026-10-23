import type {
  AiExecutionReadModel,
  AiResearchDisplayProjection,
  AiResearchSourceType,
  AiUsageCompleteness,
  ResearchReportDetail,
} from '@thesis-ledger/schemas';

export type AiResearchScope = 'portfolio' | 'account' | 'position' | 'strategy';

export type AiRunStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | (string & {});

export type AiRunFilterStatus = 'all' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type AiRunSourceFilter = 'all' | AiResearchSourceType;

export interface AiResearchContext {
  scope: AiResearchScope;
  mode?: 'actual' | 'shadow' | undefined;
  portfolioId?: string | undefined;
  accountId?: string | undefined;
  symbol?: string | undefined;
  strategyVersionId?: string | undefined;
}

export interface AiCitation {
  toolCallId?: string | undefined;
  tool: string;
  sourceId: string;
  provider: string;
  observedAt: string;
  marketTime?: string | undefined;
  availableAt?: string | undefined;
  fetchedAt?: string | undefined;
}

export interface AiEvidence {
  claim: string;
  citations: AiCitation[];
}

export interface AiResearchResult {
  version: 1;
  provider: string;
  symbol?: string | undefined;
  score?: number | undefined;
  conclusion: string;
  evidence: AiEvidence[];
  risks: string[];
  unknowns: string[];
  signals: string[];
  disclaimer: string;
  context?: AiResearchContext | undefined;
  createdAt: string;
}

export interface AiToolCall {
  id?: string;
  tool: string;
  permission: string;
  status: 'ok' | 'unavailable' | 'denied' | (string & {});
  inputSummary: string;
  outputSummary?: string;
  provider?: string;
  durationMs?: number;
  marketTime?: string;
  availableAt?: string;
  fetchedAt?: string;
  createdAt?: string;
}

export interface AiRunRecord {
  savedReport?: ResearchReportDetail;
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: AiRunStatus;
  question?: string | null;
  context: AiResearchContext | null;
  checkpoint?: Record<string, unknown> | null;
  result?: AiResearchResult | null;
  errorCode?: string | null;
  errorSummary?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number | string;
  durationMs?: number | null;
  createdAt: string;
  updatedAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  retryOfRunId?: string | null;
  fallbackSummary?: string | null;
  execution?: AiExecutionReadModel | null;
  usageCompleteness?: AiUsageCompleteness;
  display?: AiResearchDisplayProjection;
}

export interface AiRunDetail extends AiRunRecord {
  toolCalls?: AiToolCall[];
}

export interface AiRunPage {
  items: AiRunRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AiToolCallsPage {
  items: AiToolCall[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type AiCapabilityState = 'available' | 'demo' | 'unconfigured' | 'error';

export interface AiCapability {
  provider: string;
  state: AiCapabilityState;
  models: string[];
  tools: string[];
  missing: string[];
  impact: string[];
}

export interface AiCapabilitiesResponse {
  canStart: boolean;
  providers: AiCapability[];
  checkedAt: string;
}

export interface AiRoutingSettings {
  researchDefault: { providerId: string; model: string } | null;
  revision: string;
  candidates: Array<{
    providerId: string;
    providerName: string;
    model: string;
    enabled: boolean;
    health: string;
    authMode: 'api_key' | 'none';
    priceConfigured: boolean;
  }>;
}

export interface StartResearchInput {
  question: string;
  context: AiResearchContext;
  templateId?: 'primary-risks' | 'recent-changes' | 'counter-evidence' | 'stress-scenario';
  retryOfRunId?: string;
  researchSettingsRevision?: string;
  retryConfirmation?: {
    contextConfirmed: true;
    acknowledgeUnknownOutcomeRisk: boolean;
  };
}

export interface AiResearchRetryPrefill {
  sourceRunId: string;
  question: string;
  context: AiResearchContext;
  templateId: StartResearchInput['templateId'] | null;
  sourceOutcome: 'failed' | 'unknown';
  contextState: 'valid' | 'missing' | 'forbidden';
  requiresUnknownOutcomeAcknowledgement: boolean;
}

/** Compatibility input for existing deterministic AI flows such as Journal review. */
export interface LegacyCreateAiRunInput {
  provider: string;
  model: string;
  promptVersion: string;
  context?: { scope: string; symbol?: string };
  modelMetadata?: unknown;
  question?: string;
  retryOfRunId?: string;
}

export type CreateAiRunInput = StartResearchInput | LegacyCreateAiRunInput;

export interface AiRunResult {
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
  status?: AiRunStatus;
  question?: string | null;
  context?: AiResearchContext | null;
}
