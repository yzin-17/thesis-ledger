import { DecimalValue as D } from './decimal.js';
import { computeSizing } from './backtest-sizing.js';
import { investmentRoom } from './backtest-investment-budget.js';
import { evaluateNumericExpression } from './backtest-simulation-evaluator.js';
import { isAvailableForDecisionAt } from './backtest-observation-clock.js';
import { createBacktestDailyOrder } from './backtest-order-state.js';
import { tradePlanSizing } from './backtest-trade-plan-sizing.js';
import { activeBacktestTradePlan } from './backtest-trade-plan-contract.js';
import type { ExchangeSimulationRunInput } from './backtest-engine.js';
import type { BacktestDailyLedger } from './backtest-daily-ledger.js';
import type { BacktestTradePlanRuntime } from './backtest-trade-plan-runtime.js';
import type { dailyBacktestVenue } from './backtest-daily-venue.js';
import type { BacktestDailyOrder, BacktestOrderTemplate } from './backtest-order-contract.js';
import type { SimulationExpressionContext, SimulationTargetIntent } from './backtest-simulation.js';

type Preparation =
  | { accepted: false; code: string; reason: string; inputFacts: readonly string[] }
  | {
      accepted: true;
      parent: BacktestDailyOrder;
      children: BacktestDailyOrder[];
      budget?: string;
    };
const failed = (code: string, reason: string, inputFacts: readonly string[] = []): Preparation => ({
  accepted: false,
  code,
  reason,
  inputFacts,
});

/** 只读下单时已知的表达式和权益；不使用后续根价格来扩大目标量。 */
export function prepareDailyBacktestOrder(input: {
  run: ExchangeSimulationRunInput;
  book: BacktestDailyLedger;
  venue: ReturnType<typeof dailyBacktestVenue>;
  plan?: BacktestTradePlanRuntime | undefined;
  intent: SimulationTargetIntent;
  context: SimulationExpressionContext;
  cycleId: string;
}): Preparation {
  const { run, book, venue, plan, intent, context, cycleId } = input;
  const execution = run.exchange.dailyOrders!.execution;
  const action = plan?.action(intent);
  const intrinsicRisk = intent.reason === 'risk';
  const stageId =
    action && (action.kind === 'add' || action.kind === 'reduce') ? action.stageId : undefined;
  const template = execution.orders.find((item) =>
    stageId
      ? item.action.kind === 'stage' && item.action.stageId === stageId
      : item.action.kind === (intent.side === 'buy' ? 'entry' : 'exit'),
  );
  if (!template) return failed('ORDER_TEMPLATE_MISSING', '信号动作缺少对应委托模板');
  const first = venue.bars.find(
    (bar) =>
      Date.parse(bar.openedAt) >
      Math.max(Date.parse(intent.occurredAt), Date.parse(intent.availableAt)),
  );
  if (!first) return failed('DAY_EXPIRED', '冻结区间内没有后续委托激活根');
  const freezePrice = (item: BacktestOrderTemplate): BacktestDailyOrder['price'] | undefined => {
    if (item.order.kind === 'market') return { kind: 'market' };
    const evaluated = evaluateNumericExpression(item.order.price, context);
    if (
      evaluated.status !== 'available' ||
      !isAvailableForDecisionAt(evaluated, context.tick.occurredAt) ||
      !D.from(evaluated.value).isPositive()
    )
      return;
    return { kind: item.order.kind, price: evaluated.value };
  };
  const price = intrinsicRisk ? { kind: 'market' as const } : freezePrice(template);
  if (!price) return failed('PRICE_UNAVAILABLE', '下单价格表达式缺少同口径可见正值');
  const childTemplates = intrinsicRisk
    ? []
    : execution.orders.filter((item) => item.parent?.templateId === template.id);
  const childPrices = childTemplates.map(freezePrice);
  if (childPrices.some((item) => !item))
    return failed('PRICE_UNAVAILABLE', '附属保护价格不可用，整份父子委托不提交');
  const sizingInput = {
    ...run.exchange.sizingForIntent(intent, run.ledger.snapshot()),
    accountingBasis: run.accountingBasis,
    evaluationAt: intent.occurredAt,
  };
  if (sizingInput.accountingBasis === 'normalized-series') {
    const assumptions = venue.normalizedExecutionAt(first.openedAt);
    if (assumptions) sizingInput.normalizedExecution = assumptions;
    else delete sizingInput.normalizedExecution;
  }
  delete sizingInput.executionProjection;
  if (price.kind !== 'market') {
    sizingInput.price = {
      value: price.price,
      occurredAt: intent.occurredAt,
      availableAt: intent.availableAt,
    };
  }
  let sizing = computeSizing(sizingInput);
  const config = activeBacktestTradePlan(run.simulation.strategy.tradePlan);
  if (config) sizing = tradePlanSizing(config, action, sizingInput, sizing);
  if (sizing.status !== 'available')
    return failed(sizing.reasonCode, sizing.reason, sizing.inputFacts);
  if (sizing.side === 'none' || !D.from(sizing.normalizedQuantity).isPositive())
    return failed('QUANTITY_ZERO', '委托方向或目标数量无效', sizing.inputFacts);
  let budget: string | undefined;
  if (intent.side === 'buy') {
    const room = investmentRoom(sizingInput, sizing);
    if ('status' in room)
      return failed(
        room.status === 'available' ? 'BUDGET_UNAVAILABLE' : room.reasonCode,
        room.status === 'available' ? '资金预算不可用' : room.reason,
        room.inputFacts,
      );
    let amount =
      room.amount ??
      (sizingInput.rule.type === 'fixedAmount'
        ? D.from(sizingInput.rule.amount)
        : D.from(run.ledger.availableCash(run.exchange.rules.instrumentCurrency)));
    const cash = D.from(run.ledger.availableCash(run.exchange.rules.instrumentCurrency));
    if (amount.compareTo(cash) > 0) amount = cash;
    if (!amount.isPositive()) return failed('INSUFFICIENT_CASH', '委托时没有可用资金预算');
    budget = amount.toString();
  }
  const id = `${intent.intentId}:order`,
    sequence = book.state.orders.length;
  const parent = createBacktestDailyOrder({
    id,
    templateId: template.id,
    cycleId,
    side: intent.side,
    action: intrinsicRisk ? { kind: 'stopLoss' } : template.action,
    quantityBasis:
      run.accountingBasis === 'normalized-series' ? 'normalized-units' : 'actual-units',
    quantity: sizing.normalizedQuantity,
    acceptedSequence: sequence,
    validity: intrinsicRisk ? { kind: 'DAY' } : template.validity,
    price,
    activatedBarIndex: first.index,
    eligibleFrom: { barIndex: first.index, phase: 'open' },
  });
  const children = childTemplates.map((item, index) =>
    createBacktestDailyOrder({
      id: `${id}:${item.id}`,
      templateId: item.id,
      cycleId,
      side: 'sell',
      action: item.action,
      quantityBasis: parent.quantityBasis,
      quantity: '0',
      acceptedSequence: sequence + index + 1,
      validity: item.validity,
      price: childPrices[index]!,
      parent: { orderId: id, activation: item.parent!.activation },
      ...(item.exitGroup ? { exitGroup: `${id}:${item.exitGroup}` } : {}),
    }),
  );
  return { accepted: true, parent, children, ...(budget ? { budget } : {}) };
}
