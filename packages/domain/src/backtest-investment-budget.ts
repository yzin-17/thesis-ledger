import { DecimalValue as D } from './decimal.js';
import {
  computeSizing,
  readSizingEquity,
  floorLotUnits,
  type SizingAvailable,
  type SizingInput,
  type SizingResult,
} from './backtest-sizing.js';
import {
  fitNormalizedQuantityToAvailableCash,
  type NormalizedQuantityBudgetEvaluation,
} from './backtest-normalized-budget.js';
import type {
  ExchangeMarketSimulation,
  ExchangeMarketSimulationInput,
  ExchangeOrderRequest,
  ExchangePlan,
} from './backtest-exchange.js';

type Filled = Extract<ExchangePlan, { status: 'filled' }>;
type MarketInput = Omit<ExchangeMarketSimulationInput, 'order'>;

export function investmentRoom(
  input: SizingInput,
  sizing: SizingAvailable,
): { amount?: D; facts: string[] } | SizingResult {
  let limit = sizing.investmentLimit;
  if (!limit && input.rule.type === 'percentOfEquity')
    limit = { fraction: input.rule.percent, scope: 'order' };
  if (!limit && input.rule.type === 'targetWeight')
    limit = { fraction: input.rule.weight, scope: 'position' };
  if (!limit) return { facts: [] };
  const capInput: SizingInput = {
    ...input,
    ...(input.executionProjection ?? {}),
    rule: { type: 'percentOfEquity', percent: limit.fraction },
    currentQuantity: '0',
  };
  if (input.executionProjection) {
    delete capInput.price;
    delete capInput.equity;
    delete capInput.fx;
    Object.assign(capInput, input.executionProjection);
  }
  delete capInput.priceResearchReference;
  const cap = computeSizing(capInput);
  if (cap.status !== 'available') return cap;
  const equity = readSizingEquity(capInput);
  if (!(equity instanceof D)) return equity;
  const price = D.from(capInput.price!.value);
  const occupied =
    limit.scope === 'position' ? D.from(input.currentQuantity).times(price) : D.from('0');
  const amount = equity.times(limit.fraction).minus(occupied);
  return {
    amount,
    facts: [
      ...cap.inputFacts,
      `investment.fraction=${limit.fraction}`,
      `investment.scope=${limit.scope}`,
      `investment.occupied=${occupied.toString()}`,
      `investment.maxCashOutflow=${amount.toString()}`,
    ],
  };
}

function fitLots(
  requested: string,
  lot: string,
  evaluate: (quantity: string) => NormalizedQuantityBudgetEvaluation<Filled>,
) {
  const initial = evaluate(requested);
  if (initial.status === 'affordable')
    return { status: 'available' as const, quantity: requested, value: initial.value };
  if (initial.status === 'unavailable') return initial;
  let low = 0n,
    high = BigInt(floorLotUnits(requested, lot));
  let best: { quantity: string; value: Filled } | undefined;
  while (low < high) {
    const middle = low + (high - low + 1n) / 2n;
    const quantity = D.from(middle.toString()).times(lot).toString();
    const candidate = evaluate(quantity);
    if (candidate.status === 'affordable') {
      low = middle;
      best = { quantity, value: candidate.value };
    } else if (candidate.status === 'insufficient-cash') high = middle - 1n;
    else return candidate;
  }
  if (!best || low === 0n) return { status: 'unavailable' as const, reason: 'INSUFFICIENT_CASH' };
  return { status: 'available' as const, ...best };
}

/** 用实际成交计划的含滑点金额及全部费用验证预算；只缩量，绝不放大委托。 */
export function fitBuyToInvestmentBudget(
  order: ExchangeOrderRequest,
  sizing: SizingAvailable,
  sizingInput: SizingInput,
  exchangeInputForOrder: (order: ExchangeOrderRequest) => MarketInput,
  simulation: ExchangeMarketSimulation,
): { order: ExchangeOrderRequest; sizing: SizingResult } {
  if (order.side !== 'buy' || !D.from(order.quantity).isPositive()) return { order, sizing };
  const input = exchangeInputForOrder(order);
  if ((sizing.accountingBasis ?? 'raw-events') !== (input.accountingBasis ?? 'raw-events'))
    return { order, sizing };
  const budget = investmentRoom(sizingInput, sizing);
  if ('status' in budget) return { order, sizing: budget };
  const facts = [...sizing.inputFacts, ...budget.facts];
  const rejectBudget = (): { order: ExchangeOrderRequest; sizing: SizingResult } => ({
    order: { ...order, quantity: '0' },
    sizing: {
      status: 'rejected',
      reasonCode: 'QUANTITY_BELOW_LOT',
      reason: '含费用和滑点的可用投入额度不足执行单位',
      inputFacts: facts,
    },
  });
  if (budget.amount && !budget.amount.isPositive()) return rejectBudget();
  const evaluate = (quantity: string): NormalizedQuantityBudgetEvaluation<Filled> => {
    const candidate = { ...order, quantity };
    const market = input.accountingBasis === 'normalized-series' ? input : exchangeInputForOrder(candidate);
    const plan = simulation.plan({ ...market, order: candidate });
    if (plan.status === 'rejected') {
      if (plan.reject.code === 'INSUFFICIENT_CASH') return { status: 'insufficient-cash' };
      return { status: 'unavailable', reason: plan.reject.code };
    }
    if (
      budget.amount &&
      (!plan.cashReservation || D.from(plan.cashReservation.amount).compareTo(budget.amount) > 0)
    )
      return { status: 'insufficient-cash' };
    return { status: 'affordable', value: plan };
  };
  const fitted =
    input.accountingBasis === 'normalized-series'
      ? fitNormalizedQuantityToAvailableCash(order.quantity, evaluate)
      : fitLots(order.quantity, input.rules.instrumentFact.lotSize, evaluate);
  if (fitted.status !== 'available') {
    if (
      budget.amount &&
      fitted.reason === 'INSUFFICIENT_CASH' &&
      budget.amount.compareTo(input.account.settledCash) < 0
    )
      return rejectBudget();
    return { order, sizing };
  }
  const cashRequired = fitted.value.cashReservation?.amount;
  return {
    order: { ...order, quantity: fitted.quantity },
    sizing: {
      ...sizing,
      normalizedQuantity: fitted.quantity,
      ...(cashRequired && fitted.quantity !== order.quantity
        ? {
            cashConstraint: {
              requestedQuantity: order.quantity,
              availableCash: input.account.settledCash,
              requiredCash: cashRequired,
            },
          }
        : {}),
      inputFacts: [
        ...facts,
        ...(cashRequired
          ? [`cash.available=${input.account.settledCash}`, `cash.required=${cashRequired}`]
          : []),
      ],
    },
  };
}
