import {
  compareBenchmark,
  periodMetrics,
  quantStatsAnalytics,
  tradeMetrics,
  type ReturnPoint,
} from './backtest-analytics.js';
import { simulateAStockExecution, type ExecutionConstraint } from './backtest.js';

export interface BacktestBar {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  previousClose?: number;
  suspended?: boolean;
  availableAt?: string;
  assetType?: 'stock' | 'etf' | 'fund' | 'index' | 'convertible';
  dividend?: number;
  splitFactor?: number;
}

export interface SignalExpression {
  indicator?: string;
  operator?: string;
  value?: number | string;
  all?: SignalExpression[];
  any?: SignalExpression[];
  not?: SignalExpression;
}

export interface BacktestStrategy {
  universe: {
    symbols: string[];
    asOf: string;
    assetTypes?: Array<'stock' | 'etf' | 'fund' | 'index' | 'convertible'>;
    filterRef?: string;
    validFrom?: string;
    validTo?: string;
  };
  entrySignals: Array<{ indicator: string; operator: string; value: number | string }>;
  exitSignals: Array<{ indicator: string; operator: string; value: number | string }>;
  entryCondition?: SignalExpression;
  exitCondition?: SignalExpression;
  stopLoss: { type: 'fixed' | 'trailing' | 'atr'; value: number };
  takeProfit?: { type: 'fixed' | 'trailing'; value: number };
  sizing: { type: 'fixed' | 'weight' | 'risk'; value: number };
  execution: { price: 'open' | 'close' | 'nextOpen'; tPlusOne: boolean; lotSize: number };
  cost: {
    commissionRate: number;
    minimumCommission: number;
    stampDutyRate: number;
    slippageRate: number;
  };
  riskConstraints?: Array<{ kind: string; threshold: number }>;
  benchmark?: string;
}

export interface BacktestTrade {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fees: number;
  commission?: number;
  stampDuty?: number;
  slippageCost?: number;
  date: string;
  reason: 'signal' | 'stop' | 'takeprofit' | 'end';
}

export interface RejectedOrder {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  date: string;
  reason: string;
}

export interface BacktestMetadata {
  strategyVersionId?: string;
  strategyVersion?: number;
  schemaVersion?: number;
  dataVersion?: string;
  provider?: string;
  engineVersion: string;
  parameters?: Record<string, unknown>;
  costModel?: BacktestStrategy['cost'];
}

export interface BacktestResult {
  engineVersion: string;
  dataAsOf: string;
  initialCash: number;
  finalValue: number;
  trades: BacktestTrade[];
  equityCurve: ReturnPoint[];
  returns: number[];
  metrics: ReturnType<typeof periodMetrics> & ReturnType<typeof tradeMetrics>;
  analytics: ReturnType<typeof quantStatsAnalytics>;
  inSample?: ReturnType<typeof periodMetrics>;
  outOfSample?: ReturnType<typeof periodMetrics>;
  warnings: string[];
  limitations: string[];
  rejectedOrders: RejectedOrder[];
  completeness: {
    complete: boolean;
    missingSymbols: string[];
    missingDates: Array<{ symbol: string; dates: string[] }>;
  };
  benchmark?: ReturnType<typeof compareBenchmark>;
  metadata: BacktestMetadata;
}

type Signal = BacktestStrategy['entrySignals'][number];
type Holding = {
  quantity: number;
  entryPrice: number;
  entryFees: number;
  boughtAt: string;
};
type PendingOrder = {
  symbol: string;
  side: 'buy' | 'sell';
  reason: BacktestTrade['reason'];
};
type TradeMetricRecord = { pnl: number; holdingDays: number; turnover: number };

const signalValue = (bar: BacktestBar, indicator: string) => {
  if (indicator === 'close' || indicator === 'price') return bar.close;
  if (indicator === 'open') return bar.open;
  if (indicator === 'high') return bar.high;
  if (indicator === 'low') return bar.low;
  if (indicator === 'volume') return bar.volume ?? 0;
  return undefined;
};

