import { DecimalValue as D } from './decimal.js';
import { BacktestDailyLedger } from './backtest-daily-ledger.js';
import { dailyBacktestVenue } from './backtest-daily-venue.js';
import { prepareDailyBacktestOrder } from './backtest-daily-order-submission.js';
import { BacktestTradePlanRuntime } from './backtest-trade-plan-runtime.js';
import { activeBacktestTradePlan } from './backtest-trade-plan-contract.js';
import { backtestOrderTerminal } from './backtest-order-state.js';
import {
  createCorporateActionPort,
  type CorporateActionMutation,
} from './backtest-corporate-actions.js';
import {
  DeterministicSimulationEngine,
  type SimulationExecutionPort,
  type SimulationExpressionContext,
  type SimulationTargetIntent,
} from './backtest-simulation.js';
import type { ExchangeSimulationRunInput, ExchangeSimulationRunResult } from './backtest-engine.js';
import type { SimulationSettlement } from './simulation-ledger.js';
import { finishBacktestComputation } from './backtest-computation.js';

/** 日线订单继续使用现有事件队列、公司行动、估值和信号入口。 */
export function* dailyExchangeSimulationSteps(
  input: ExchangeSimulationRunInput,
): Generator<void, ExchangeSimulationRunResult, void> {
  const config = input.exchange.dailyOrders!;
  const venue = dailyBacktestVenue(input),
    { ledger } = input;
  const planConfig = activeBacktestTradePlan(input.simulation.strategy.tradePlan);
  const sizingForIntent = (intent: SimulationTargetIntent) => {
    const sizing = {
      ...input.exchange.sizingForIntent(intent, ledger.snapshot()),
      accountingBasis: input.accountingBasis,
    };
    if (input.accountingBasis === 'normalized-series') {
      const first = venue.bars.find(
        (bar) =>
          Date.parse(bar.openedAt) >
          Math.max(Date.parse(intent.occurredAt), Date.parse(intent.availableAt)),
      );
      const assumptions = first ? venue.normalizedExecutionAt(first.openedAt) : undefined;
      if (assumptions) sizing.normalizedExecution = assumptions;
      else delete sizing.normalizedExecution;
    }
    return sizing;
  };
  if (planConfig && !input.exchange.tradePlanPrices)
    throw new Error('TRADE_PLAN_PRICE_SOURCE_MISSING');
  const tradePlan = planConfig
    ? new BacktestTradePlanRuntime(
        planConfig,
        input.exchange.tradePlanPrices!,
        [...new Set(input.simulation.ticks.map((tick) => tick.occurredAt))],
        input.accountingBasis === 'raw-events'
          ? input.exchange.rules.instrumentFact.lotSize
          : undefined,
        input.exchange.tradePlanCalendar,
        sizingForIntent,
      )
    : undefined;
  const book = new BacktestDailyLedger({
    ledger,
    symbol: input.simulation.strategy.executionInstrument.symbol,
    currency: input.exchange.rules.instrumentCurrency,
    policy: config.matching,
    costs: input.exchange.costs,
    lotSize: input.exchange.rules.instrumentFact.lotSize,
    feesFor: venue.feesFor,
    statutoryCharges: venue.statutoryCharges,
    normalizePrice: venue.normalizePrice,
    validateFill: venue.validateFill,
    settlementFor: venue.settlementFor,
    ...(tradePlan ? { tradePlan } : {}),
  });
  const contexts = new Map<string, SimulationExpressionContext>();
  const prepared = new Map<string, ReturnType<typeof prepareDailyBacktestOrder>>();
  const barByKey = new Map(venue.bars.map((bar) => [bar.key, bar]));
  const phases = venue.bars.flatMap((bar) => [
    {
      key: bar.key,
      phase: 'open' as const,
      occurredAt: bar.openedAt,
      availableAt: bar.openAvailableAt,
    },
    {
      key: bar.key,
      phase: 'range' as const,
      occurredAt: bar.completedAt,
      availableAt: bar.completedAvailableAt,
    },
  ]);
  let cycleId: string | undefined,
    flatEntryConsumed = false;
  const execution: SimulationExecutionPort = {
    phases,
    toOrder(intent) {
      const order = { ...intent, orderId: `${intent.intentId}:order` };
      if (
        !cycleId ||
        (intent.side === 'buy' &&
          ledger.snapshot().position.quantity === '0' &&
          !book.state.orders.some((item) => item.side === 'buy' && !backtestOrderTerminal(item)))
      )
        cycleId = `${order.orderId}:cycle`;
      prepared.set(
        order.orderId,
        prepareDailyBacktestOrder({
          run: input,
          book,
          venue,
          plan: tradePlan,
          intent,
          context: contexts.get(intent.signalId)!,
          cycleId,
        }),
      );
      return order;
    },
    validateOrder(order) {
      const result = prepared.get(order.orderId)!;
      if (!result.accepted) return { ...result, ruleVersion: 'daily-orders-v5' };
      book.submit(result.parent, {
        ...(result.budget ? { budget: result.budget } : {}),
        signalId: order.signalId,
      });
      for (const child of result.children) book.submit(child);
      if (book.state.orders.find((item) => item.id === result.parent.id)?.state === 'rejected')
        return {
          accepted: false,
          code: 'INSUFFICIENT_CASH',
          reason: '委托资金占款失败',
          ruleVersion: 'daily-orders-v5',
        };
      return {
        accepted: true,
        ruleVersion: 'daily-orders-v5',
        inputFacts: [
          `templateId=${result.parent.templateId}`,
          `quantityBasis=${result.parent.quantityBasis}`,
          `quantity=${result.parent.quantity}`,
        ],
      };
    },
    matchPhase(point) {
      const fillStart = book.fills.length,
        rejectStart = book.state.rejects.length;
      const bar = barByKey.get(point.key)!;
      book.phase(bar, point.phase);
      return {
        fills: book.fills.slice(fillStart),
        rejects: book.state.rejects.slice(rejectStart).map((reject, index) => ({
          rejectionId: `${reject.orderId}:reject:${index}`,
          orderId: reject.orderId,
          side: book.state.orders.find(order => order.id === reject.orderId)!.side,
          code: 'RULE_REJECTED',
          reason: reject.reason,
          ruleVersion: input.exchange.rules.ruleVersion,
          occurredAt: point.occurredAt,
          availableAt: point.availableAt,
          inputFacts: [`phase=${point.phase}`, `bar=${point.key}`],
        })),
      };
    },
    applyMutation(command) {
      if (command.type === 'simulationFill') {
        const fillId = String(command.payload.fillId);
        return book.fills.some((fill) => fill.fillId === fillId)
          ? { accepted: true }
          : { accepted: false, reason: '成交未获模拟账本接受' };
      }
      if (command.type === 'cashSettlement') {
        const event = command.payload as unknown as SimulationSettlement;
        book.acceptSettlement(event, event.availableAt);
      }
      return { accepted: true };
    },
    onOrderRejected: (id) => tradePlan?.reject(id),
    onMutation(command) {
      if (command.type !== 'corporateAction') return;
      const event = (command.payload as unknown as CorporateActionMutation).ledgerEvent;
      if (event.type === 'split') book.onAcceptedSplit(event.payload);
    },
    scheduledMutationsForFill: (fill) =>
      book.settlementEvents
        .filter((event) => event.sourceEventId === `${fill.fillId}:ledger`)
        .map((event) => ({
          type: 'cashSettlement',
          phase: 'SessionSettlementState',
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          availableAt: event.availableAt,
          payload: event as unknown as Record<string, unknown>,
        })),
  };
  const result = yield* new DeterministicSimulationEngine().steps({
    ...input.simulation,
    ...(input.simulation.strategy.entryTrigger ? { entryEligible: (context: SimulationExpressionContext) => (input.simulation.entryEligible?.(context) ?? true) &&
      D.from(ledger.availableCash(input.exchange.rules.instrumentCurrency)).isPositive() &&
      !book.state.orders.some((order) => order.side === 'buy' && !backtestOrderTerminal(order)) } : {}),
    selectSignal(context, selection) {
      const held = D.from(context.positionState?.quantity ?? '0').isPositive();
      if (held || (selection.entry.status === 'available' && !selection.entry.value))
        flatEntryConsumed = false;
      if (tradePlan && !input.simulation.strategy.entryTrigger && !held && flatEntryConsumed) return;
      const signal = tradePlan
        ? tradePlan.select(context, selection, input.simulation.strategy.entryTrigger !== undefined)
        : input.simulation.selectSignal
          ? input.simulation.selectSignal(context, selection)
          : selection.signal;
      if (signal) {
        contexts.set(signal.signalId, context);
        if (!held && signal.kind === 'entry') flatEntryConsumed = true;
      }
      return signal;
    },
    positionStateAt(tick) {
      const position = ledger.snapshot().position;
      const supplied = input.simulation.positionStateAt?.(tick) ?? input.simulation.positionState;
      return {
        isOpen: position.quantity !== '0',
        quantity: position.quantity,
        averageCost: position.averageCost,
        holdingPeriods: supplied?.holdingPeriods ?? 0,
        availableAt: tick.availableAt ?? tick.occurredAt,
      };
    },
    corporateActionPort: createCorporateActionPort(
      ledger,
      { ...ledger.snapshot().position },
      input.simulation.runId,
      input.exchange.cashEntitlementFor,
    ),
    execution,
  });
  for (const order of book.state.orders) if (!backtestOrderTerminal(order)) book.cancel(order.id);
  return {
    ...result,
    ledger: ledger.snapshot(),
    ledgerMutations: book.mutations,
    dailyOrders: book.state,
    ...(tradePlan
      ? { tradePlan: { memory: tradePlan.snapshot(), diagnostics: tradePlan.diagnostics } }
      : {}),
  };
}

export const runDailyExchangeSimulation = (input: ExchangeSimulationRunInput) => finishBacktestComputation(dailyExchangeSimulationSteps(input));
