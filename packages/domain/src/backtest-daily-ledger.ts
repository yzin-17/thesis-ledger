import { DecimalValue as D } from './decimal.js';
import type {
  SimulationLedger,
  SimulationSettlement,
  SimulationSplit,
  LedgerMutationResult,
} from './simulation-ledger.js';
import type { BacktestCurrency } from './backtest-contract.js';
import type { ExchangeCostModel } from './backtest-exchange.js';
import type { FrozenExecutionModelFees } from './backtest-execution-model.js';
import type { BacktestTradePlanRuntime } from './backtest-trade-plan-runtime.js';
import type { SimulationFillRecord } from './backtest-simulation.js';
import type { BacktestDailyMatching, BacktestDailyOrder } from './backtest-order-contract.js';
import { backtestOrderTerminal, endBacktestOrder } from './backtest-order-state.js';
import { reconcileBacktestProtection } from './backtest-order-protection.js';
import { backtestDailyOrderPrice, type BacktestDailyBar } from './backtest-daily-order-price.js';
import {
  createBacktestDailyMatchState,
  matchBacktestDailyPhase,
  type BacktestDailyMatchFill,
} from './backtest-daily-matching.js';
import {
  emptyBacktestOrderCharges,
  quoteBacktestOrderCharges,
  type BacktestOrderChargeMemory,
} from './backtest-order-charges.js';
import { affordableBacktestOrderQuantity } from './backtest-order-affordability.js';
import { BacktestOrderSettledOwnership } from './backtest-order-settled-ownership.js';

export interface BacktestDailyLedgerBar extends BacktestDailyBar {
  openedAt: string;
  completedAt: string;
  openAvailableAt?: string | undefined;
  completedAvailableAt?: string | undefined;
  tradable?: boolean;
}
interface DailyLedgerConfig {
  ledger: SimulationLedger;
  symbol: string;
  currency: BacktestCurrency;
  policy: BacktestDailyMatching;
  costs: ExchangeCostModel;
  lotSize: string;
  feesFor?: (at: string) => FrozenExecutionModelFees | undefined;
  normalizePrice?: (price: string, order: BacktestDailyOrder, at: string) => string;
  statutoryCharges?: (
    side: 'buy' | 'sell',
    turnover: string,
    at: string,
  ) => Array<{ code: string; amount: string; currency: BacktestCurrency }>;
  validateFill: (
    fill: BacktestDailyMatchFill,
    order: BacktestDailyOrder,
    at: string,
  ) => { accepted: true } | { accepted: false; reason: string };
  settlementFor: (fill: SimulationFillRecord) => { cashAt: string; positionAt: string };
  tradePlan?: BacktestTradePlanRuntime;
}

/** 连接纯撮合与实际模拟账本；冻结市场规则和日历仍由调用方提供。 */
export class BacktestDailyLedger {
  state = createBacktestDailyMatchState([]);
  readonly fills: SimulationFillRecord[] = [];
  readonly mutations: LedgerMutationResult[] = [];
  readonly settlementEvents: SimulationSettlement[] = [];
  readonly corporateActions: SimulationSplit[] = [];
  private readonly budgets = new Map<string, string>();
  private readonly charges = new Map<string, BacktestOrderChargeMemory>();
  private readonly settlements: SimulationSettlement[] = [];
  private readonly ownership = new BacktestOrderSettledOwnership();
  constructor(private readonly config: DailyLedgerConfig) {}

  submit(order: BacktestDailyOrder, input?: { budget?: string; signalId?: string }) {
    if (this.state.orders.some((item) => item.id === order.id)) return;
    if (order.side === 'buy') {
      if (!input?.budget) throw new Error('建仓委托缺少已冻结的资金预算');
      const result = this.config.ledger.reserveCash(
        this.reservation(order.id),
        this.config.currency,
        input.budget,
      );
      if (!result.accepted) order = endBacktestOrder(order, 'rejected');
      else this.budgets.set(order.id, input.budget);
    }
    this.state.orders.push(structuredClone(order));
    if (
      order.side === 'sell' &&
      !order.parent &&
      ['exit', 'stopLoss'].includes(order.action.kind)
    ) {
      for (const pending of this.state.orders.filter(
        (item) => item.side === 'buy' && item.cycleId === order.cycleId,
      ))
        this.cancel(pending.id);
    }
    this.registerPlanOrder(order, input?.signalId);
    this.releaseTerminated(this.state.orders);
  }

  cancel(orderId: string) {
    this.state.orders = this.state.orders.map((order) =>
      order.id === orderId ? endBacktestOrder(order, 'cancelled') : order,
    );
    this.state.orders = reconcileBacktestProtection(this.state.orders, this.state.exits, {
      barIndex: this.state.currentBar?.index ?? 0,
      phase: 'open',
    });
    this.releaseTerminated(this.state.orders);
  }