const matchesSignal = (bar: BacktestBar, previousBar: BacktestBar | undefined, signal: Signal) => {
  const left = signalValue(bar, signal.indicator);
  const right = typeof signal.value === 'number' ? signal.value : signalValue(bar, signal.value);
  if (left === undefined || right === undefined) return false;
  if (signal.operator === 'gt') return left > right;
  if (signal.operator === 'gte') return left >= right;
  if (signal.operator === 'lt') return left < right;
  if (signal.operator === 'lte') return left <= right;
  if (signal.operator === 'crossesAbove' || signal.operator === 'crossesBelow') {
    if (!previousBar) return false;
    const previousLeft = signalValue(previousBar, signal.indicator);
    const previousRight =
      typeof signal.value === 'number' ? signal.value : signalValue(previousBar, signal.value);
    if (previousLeft === undefined || previousRight === undefined) return false;
    return signal.operator === 'crossesAbove'
      ? previousLeft <= previousRight && left > right
      : previousLeft >= previousRight && left < right;
  }
  return false;
};

const matchesExpression = (
  bar: BacktestBar,
  previousBar: BacktestBar | undefined,
  expression: SignalExpression,
): boolean => {
  if (expression.all)
    return expression.all.every((item) => matchesExpression(bar, previousBar, item));
  if (expression.any)
    return expression.any.some((item) => matchesExpression(bar, previousBar, item));
  if (expression.not) return !matchesExpression(bar, previousBar, expression.not);
  if (expression.indicator && expression.operator && expression.value !== undefined) {
    return matchesSignal(bar, previousBar, {
      indicator: expression.indicator,
      operator: expression.operator,
      value: expression.value,
    });
  }
  return false;
};

const matchesSignals = (
  bar: BacktestBar,
  previousBar: BacktestBar | undefined,
  signals: BacktestStrategy['entrySignals'],
  expression?: SignalExpression,
) =>
  expression
    ? matchesExpression(bar, previousBar, expression)
    : signals.every((signal) => matchesSignal(bar, previousBar, signal));

const constraintFor = (strategy: BacktestStrategy): ExecutionConstraint => ({
  tPlusOne: strategy.execution.tPlusOne,
  lotSize: strategy.execution.lotSize,
  commissionRate: strategy.cost.commissionRate,
  minimumCommission: strategy.cost.minimumCommission,
  stampDutyRate: strategy.cost.stampDutyRate,
  slippageRate: strategy.cost.slippageRate,
});

const calendarDaysBetween = (start: string, end: string) => {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(startMs) && Number.isFinite(endMs)
    ? Math.max(0, Math.round((endMs - startMs) / 86_400_000))
    : 0;
};

export const checkUniverseCompleteness = (
  bars: readonly BacktestBar[],
  symbols: readonly string[],
  start: string,
  end: string,
) => {
  const bySymbol = new Map<string, Set<string>>();
  const allDates = new Set<string>();
  for (const bar of bars) {
    if (bar.date < start || bar.date > end) continue;
    allDates.add(bar.date);
    const dates = bySymbol.get(bar.symbol) ?? new Set<string>();
    dates.add(bar.date);
    bySymbol.set(bar.symbol, dates);
  }
  const missingSymbols = symbols.filter((symbol) => !bySymbol.has(symbol));
  const expectedDates = [...allDates].sort();
  const missingDates = symbols.flatMap((symbol) => {
    const dates = bySymbol.get(symbol);
    return dates
      ? [{ symbol, dates: expectedDates.filter((date) => !dates.has(date)) }].filter(
          (entry) => entry.dates.length > 0,
        )
      : [];
  });
  return {
    complete: missingSymbols.length === 0 && missingDates.length === 0,
    missingSymbols,
    missingDates,
  };
};

