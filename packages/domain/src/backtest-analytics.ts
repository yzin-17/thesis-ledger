export interface ReturnPoint {
  date: string;
  value: number;
}

export interface TradeMetricInput {
  pnl: number;
  holdingDays: number;
  turnover: number;
}

export const splitSample = <T extends { date: string }>(
  data: readonly T[],
  inSampleEnd: string,
) => ({
  inSample: data.filter((item) => item.date <= inSampleEnd),
  outOfSample: data.filter((item) => item.date > inSampleEnd),
});

export const walkForwardWindows = (
  dates: readonly string[],
  trainSize: number,
  testSize: number,
) => {
  const windows: Array<{ train: string[]; test: string[] }> = [];
  for (let start = 0; start + trainSize + testSize <= dates.length; start += testSize) {
    windows.push({
      train: dates.slice(start, start + trainSize),
      test: dates.slice(start + trainSize, start + trainSize + testSize),
    });
  }
  return windows;
};

export const parameterGrid = (parameters: Record<string, readonly unknown[]>) => {
  let experiments: Array<Record<string, unknown>> = [{}];
  for (const [key, values] of Object.entries(parameters)) {
    experiments = experiments.flatMap((experiment) =>
      values.map((value) => ({ ...experiment, [key]: value })),
    );
  }
  return experiments;
};

export const periodMetrics = (returns: readonly number[]) => {
  if (returns.length === 0) return { cumulativeReturn: 0, volatility: 0, maxDrawdown: 0 };
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const value of returns) {
    equity *= 1 + value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1);
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(returns.length - 1, 1);
  return {
    cumulativeReturn: equity - 1,
    volatility: Math.sqrt(variance * 252),
    maxDrawdown,
  };
};

/**
 * Period-based analytics kept separate from trade metrics.  The implementation
 * mirrors the small, deterministic subset that a QuantStats worker needs for
 * the local-first path; a remote worker can replace it without changing the
 * result contract.
 */
export const quantStatsAnalytics = (returns: readonly number[], periodsPerYear = 252) => {
  if (returns.length === 0) {
    return { sharpe: 0, sortino: 0, calmar: 0, annualizedReturn: 0 };
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(returns.length - 1, 1);
  const downside =
    returns.reduce((sum, value) => sum + Math.min(value, 0) ** 2, 0) /
    Math.max(returns.length - 1, 1);
  const cumulative = returns.reduce((equity, value) => equity * (1 + value), 1) - 1;
  const annualizedReturn = (1 + cumulative) ** (periodsPerYear / returns.length) - 1;
  const maxDrawdown = periodMetrics(returns).maxDrawdown;
  return {
    sharpe: variance === 0 ? 0 : (mean / Math.sqrt(variance)) * Math.sqrt(periodsPerYear),
    sortino: downside === 0 ? 0 : (mean / Math.sqrt(downside)) * Math.sqrt(periodsPerYear),
    calmar: maxDrawdown === 0 ? 0 : annualizedReturn / Math.abs(maxDrawdown),
    annualizedReturn,
  };
};

export const tradeMetrics = (trades: readonly TradeMetricInput[]) => {
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  return {
    tradeCount: trades.length,
    tradeWinRate: trades.length === 0 ? 0 : wins.length / trades.length,
    profitLossRatio: grossLoss === 0 ? null : grossProfit / grossLoss,
    averageHoldingDays:
      trades.length === 0
        ? 0
        : trades.reduce((sum, trade) => sum + trade.holdingDays, 0) / trades.length,
    turnover: trades.reduce((sum, trade) => sum + trade.turnover, 0),
  };
};

export const compareBenchmark = (strategy: readonly number[], benchmark: readonly number[]) => {
  if (strategy.length !== benchmark.length) throw new Error('策略与基准序列长度不同');
  const strategyMetrics = periodMetrics(strategy);
  const benchmarkMetrics = periodMetrics(benchmark);
  return {
    strategyReturn: strategyMetrics.cumulativeReturn,
    benchmarkReturn: benchmarkMetrics.cumulativeReturn,
    excessReturn: strategyMetrics.cumulativeReturn - benchmarkMetrics.cumulativeReturn,
  };
};

export const monteCarloTradePaths = (
  returns: readonly number[],
  paths: number,
  random: () => number,
) =>
  Array.from({ length: paths }, () => {
    let equity = 1;
    for (let index = 0; index < returns.length; index += 1) {
      const sample =
        returns[Math.min(Math.floor(random() * returns.length), returns.length - 1)] ?? 0;
      equity *= 1 + sample;
    }
    return equity - 1;
  });

export const checkPointInTime = <T extends { availableAt: string }>(
  records: readonly T[],
  decisionAt: string,
) => records.every((record) => record.availableAt <= decisionAt);
