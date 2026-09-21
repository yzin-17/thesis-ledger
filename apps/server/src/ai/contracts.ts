import type { AiAdapter, AiChatImplementation, AiUpstreamFormat } from '@thesis-ledger/schemas';
import type {
  AiProviderCapabilityRevocation,
  AiProviderExecutionRouteInput,
} from './ai-provider.contracts.js';
import type { AiCompatibilityExtensionProfile } from './ai-provider-upstream.js';

export type PortfolioMode = 'actual' | 'shadow';

export type ToolPermission =
  | 'market:read'
  | 'portfolio:read'
  | 'strategy:read'
  | 'risk:read'
  | 'journal:read'
  | 'financials:read'
  | 'news:read'
  | 'announcements:read'
  | 'backtest:run';

export type AiProviderHealth = 'unknown' | 'healthy' | 'degraded' | 'down';

export type AiReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type AiProviderModelReasoningMetadata = {
  supportedEfforts?: readonly AiReasoningEffort[] | null | undefined;
  defaultEffort?: AiReasoningEffort | undefined;
  mandatory?: boolean | undefined;
};

export interface AiProviderMetadata {
  baseURL?: string;
  timeoutMs?: number;
  capabilities?: readonly string[];
  priority?: number;
  health?: AiProviderHealth;
  source?: 'database' | 'environment';
  costPer1kInput?: number;
  costPer1kOutput?: number;
  costCurrency?: string;
  pricingVersion?: string;
  modelReasoning?: Readonly<Record<string, AiProviderModelReasoningMetadata>>;
  upstreamFormat?: AiUpstreamFormat;
  chatImplementation?: AiChatImplementation;
  compatibilityExtensionProfile?: AiCompatibilityExtensionProfile;
  adapter?: AiAdapter;
  executionRoutes?: readonly AiProviderExecutionRouteInput[];
  capabilityRevocations?: readonly AiProviderCapabilityRevocation[];
  credentialFingerprint?: string;
}

export interface AiTool {
  readonly name: string;
  readonly permission: ToolPermission;
  readonly description?: string;
  execute(input: unknown, signal: AbortSignal): Promise<unknown>;
}

export interface AiProvider {
  readonly id: string;
  readonly models: readonly string[];
  readonly metadata?: AiProviderMetadata;
  sdkRuntime?(): { baseURL: string; apiKey: string; timeoutMs: number };
  /** 仅供显式进程内 fixture 使用；远程业务生成统一走 AiSdkGenerationAdapter。 */
  complete?: (
    input: {
      model: string;
      messages: unknown[];
      tools: string[];
      maxOutputTokens?: number;
      reasoningEffort?: AiReasoningEffort;
    },
    signal: AbortSignal,
  ) => Promise<{
    content: unknown;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    costKnown?: boolean;
    costCurrency?: string;
    pricingVersion?: string;
    actualModel?: string;
  }>;
}

export interface PromptTemplate {
  name: string;
  version: string;
  template: string;
  changedAt: string;
}

export interface ResearchSource {
  sourceId: string;
  provider: string;
  publishedAt?: string;
  availableAt?: string;
  marketTime?: string;
  fetchedAt: string;
}

export interface ResearchToolAdapters {
  financials?: (
    input: { symbol: string; accountId?: string; mode?: PortfolioMode },
    signal: AbortSignal,
  ) => Promise<unknown>;
  news?: (
    input: { symbol: string; accountId?: string; mode?: PortfolioMode },
    signal: AbortSignal,
  ) => Promise<unknown>;
  announcements?: (
    input: { symbol: string; accountId?: string; mode?: PortfolioMode },
    signal: AbortSignal,
  ) => Promise<unknown>;
  journal?: (
    input: { symbol?: string; accountId?: string; mode?: PortfolioMode },
    signal: AbortSignal,
  ) => Promise<unknown>;
  riskHistory?: (
    input: { symbol?: string; accountId?: string; mode?: PortfolioMode },
    signal: AbortSignal,
  ) => Promise<unknown>;
  runBacktest?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
}

export interface CoreToolAdapters {
  getPortfolio?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
  getPositions?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
  getQuote?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
  getBars?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
  getIndicators?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
  getChipDistribution?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
  getRisk?: (input: unknown, signal: AbortSignal) => Promise<unknown>;
}
