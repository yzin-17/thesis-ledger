export type PortfolioMode = 'actual' | 'shadow';

export type ToolPermission =
  | 'market:read'
  | 'portfolio:read'
  | 'risk:read'
  | 'journal:read'
  | 'financials:read'
  | 'news:read'
  | 'announcements:read'
  | 'backtest:run';

export type AiProviderHealth = 'unknown' | 'healthy' | 'degraded' | 'down';

export interface AiProviderMetadata {
  baseURL?: string;
  capabilities?: readonly string[];
  priority?: number;
  health?: AiProviderHealth;
  costPer1kInput?: number;
  costPer1kOutput?: number;
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
  complete(
    input: { model: string; messages: unknown[]; tools: string[] },
    signal: AbortSignal,
  ): Promise<{ content: unknown; inputTokens: number; outputTokens: number; cost: number }>;
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
