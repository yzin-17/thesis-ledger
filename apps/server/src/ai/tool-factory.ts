import type {
  AiTool,
  CoreToolAdapters,
  PortfolioMode,
  ResearchToolAdapters,
  ToolPermission,
} from './contracts.js';

const scopeToolInput = (input: unknown) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const value = input as Record<string, unknown>;
  return {
    ...value,
    mode: value.mode === 'shadow' ? 'shadow' : 'actual',
  };
};

const adapterTool = (
  name: string,
  permission: ToolPermission,
  execute: (input: unknown, signal: AbortSignal) => Promise<unknown>,
): AiTool => ({ name, permission, execute });

export const createCoreTools = (adapters: CoreToolAdapters): AiTool[] => {
  const definitions: Array<[keyof CoreToolAdapters, string, ToolPermission]> = [
    ['getPortfolio', 'getPortfolio', 'portfolio:read'],
    ['getPositions', 'getPositions', 'portfolio:read'],
    ['getQuote', 'getQuote', 'market:read'],
    ['getBars', 'getBars', 'market:read'],
    ['getIndicators', 'getIndicators', 'market:read'],
    ['getChipDistribution', 'getChipDistribution', 'market:read'],
    ['getRisk', 'getRisk', 'risk:read'],
  ];
  return definitions.flatMap(([key, name, permission]) => {
    const execute = adapters[key];
    return execute
      ? [adapterTool(name, permission, (input, signal) => execute(scopeToolInput(input), signal))]
      : [];
  });
};

export const createResearchTools = (adapters: ResearchToolAdapters): AiTool[] => {
  const tools: AiTool[] = [];
  const scopedInput = (
    input: unknown,
  ): {
    symbol?: string;
    accountId?: string;
    mode: PortfolioMode;
  } => {
    const value = input as { symbol?: string; accountId?: string; mode?: PortfolioMode };
    return {
      ...(value.symbol ? { symbol: value.symbol } : {}),
      ...(value.accountId ? { accountId: value.accountId } : {}),
      mode: value.mode === 'shadow' ? 'shadow' : 'actual',
    };
  };

  if (adapters.financials)
    tools.push(
      adapterTool('getFinancials', 'financials:read', (input, signal) => {
        const scoped = scopedInput(input);
        return adapters.financials!({ symbol: scoped.symbol ?? '', ...scoped }, signal);
      }),
    );
  if (adapters.news)
    tools.push(
      adapterTool('getNews', 'news:read', (input, signal) => {
        const scoped = scopedInput(input);
        return adapters.news!({ symbol: scoped.symbol ?? '', ...scoped }, signal);
      }),
    );
  if (adapters.announcements)
    tools.push(
      adapterTool('getAnnouncements', 'announcements:read', (input, signal) => {
        const scoped = scopedInput(input);
        return adapters.announcements!({ symbol: scoped.symbol ?? '', ...scoped }, signal);
      }),
    );
  if (adapters.journal)
    tools.push(
      adapterTool('getJournal', 'journal:read', (input, signal) =>
        adapters.journal!(scopedInput(input), signal),
      ),
    );
  if (adapters.riskHistory)
    tools.push(
      adapterTool('getRiskHistory', 'risk:read', (input, signal) =>
        adapters.riskHistory!(scopedInput(input), signal),
      ),
    );
  if (adapters.runBacktest)
    tools.push(adapterTool('runBacktest', 'backtest:run', adapters.runBacktest));
  return tools;
};
