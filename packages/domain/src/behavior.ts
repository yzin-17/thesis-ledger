export interface CompletedTrade {
  symbol: string;
  entryAt: string;
  exitAt: string;
  pnl: number;
  plannedStop?: number;
  actualExit?: number;
  plannedHoldingDays?: number;
  entryPrice?: number;
  exitPrice?: number;
  plannedEntry?: number;
  plannedExit?: number;
  turnover?: number;
  peakWeight?: number;
  targetWeight?: number;
}

const daysBetween = (start: string, end: string) =>
  (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000;

export const behaviorMetrics = (trades: readonly CompletedTrade[]) => {
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossWin = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const holdingDays = trades.map((trade) => daysBetween(trade.entryAt, trade.exitAt));
  return {
    winRate: trades.length === 0 ? 0 : wins.length / trades.length,
    profitLossRatio: grossLoss === 0 ? null : grossWin / grossLoss,
    averageHoldingDays:
      holdingDays.length === 0 ? 0 : holdingDays.reduce((a, b) => a + b, 0) / holdingDays.length,
    missedStops: trades.filter(
      (trade) =>
        trade.plannedStop !== undefined &&
        trade.actualExit !== undefined &&
        trade.actualExit < trade.plannedStop,
    ).length,
  };
};

export const holdingPeriodMetrics = (trades: readonly CompletedTrade[]) => {
  const values = trades
    .map((trade) => daysBetween(trade.entryAt, trade.exitAt))
    .sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median =
    values.length === 0
      ? 0
      : values.length % 2 === 1
        ? values[middle]!
        : (values[middle - 1]! + values[middle]!) / 2;
  return {
    average:
      values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length,
    median,
  };
};

export const plannedVsActual = (trade: CompletedTrade) => ({
  entryDeviation:
    trade.plannedEntry === undefined || trade.entryPrice === undefined
      ? null
      : trade.entryPrice - trade.plannedEntry,
  entryDeviationRatio:
    trade.plannedEntry === undefined || trade.entryPrice === undefined || trade.plannedEntry === 0
      ? null
      : roundMoney(trade.entryPrice / trade.plannedEntry - 1),
  exitDeviation:
    trade.plannedExit === undefined || trade.exitPrice === undefined
      ? null
      : trade.exitPrice - trade.plannedExit,
  holdingDayDeviation:
    trade.plannedHoldingDays === undefined
      ? null
      : daysBetween(trade.entryAt, trade.exitAt) - trade.plannedHoldingDays,
});

export const tradingActivityMetrics = (trades: readonly CompletedTrade[]) => {
  if (trades.length === 0) return { tradeCount: 0, tradesPerWeek: 0, turnover: 0 };
  const starts = trades.map((trade) => new Date(trade.entryAt).getTime());
  const ends = trades.map((trade) => new Date(trade.exitAt).getTime());
  const spanDays = Math.max(1, (Math.max(...ends) - Math.min(...starts)) / 86_400_000);
  return {
    tradeCount: trades.length,
    tradesPerWeek: (trades.length / spanDays) * 7,
    turnover: trades.reduce((sum, trade) => sum + (trade.turnover ?? 0), 0),
  };
};

export const positionDeviation = (trade: CompletedTrade) => {
  if (trade.targetWeight === undefined || trade.peakWeight === undefined) return null;
  return {
    targetWeight: trade.targetWeight,
    peakWeight: trade.peakWeight,
    deviation: trade.peakWeight - trade.targetWeight,
    exceeded: trade.peakWeight > trade.targetWeight,
  };
};

export interface BehaviorEvidence {
  label:
    'missed-stop' | 'early-profit' | 'overtrading' | 'chasing' | 'anchoring' | 'disposition-effect';
  detected: boolean | null;
  evidence: Record<string, number | string>;
  reason?: string;
}

export const detectBehavior = (
  trade: CompletedTrade,
  context: {
    entryGapRatio?: number;
    recentTradeCount?: number;
    winnerHoldingDays?: number;
    loserHoldingDays?: number;
    anchoredPrice?: number;
    referencePrice?: number;
  },
): BehaviorEvidence[] => [
  {
    label: 'missed-stop',
    detected:
      trade.plannedStop === undefined || trade.actualExit === undefined
        ? null
        : trade.actualExit < trade.plannedStop,
    evidence: {
      ...(trade.plannedStop === undefined ? {} : { plannedStop: trade.plannedStop }),
      ...(trade.actualExit === undefined ? {} : { actualExit: trade.actualExit }),
    },
    ...(trade.plannedStop === undefined ? { reason: 'insufficient data' } : {}),
  },
  {
    label: 'early-profit',
    detected:
      trade.plannedExit === undefined || trade.actualExit === undefined
        ? null
        : trade.actualExit < trade.plannedExit,
    evidence: {
      ...(trade.plannedExit === undefined ? {} : { plannedExit: trade.plannedExit }),
      ...(trade.actualExit === undefined ? {} : { actualExit: trade.actualExit }),
    },
    ...(trade.plannedExit === undefined ? { reason: 'insufficient data' } : {}),
  },
  {
    label: 'overtrading',
    detected: context.recentTradeCount === undefined ? null : context.recentTradeCount > 10,
    evidence: {
      ...(context.recentTradeCount === undefined
        ? {}
        : { recentTradeCount: context.recentTradeCount }),
    },
    ...(context.recentTradeCount === undefined ? { reason: 'insufficient data' } : {}),
  },
  {
    label: 'chasing',
    detected: context.entryGapRatio === undefined ? null : context.entryGapRatio > 0.05,
    evidence: {
      ...(context.entryGapRatio === undefined ? {} : { entryGapRatio: context.entryGapRatio }),
    },
    ...(context.entryGapRatio === undefined ? { reason: 'insufficient data' } : {}),
  },
  {
    label: 'anchoring',
    detected:
      context.anchoredPrice === undefined || context.referencePrice === undefined
        ? null
        : Math.abs(context.anchoredPrice / context.referencePrice - 1) > 0.1,
    evidence: {
      ...(context.anchoredPrice === undefined ? {} : { anchoredPrice: context.anchoredPrice }),
      ...(context.referencePrice === undefined ? {} : { referencePrice: context.referencePrice }),
    },
    ...(context.anchoredPrice === undefined || context.referencePrice === undefined
      ? { reason: 'insufficient data' }
      : {}),
  },
  {
    label: 'disposition-effect',
    detected:
      context.winnerHoldingDays === undefined || context.loserHoldingDays === undefined
        ? null
        : context.loserHoldingDays > context.winnerHoldingDays,
    evidence: {
      ...(context.winnerHoldingDays === undefined
        ? {}
        : { winnerHoldingDays: context.winnerHoldingDays }),
      ...(context.loserHoldingDays === undefined
        ? {}
        : { loserHoldingDays: context.loserHoldingDays }),
    },
    ...(context.winnerHoldingDays === undefined || context.loserHoldingDays === undefined
      ? { reason: 'insufficient data' }
      : {}),
  },
];

export const extractShadowStrategy = (trades: readonly CompletedTrade[]) => ({
  kind: 'research-candidate' as const,
  sampleSize: trades.length,
  averageHoldingDays: behaviorMetrics(trades).averageHoldingDays,
  winRate: behaviorMetrics(trades).winRate,
  statement: `历史行为候选：平均持有 ${behaviorMetrics(trades).averageHoldingDays.toFixed(1)} 天，逐笔胜率 ${(behaviorMetrics(trades).winRate * 100).toFixed(1)}%`,
});

export const counterfactualStop = (trade: CompletedTrade, actualPnl: number, stopPnl: number) => ({
  actualPnl,
  counterfactualPnl: trade.plannedStop === undefined ? null : stopPnl,
  difference: trade.plannedStop === undefined ? null : stopPnl - actualPnl,
  assumption: '假设计划止损价可以按指定价格成交，未计滑点和流动性影响',
});

export interface RiskTriggerFact {
  triggeredAt: string;
  plannedStop: number;
  actualExitAt?: string;
  actualExitPrice?: number;
}

export const plannedVsActualStop = (fact: RiskTriggerFact, actualPnl?: number) => ({
  triggeredAt: fact.triggeredAt,
  plannedStop: fact.plannedStop,
  actualExitAt: fact.actualExitAt ?? null,
  delayDays:
    fact.actualExitAt === undefined ? null : daysBetween(fact.triggeredAt, fact.actualExitAt),
  actualExitPrice: fact.actualExitPrice ?? null,
  lossDifference: actualPnl === undefined || fact.actualExitPrice === undefined ? null : actualPnl,
  executed: fact.actualExitAt !== undefined,
});

export const counterfactualReplay = (input: {
  trades: readonly CompletedTrade[];
  enforceStop: boolean;
  stopPrice?: number;
}) => {
  const actualPnl = input.trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const stopPrice = input.stopPrice;
  const counterfactualPnl =
    !input.enforceStop || stopPrice === undefined
      ? null
      : input.trades.reduce(
          (sum, trade) =>
            sum + (trade.entryPrice === undefined ? trade.pnl : (stopPrice - trade.entryPrice) * 1),
          0,
        );
  return {
    actualPnl,
    counterfactualPnl,
    difference: counterfactualPnl === null ? null : counterfactualPnl - actualPnl,
    assumptions: {
      enforceStop: input.enforceStop,
      stopPrice: stopPrice ?? null,
      quantity: '按每笔 1 单位归一化，未计滑点和流动性影响',
    },
  };
};

export const reviewWindow = (input: {
  trades: readonly CompletedTrade[];
  start: string;
  end: string;
}) => {
  const trades = input.trades.filter(
    (trade) => trade.entryAt >= input.start && trade.exitAt <= input.end,
  );
  return {
    start: input.start,
    end: input.end,
    tradeCount: trades.length,
    behavior: behaviorMetrics(trades),
    activity: tradingActivityMetrics(trades),
    holding: holdingPeriodMetrics(trades),
  };
};
import { roundMoney } from '@thesis-ledger/shared';
