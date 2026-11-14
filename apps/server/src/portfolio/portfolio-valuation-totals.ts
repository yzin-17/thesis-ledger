import { roundMoney } from '@thesis-ledger/shared';
type ConvertedAmount = { complete: boolean; knownValue: number };
export function portfolioPnlTotals(input: {
  totalPnl: number;
  unrealizedComplete: boolean;
  costAggregate: ConvertedAmount;
  hasRealizedFacts: boolean;
  realizedPnlAggregate: ConvertedAmount;
  realizedCostAggregate: ConvertedAmount;
}) {
  const {
    totalPnl,
    unrealizedComplete,
    costAggregate,
    hasRealizedFacts,
    realizedPnlAggregate,
    realizedCostAggregate,
  } = input;
  const unrealizedPnl = unrealizedComplete ? totalPnl : null;
  const unrealizedCost = costAggregate.complete ? roundMoney(costAggregate.knownValue) : null;
  const realizedComplete =
    hasRealizedFacts && realizedPnlAggregate.complete && realizedCostAggregate.complete;
  const realizedPnl = realizedComplete ? roundMoney(realizedPnlAggregate.knownValue) : null;
  const realizedCost = realizedComplete ? roundMoney(realizedCostAggregate.knownValue) : null;
  const realizedPnlRatio = pnlRatio(realizedPnl, realizedCost);
  const cumulativePnl =
    unrealizedPnl !== null && realizedPnl !== null ? roundMoney(unrealizedPnl + realizedPnl) : null;
  const cumulativeCost =
    unrealizedCost !== null && realizedCost !== null
      ? roundMoney(unrealizedCost + realizedCost)
      : null;
  const cumulativePnlRatio = pnlRatio(cumulativePnl, cumulativeCost);

  const unrealizedPnlRatio = pnlRatio(unrealizedPnl, unrealizedCost);
  return {
    unrealizedPnl,
    unrealizedPnlRatio,
    realizedPnl,
    realizedPnlRatio,
    cumulativePnl,
    cumulativePnlRatio,
  };
}

function pnlRatio(pnl: number | null, cost: number | null) {
  return pnl !== null && cost !== null && cost > 0 ? pnl / cost : null;
}