export const runBacktest = (input: {
  strategy: BacktestStrategy;
  bars: readonly BacktestBar[];
  start: string;
  end: string;
  dataAsOf: string;
  initialCash: number;
  inSampleEnd?: string;
  engineVersion?: string;
  benchmarkBars?: readonly BacktestBar[];
  metadata?: Omit<BacktestMetadata, 'engineVersion'>;
}): BacktestResult => {
  const strategy = input.strategy;
  const bars = input.bars
    .filter(
      (bar) =>
        strategy.universe.symbols.includes(bar.symbol) &&
        bar.date >= input.start &&
        bar.date <= input.end &&
        (!bar.availableAt || bar.availableAt <= input.dataAsOf),
    )
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.symbol.localeCompare(right.symbol),
    );
  const completeness = checkUniverseCompleteness(
    bars,
    strategy.universe.symbols,
    input.start,
    input.end,
  );
  const warnings = completeness.complete
    ? []
    : [`Universe 缺少标的: ${completeness.missingSymbols.join(',')}`];
  const limitations = ['survivorship_coverage_unknown'];
  const rejectedOrders: RejectedOrder[] = [];
  const constraint = constraintFor(strategy);
  const holdings = new Map<string, Holding>();
  const trades: BacktestTrade[] = [];
  const completedTrades: TradeMetricRecord[] = [];
  const equityCurve: ReturnPoint[] = [];
  const previousBarBySymbol = new Map<string, BacktestBar>();
  const latestCloseBySymbol = new Map<string, number>();
  const pendingOrders = new Map<string, PendingOrder>();
  const barsByDate = new Map<string, BacktestBar[]>();
  for (const bar of bars) {
    const dailyBars = barsByDate.get(bar.date) ?? [];
    dailyBars.push(bar);
    barsByDate.set(bar.date, dailyBars);
  }

  let cash = input.initialCash;
  let previousValue = input.initialCash;

  const portfolioValue = (prices: ReadonlyMap<string, number>) =>
    cash +
    [...holdings.entries()].reduce(
      (sum, [symbol, holding]) =>
        sum + holding.quantity * (prices.get(symbol) ?? latestCloseBySymbol.get(symbol) ?? holding.entryPrice),
      0,
    );

  const buy = (bar: BacktestBar, price: number, valuationPrices: ReadonlyMap<string, number>) => {
    if (holdings.has(bar.symbol)) return;
    const currentValue = portfolioValue(valuationPrices);
    const budget =
      strategy.sizing.type === 'fixed'
        ? strategy.sizing.value
        : strategy.sizing.type === 'weight'
          ? cash * strategy.sizing.value
          : cash * Math.min(strategy.sizing.value, 1);
    const decision = simulateAStockExecution(
      {
        side: 'buy',
        quantity: budget / Math.max(price, 0.000001),
        price,
        previousClose: bar.previousClose ?? price,
        tradingDate: bar.date,
        ...(bar.suspended === undefined ? {} : { suspended: bar.suspended }),
      },
      constraint,
    );
    const required = decision.quantity * decision.fillPrice + decision.fees;
    const maxPositionWeight = strategy.riskConstraints?.find(
      (item) => item.kind === 'maxPositionWeight',
    )?.threshold;
    const cashFloor = strategy.riskConstraints?.find((item) => item.kind === 'cashFloor')?.threshold;
    const positionValue = decision.quantity * decision.fillPrice;
    const violatesWeight =
      maxPositionWeight !== undefined &&
      currentValue > 0 &&
      positionValue / currentValue > maxPositionWeight;
    const violatesCashFloor =
      cashFloor !== undefined &&
      cash - required < (cashFloor <= 1 ? input.initialCash * cashFloor : cashFloor);
    if (decision.accepted && required <= cash && !violatesWeight && !violatesCashFloor) {
      cash -= required;
      holdings.set(bar.symbol, {
        quantity: decision.quantity,
        entryPrice: decision.fillPrice,
        entryFees: decision.fees,
        boughtAt: bar.date,
      });
      trades.push({
        symbol: bar.symbol,
        side: 'buy',
        quantity: decision.quantity,
        price: decision.fillPrice,
        fees: decision.fees,
        ...(decision.commission === undefined ? {} : { commission: decision.commission }),
        ...(decision.stampDuty === undefined ? {} : { stampDuty: decision.stampDuty }),
        ...(decision.slippageCost === undefined ? {} : { slippageCost: decision.slippageCost }),
        date: bar.date,
        reason: 'signal',
      });
      return;
    }
    rejectedOrders.push({
      symbol: bar.symbol,
      side: 'buy',
      quantity: decision.quantity,
      price,
      date: bar.date,
      reason: violatesWeight
        ? '超过单标的仓位上限'
        : violatesCashFloor
          ? '低于现金下限'
          : (decision.reason ?? (required > cash ? '资金不足' : '订单被拒绝')),
    });
  };

  const sell = (bar: BacktestBar, price: number, reason: BacktestTrade['reason']) => {
    const holding = holdings.get(bar.symbol);
    if (!holding) return;
    const decision = simulateAStockExecution(
      {
        side: 'sell',
        quantity: holding.quantity,
        price,
        previousClose: bar.previousClose ?? price,
        boughtAt: holding.boughtAt,
        tradingDate: bar.date,
        ...(bar.suspended === undefined ? {} : { suspended: bar.suspended }),
      },
      constraint,
    );
    if (!decision.accepted) {
      rejectedOrders.push({
        symbol: bar.symbol,
        side: 'sell',
        quantity: holding.quantity,
        price,
        date: bar.date,
        reason: decision.reason ?? '订单被拒绝',
      });
      return;
    }
    cash += decision.quantity * decision.fillPrice - decision.fees;
    const soldFraction = decision.quantity / holding.quantity;
    const allocatedEntryFees = holding.entryFees * soldFraction;
    completedTrades.push({
      pnl:
        decision.quantity * decision.fillPrice -
        decision.fees -
        decision.quantity * holding.entryPrice -
        allocatedEntryFees,
      holdingDays: calendarDaysBetween(holding.boughtAt, bar.date),
      turnover: decision.quantity * decision.fillPrice,
    });
    trades.push({
      symbol: bar.symbol,
      side: 'sell',
      quantity: decision.quantity,
      price: decision.fillPrice,
      fees: decision.fees,
      ...(decision.commission === undefined ? {} : { commission: decision.commission }),
      ...(decision.stampDuty === undefined ? {} : { stampDuty: decision.stampDuty }),
      ...(decision.slippageCost === undefined ? {} : { slippageCost: decision.slippageCost }),
      date: bar.date,
      reason,
    });
    const remaining = holding.quantity - decision.quantity;
    if (remaining <= 1e-8) holdings.delete(bar.symbol);
    else {
      holding.quantity = remaining;
      holding.entryFees -= allocatedEntryFees;
    }
  };

  for (const [date, dailyBars] of barsByDate) {
    const valuationPrices = new Map(latestCloseBySymbol);
    for (const bar of dailyBars) {
      valuationPrices.set(
        bar.symbol,
        strategy.execution.price === 'close' ? bar.close : bar.open,
      );
    }

    for (const bar of dailyBars) {
      const holding = holdings.get(bar.symbol);
      if (!holding) continue;
      if (bar.splitFactor && bar.splitFactor > 0 && bar.splitFactor !== 1) {
        holding.quantity *= bar.splitFactor;
        holding.entryPrice /= bar.splitFactor;
      }
      if (bar.dividend && bar.dividend > 0) cash += holding.quantity * bar.dividend;
    }

    if (strategy.execution.price === 'nextOpen') {
      for (const bar of dailyBars) {
        const pending = pendingOrders.get(bar.symbol);
        if (!pending || bar.suspended) continue;
        if (pending.side === 'buy') buy(bar, bar.open, valuationPrices);
        else sell(bar, bar.open, pending.reason);
        pendingOrders.delete(bar.symbol);
      }
    }

    for (const bar of dailyBars) {
      const previousBar = previousBarBySymbol.get(bar.symbol);
      const holding = holdings.get(bar.symbol);
      const decisionPrice = strategy.execution.price === 'open' ? bar.open : bar.close;
      if (holding) {
        let reason: BacktestTrade['reason'] | null = null;
        if (
          strategy.stopLoss.type === 'fixed' &&
          decisionPrice <= holding.entryPrice * (1 - strategy.stopLoss.value)
        )
          reason = 'stop';
        if (
          strategy.takeProfit?.type === 'fixed' &&
          decisionPrice >= holding.entryPrice * (1 + strategy.takeProfit.value)
        )
          reason = 'takeprofit';
        if (matchesSignals(bar, previousBar, strategy.exitSignals, strategy.exitCondition))
          reason = 'signal';
        if (bar.date === input.end && reason === null) reason = 'end';
        if (reason) {
          if (strategy.execution.price === 'nextOpen') {
            if (!pendingOrders.has(bar.symbol))
              pendingOrders.set(bar.symbol, { symbol: bar.symbol, side: 'sell', reason });
          } else {
            sell(bar, decisionPrice, reason);
          }
        }
      } else if (
        matchesSignals(bar, previousBar, strategy.entrySignals, strategy.entryCondition) &&
        !bar.suspended
      ) {
        if (strategy.execution.price === 'nextOpen') {
          if (!pendingOrders.has(bar.symbol))
            pendingOrders.set(bar.symbol, { symbol: bar.symbol, side: 'buy', reason: 'signal' });
        } else {
          buy(bar, decisionPrice, valuationPrices);
        }
      }
      previousBarBySymbol.set(bar.symbol, bar);
    }

    for (const bar of dailyBars) latestCloseBySymbol.set(bar.symbol, bar.close);
    const value = portfolioValue(latestCloseBySymbol);
    equityCurve.push({ date, value });
    previousValue = value;
  }

  const returns = equityCurve.map((point, index) =>
    index === 0
      ? point.value / input.initialCash - 1
      : point.value / equityCurve[index - 1]!.value - 1,
  );
  const metrics = {
    ...periodMetrics(returns),
    ...tradeMetrics(completedTrades),
  };
  const result: BacktestResult = {
    engineVersion: input.engineVersion ?? 'thesis-ledger-engine-v1',
    dataAsOf: input.dataAsOf,
    initialCash: input.initialCash,
    finalValue: previousValue,
    trades,
    equityCurve,
    returns,
    metrics,
    analytics: quantStatsAnalytics(returns),
    warnings,
    limitations,
    rejectedOrders,
    completeness,
    metadata: {
      engineVersion: input.engineVersion ?? 'thesis-ledger-engine-v1',
      ...(input.metadata ?? {}),
      costModel: input.metadata?.costModel ?? strategy.cost,
    },
  };
  if (input.inSampleEnd) {
    const split = equityCurve.reduce<{ inSample: ReturnPoint[]; outOfSample: ReturnPoint[] }>(
      (sample, point) => {
        (point.date <= input.inSampleEnd! ? sample.inSample : sample.outOfSample).push(point);
        return sample;
      },
      { inSample: [], outOfSample: [] },
    );
    result.inSample = periodMetrics(
      split.inSample.map((point, index) =>
        index === 0
          ? point.value / input.initialCash - 1
          : point.value / split.inSample[index - 1]!.value - 1,
      ),
    );
    result.outOfSample = periodMetrics(
      split.outOfSample.map((point, index) =>
        index === 0 ? 0 : point.value / split.outOfSample[index - 1]!.value - 1,
      ),
    );
  }
  if (input.benchmarkBars?.length) {
    const benchmark = input.benchmarkBars.filter(
      (bar) => bar.date >= input.start && bar.date <= input.end,
    );
    if (benchmark.length < 2) warnings.push('benchmark 数据不足');
    else {
      const benchmarkReturns = benchmark.slice(1).map((bar, index) => {
        const previous = benchmark[index]?.close ?? bar.close;
        return previous === 0 ? 0 : bar.close / previous - 1;
      });
      result.benchmark = compareBenchmark(
        returns.slice(1, benchmarkReturns.length + 1),
        benchmarkReturns,
      );
    }
  }
  return result;
};
