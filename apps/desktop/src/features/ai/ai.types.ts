export type AiResearchScope = 'portfolio' | 'account' | 'position' | 'strategy';

export type AiRunStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | (string & {});

export type AiRunFilterStatus = 'all' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface AiResearchContext {
  scope: AiResearchScope;
  portfolioId?: string;
  accountId?: string;
  symbol?: string;
  strategyVersionId?: string;
}

export interface AiCitation {
  toolCallId?: string;
  tool: string;
  sourceId: string;
  provider: string;
  observedAt: string;
  marketTime?: string;
  availableAt?: string;
  fetchedAt?: string;
}

export interface AiEvidence {
  claim: string;
  citations: AiCitation[];
}

export interface AiResearchResult {
  version: 1;
  provider: string;
  symbol?: string;
  score?: number;
  conclusion: string;
  evidence: AiEvidence[];
  risks: string[];
  unknowns: string[];
  signals: string[];
  disclaimer: string;
  context?: AiResearchContext;
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

export interface StartResearchInput {
  question: string;
  context: AiResearchContext;
  templateId?: 'primary-risks' | 'recent-changes' | 'counter-evidence' | 'stress-scenario';
  retryOfRunId?: string;
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
