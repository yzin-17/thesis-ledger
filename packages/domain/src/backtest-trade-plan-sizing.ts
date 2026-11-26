import { DecimalValue as D } from './decimal.js';
import {
  computeSizing,
  floorLotUnits,
  type SizingInput,
  type SizingResult,
} from './backtest-sizing.js';
import { isAvailableForDecisionAt } from './backtest-observation-clock.js';
import type { BacktestTradePlan, TradePlanAction } from './backtest-trade-plan-contract.js';

function budgetQuantity(
  plan: BacktestTradePlan,
  action: TradePlanAction,
  input: SizingInput,
): { quantity: D; facts: string[] } | SizingResult {
  const fraction = action.maxEquityFraction ?? plan.riskBudget!.maxEquityFraction;
  const capInput = {
    ...input,
    currentQuantity: '0',
    rule: { type: 'percentOfEquity' as const, percent: fraction },
  };
  delete capInput.priceResearchReference;
  const cap = computeSizing(capInput);
  if (cap.status !== 'available') return cap;
  const price = input.price;
  if (
    !price ||
    !isAvailableForDecisionAt(price, input.evaluationAt) ||
    !D.from(price.value).isPositive()
  )
    return {
      status: 'unavailable',
      reasonCode: 'PRICE_UNAVAILABLE',
      reason: '交易计划缺少同口径可见价格',
      inputFacts: [],
    };
  if (action.kind === 'add') {
    const target = D.from(action.quantity!),
      room = D.from(cap.normalizedQuantity).minus(input.currentQuantity);
    return { quantity: room.compareTo(target) < 0 ? room : target, facts: cap.inputFacts.slice() };
  }
  if (!action.distance || !D.from(action.distance).isPositive())
    return {
      status: 'unavailable',
      reasonCode: 'FACT_UNAVAILABLE',
      reason: '风险预算缺少正止损距离',
      inputFacts: [],
    };
  const requested = D.from(cap.requestedQuantity)
    .dividedBy(fraction, 40)
    .times(price.value)
    .times(plan.riskBudget!.equityFraction)
    .dividedBy(action.distance, 40);
  return {
    quantity:
      requested.compareTo(cap.normalizedQuantity) > 0 ? D.from(cap.normalizedQuantity) : requested,
    facts: [
      ...cap.inputFacts,
      'tradePlan.riskFraction=' + plan.riskBudget!.equityFraction,
      'tradePlan.stopDistance=' + action.distance,
      'tradePlan.maxEquityFraction=' + fraction,
    ],
  };
}

/** 计划数量与归一化研究单位保持同一口径，不将研究单位当作实际股数。 */
export function tradePlanSizing(
  plan: BacktestTradePlan,
  action: TradePlanAction | undefined,
  input: SizingInput,
  base: SizingResult,
): SizingResult {
  if (!action) return base;
  let requested: D | undefined,
    facts: string[] = [];
  if (action.targetWeight) {
    requested = D.from(action.quantity!);
    facts = [...(action.sizingFacts ?? [])];
  }
  if (action.kind === 'reduce') {
    if (base.status !== 'available') return base;
    requested = D.from(action.quantity!);
    if (requested.compareTo(input.currentQuantity) > 0) requested = D.from(input.currentQuantity);
  }
  if (
    !action.targetWeight &&
    (action.kind === 'add' || (action.kind === 'entry' && plan.riskBudget))
  ) {
    const budget = budgetQuantity(plan, action, input);
    if ('status' in budget) return budget;
    requested = budget.quantity;
    facts = budget.facts;
  }
  if (!requested) return base;
  return quantitySizing(requested, action, input, facts, plan);
}

function quantitySizing(
  requested: D,
  action: TradePlanAction,
  input: SizingInput,
  facts: string[],
  plan: BacktestTradePlan,
): SizingResult {
  if (!requested.isPositive())
    return {
      status: 'rejected',
      reasonCode: 'QUANTITY_BELOW_LOT',
      reason: '交易计划额度已达到投入上限',
      inputFacts: facts,
    };
  const quantity =
    input.accountingBasis === 'normalized-series'
      ? requested
      : D.from(floorLotUnits(requested.toString(), input.lotSize!)).times(input.lotSize!);
  if (!quantity.isPositive())
    return {
      status: 'rejected',
      reasonCode: 'QUANTITY_BELOW_LOT',
      reason: '交易计划额度不足执行单位或投入上限',
      inputFacts: facts,
    };
  return {
    status: 'available',
    ...(input.accountingBasis === 'normalized-series'
      ? { accountingBasis: 'normalized-series' as const }
      : {}),
    side: action.side ?? (action.kind === 'reduce' ? 'sell' : 'buy'),
    requestedQuantity: requested.toString(),
    normalizedQuantity: quantity.toString(),
    ...(action.targetWeight
      ? { investmentLimit: { fraction: action.targetWeight, scope: 'position' as const } }
      : {}),
    ...(!action.targetWeight &&
    (action.kind === 'add' || (action.kind === 'entry' && plan.riskBudget))
      ? {
          investmentLimit: {
            fraction: action.maxEquityFraction ?? plan.riskBudget!.maxEquityFraction,
            scope: 'position' as const,
          },
        }
      : {}),
    occurredAt: input.evaluationAt,
    availableAt: input.evaluationAt,
    inputFacts: [
      ...facts,
      'tradePlan.action=' + action.kind,
      'tradePlan.quantity=' + quantity.toString(),
    ],
  };
}