  applySplit(split: SimulationSplit) {
    const result = this.config.ledger.applyEvent({ type: 'split', payload: split });
    if (!result.applied) return result;
    this.mutations.push(result);
    this.onAcceptedSplit(split);
    return result;
  }

  onAcceptedSplit(split: SimulationSplit) {
    this.corporateActions.push(structuredClone(split));
    const ratio = D.from(split.ratio);
    this.state.orders = this.state.orders.map((order) => ({
      ...order,
      quantity: D.from(order.quantity).times(ratio).toString(),
      filledQuantity: D.from(order.filledQuantity).times(ratio).toString(),
      remainingQuantity: D.from(order.remainingQuantity).times(ratio).toString(),
      price:
        order.price.kind === 'market'
          ? order.price
          : { ...order.price, price: D.from(order.price.price).dividedBy(ratio).toString() },
    }));
    this.state.exits = Object.fromEntries(
      Object.entries(this.state.exits).map(([id, quantity]) => [
        id,
        D.from(quantity).times(ratio).toString(),
      ]),
    );
    this.config.tradePlan?.applySplit(split.ratio);
    this.ownership.split(split.ratio);
  }

  phase(bar: BacktestDailyLedgerBar, phase: 'open' | 'range') {
    const at = phase === 'open' ? bar.openedAt : bar.completedAt;
    const available = phase === 'open' ? bar.openAvailableAt : bar.completedAvailableAt;
    const knownAt = available && Date.parse(available) > Date.parse(at) ? available : at;
    this.settleThrough(knownAt);
    this.state = matchBacktestDailyPhase({
      state: this.state,
      bar,
      phase,
      policy: this.config.policy,
      lotSize: this.config.lotSize,
      ...(bar.tradable === undefined ? {} : { tradable: bar.tradable }),
      availableForParent: (parent, state) => this.ownership.available(parent, state.exits),
      availableQuantity: (order, state) => {
        this.releaseTerminated(state.orders);
        if (order.side === 'sell') {
          const owned = D.from(this.ownership.forExit(order, state.orders, state.exits));
          const settled = D.from(this.config.ledger.snapshot().position.settledQuantity);
          return owned.compareTo(settled) < 0 ? owned.toString() : settled.toString();
        }
        const price = backtestDailyOrderPrice(order, bar, phase)!;
        return affordableBacktestOrderQuantity({
          requested: order.remainingQuantity,
          budget: this.budgets.get(order.id) ?? '0',
          step:
            order.quantityBasis === 'actual-units'
              ? this.config.lotSize
              : '0.0000000000000000000000000000000000000001',
          debit: (quantity) => {
            const quote = this.quote(order, quantity, price, at);
            return D.from(quantity).times(quote.price).plus(quote.total).toString();
          },
        });
      },
      execute: (candidate, order) => this.execute(candidate, order, at, knownAt),
    });
    this.releaseTerminated(this.state.orders);
    return this.state;
  }

  settleThrough(at: string) {
    const due = this.settlements.filter((item) => Date.parse(item.availableAt) <= Date.parse(at));
    for (const item of due) this.acceptSettlement(item, at);
  }

  acceptSettlement(item: SimulationSettlement, at: string) {
    const before = this.config.ledger.snapshot().position.settledQuantity;
    const result = this.config.ledger.applyEvent({ type: 'settlement', payload: item }, at);
    if (!result.applied && result.code !== 'DUPLICATE_EVENT') throw new Error(result.reason);
    if (result.applied) this.mutations.push(result);
    if (result.applied && (item.kind === 'position' || item.kind === 'both')) {
      const fill = this.fills.find((fill) => `${fill.fillId}:ledger` === item.sourceEventId);
      if (fill)
        this.ownership.settle(
          fill.orderId,
          D.from(result.state.position.settledQuantity).minus(before).toString(),
        );
    }
    const pending = this.settlements.findIndex((event) => event.eventId === item.eventId);
    if (pending >= 0) this.settlements.splice(pending, 1);
    return result;
  }

