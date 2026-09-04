import { cnTradingCalendar } from '@thesis-ledger/domain';

export interface AutomationPosition {
  symbol: string;
  quantity: number;
  marketValue?: number;
}

export interface AutomationEvent {
  symbol: string;
  kind: string;
  publishedAt?: string;
  availableAt?: string;
  provider?: string;
}

export const isTradingDay = (date: Date | string) => cnTradingCalendar.isTradingDay(date);

export const preMarketPositionEvents = (
  positions: readonly AutomationPosition[],
  events: readonly AutomationEvent[],
) => {
  const symbols = new Set(positions.map((position) => position.symbol));
  return events.filter((event) => symbols.has(event.symbol));
};

export const preMarketRiskPreview = (input: {
  asOf: string;
  contexts: readonly unknown[];
  scan: (contexts: readonly unknown[]) => unknown;
}) => ({
  asOf: input.asOf,
  dataTime: 'previous-close-or-latest-available',
  result: input.scan(input.contexts),
});

export const openingScan = (input: {
  asOf: string;
  quotes: readonly { symbol: string; price: number; previousClose: number }[];
}) => ({
  asOf: input.asOf,
  limitations: ['no_l2_data'],
  events: input.quotes
    .filter(
      (quote) =>
        quote.previousClose !== 0 && Math.abs(quote.price / quote.previousClose - 1) >= 0.095,
    )
    .map((quote) => ({
      symbol: quote.symbol,
      kind: 'opening-price-anomaly',
      change: quote.price / quote.previousClose - 1,
    })),
});

export const intradayRiskScan = <T>(input: {
  contexts: readonly T[];
  batchSize?: number;
  scan: (contexts: readonly T[]) => readonly unknown[];
}) => {
  const batchSize = Math.max(1, input.batchSize ?? 20);
  const results: unknown[] = [];
  for (let index = 0; index < input.contexts.length; index += batchSize)
    results.push(...input.scan(input.contexts.slice(index, index + batchSize)));
  return results;
};

export const dataHealthAlert = (input: {
  providerStates: readonly { provider: string; state: string; latencyMs?: number | null }[];
  qualityIssues: readonly { severity: string; status: string }[];
}) => ({
  alert:
    input.providerStates.some((item) => item.state === 'down') ||
    input.qualityIssues.some(
      (item) => item.status === 'open' && ['error', 'critical'].includes(item.severity),
    ),
  providers: input.providerStates,
  qualityIssues: input.qualityIssues,
});

export const dailyRiskSummary = (
  events: readonly { severity: string; triggered: boolean; status?: string }[],
) => ({
  triggered: events.filter((event) => event.triggered).length,
  active: events.filter((event) => event.triggered && event.status !== 'resolved').length,
  recovered: events.filter((event) => event.status === 'resolved').length,
  bySeverity: events.reduce<Record<string, number>>((result, event) => {
    if (event.triggered) result[event.severity] = (result[event.severity] ?? 0) + 1;
    return result;
  }, {}),
});

export const dailyDigest = (input: {
  date: string;
  events: readonly AutomationEvent[];
  risk: ReturnType<typeof dailyRiskSummary>;
  attention: readonly string[];
}) => ({
  date: input.date,
  eventCount: input.events.length,
  risk: input.risk,
  attention: [...input.attention],
});

export const investmentDailyReport = (input: {
  date: string;
  portfolio: { totalValue: number; dailyReturn?: number; cumulativeReturn?: number };
  benchmark?: { return: number };
  risk: ReturnType<typeof dailyRiskSummary>;
  events: readonly AutomationEvent[];
  aiSummary?: { conclusion: string; citations: readonly unknown[] };
}) => ({
  ...input,
  excessReturn:
    input.portfolio.dailyReturn === undefined || input.benchmark === undefined
      ? null
      : input.portfolio.dailyReturn - input.benchmark.return,
  aiSummary: input.aiSummary ? input.aiSummary : { conclusion: '暂无 AI 总结', citations: [] },
});

export const weeklyPerformanceReview = (input: {
  start: string;
  end: string;
  snapshots: readonly { value: number; drawdown?: number }[];
  trades: readonly unknown[];
}) => ({
  start: input.start,
  end: input.end,
  snapshotCount: input.snapshots.length,
  tradeCount: input.trades.length,
  maxDrawdown: Math.min(...input.snapshots.map((snapshot) => snapshot.drawdown ?? 0), 0),
});

export const weeklyStrategyReview = (input: {
  start: string;
  end: string;
  strategySignals: readonly unknown[];
  backtestChanges: readonly unknown[];
  executionLinks: readonly unknown[];
}) => ({
  start: input.start,
  end: input.end,
  strategySignals: input.strategySignals,
  backtestChanges: input.backtestChanges,
  executionLinks: input.executionLinks,
  recommendationTarget: 'research/decision-log',
});