  private quote(order: BacktestDailyOrder, quantity: string, basePrice: string, at: string) {
    const direction = order.side === 'buy' ? '1' : '-1';
    let price = D.from(basePrice).times(
      D.from('1').plus(D.from(this.config.costs.slippageRate).times(direction)),
    );
    if (order.price.kind === 'limit') {
      const limit = D.from(order.price.price);
      if (
        (order.side === 'buy' && price.compareTo(limit) > 0) ||
        (order.side === 'sell' && price.compareTo(limit) < 0)
      )
        price = limit;
    }
    const finalPrice =
      this.config.normalizePrice?.(price.toString(), order, at) ?? price.toString();
    if (
      order.price.kind === 'limit' &&
      ((order.side === 'buy' && D.from(finalPrice).compareTo(order.price.price) > 0) ||
        (order.side === 'sell' && D.from(finalPrice).compareTo(order.price.price) < 0))
    )
      throw new Error('价格取整突破委托限价');
    const quote = quoteBacktestOrderCharges({
      previous: this.charges.get(order.id) ?? emptyBacktestOrderCharges(),
      side: order.side,
      quantity,
      price: finalPrice,
      currency: this.config.currency,
      quantityBasis: order.quantityBasis,
      costs: this.config.costs,
      fees: this.config.feesFor?.(at),
    });
    const statutory =
      this.config.statutoryCharges?.(
        order.side,
        D.from(quantity).times(finalPrice).toString(),
        at,
      ) ?? [];
    return {
      ...quote,
      charges: [...quote.charges, ...statutory],
      total: statutory
        .reduce((sum, charge) => sum.plus(charge.amount), D.from(quote.total))
        .toString(),
      price: finalPrice,
    };
  }

  private execute(
    candidate: BacktestDailyMatchFill,
    order: BacktestDailyOrder,
    at: string,
    knownAt: string,
  ) {
    const quote = this.quote(order, candidate.quantity, candidate.price, at);
    const validation = this.config.validateFill({ ...candidate, price: quote.price }, order, at);
    if (!validation.accepted) return validation;
    const terminal = D.from(candidate.quantity).compareTo(order.remainingQuantity) === 0;
    const budget = this.budgets.get(order.id);
    const debit = D.from(candidate.quantity).times(quote.price).plus(quote.total);
    const remaining =
      order.side === 'buy' && !terminal
        ? D.from(budget ?? '0')
            .minus(debit)
            .toString()
        : '0';
    const eventId = `${candidate.fillId}:ledger`;
    const fill: SimulationFillRecord = {
      fillId: candidate.fillId,
      orderId: order.id,
      executionSymbol: this.config.symbol,
      side: order.side,
      quantity: candidate.quantity,
      price: quote.price,
      charges: quote.charges.map(({ amount, currency }) => ({ amount, currency })),
      occurredAt: at,
      availableAt: knownAt,
      reason: order.action.kind === 'stopLoss' ? 'risk' : 'signal',
    };
    const result = this.config.ledger.applyEvent(
      {
        type: 'fill',
        payload: {
          ...fill,
          eventId,
          currency: this.config.currency,
          ...(order.side === 'buy'
            ? { cashReservationId: this.reservation(order.id), cashReservationRemaining: remaining }
            : {}),
        },
      },
      knownAt,
    );
    if (!result.applied) return { accepted: false as const, reason: result.reason };
    this.mutations.push(result);
    this.charges.set(order.id, quote.memory);
    if (order.side === 'buy') {
      if (terminal) this.budgets.delete(order.id);
      else this.budgets.set(order.id, remaining);
    }
    this.fills.push(fill);
    this.config.tradePlan?.accept(fill, result.state.position.quantity, result.realizedPnl, {
      terminal,
    });
    const dates = this.config.settlementFor(fill);
    for (const kind of ['cash', 'position'] as const) {
      if (kind === 'position' && fill.side === 'sell') continue;
      const scheduledAt = kind === 'cash' ? dates.cashAt : dates.positionAt;
      const availableAt = Date.parse(scheduledAt) > Date.parse(knownAt) ? scheduledAt : knownAt;
      const event: SimulationSettlement = {
        eventId: `${eventId}:${kind}`,
        sourceEventId: eventId,
        kind,
        currency: this.config.currency,
        symbol: this.config.symbol,
        occurredAt: scheduledAt,
        availableAt,
      };
      this.settlements.push(event);
      this.settlementEvents.push(event);
    }
    this.settleThrough(knownAt);
    return { accepted: true as const, quantity: candidate.quantity, price: quote.price };
  }

  private reservation(id: string) {
    return `${id}:cash-reservation`;
  }

  private releaseTerminated(orders: BacktestDailyOrder[]) {
    for (const order of orders) {
      if (!backtestOrderTerminal(order)) continue;
      if (this.budgets.delete(order.id)) this.config.ledger.releaseCash(this.reservation(order.id));
      this.config.tradePlan?.reject(order.id);
    }
  }

  private registerPlanOrder(order: BacktestDailyOrder, originalSignalId?: string) {
    const plan = this.config.tradePlan;
    if (!plan) return;
    const signalId = originalSignalId ?? `daily:${order.id}`;
    if (!plan.actions.has(signalId)) {
      const kind = order.action.kind;
      if (kind === 'stage')
        plan.actions.set(signalId, {
          kind: order.side === 'buy' ? 'add' : 'reduce',
          stageId: order.action.stageId,
        });
      else
        plan.actions.set(signalId, {
          kind: kind === 'stopLoss' ? 'stop' : kind === 'takeProfit' ? 'exit' : kind,
        });
    }
    plan.registerOrder(order.id, signalId);
  }
}
