import { DecimalValue as D } from './decimal.js';
import { alignSeriesAt, type BacktestSeries } from './backtest-series.js';
import { isAvailableForDecisionAt } from './backtest-observation-clock.js';
import { evaluateNumericExpression } from './backtest-simulation-evaluator.js';
import { floorLotUnits } from './backtest-sizing.js';
import { BacktestTradeLossPause } from './backtest-trade-loss-pause.js';
import type { TradePlanCalendar } from './backtest-trade-plan-calendar.js';
import { BacktestTradePlanAllocation } from './backtest-trade-plan-allocation.js';
import type { TradePlanSizingReader } from './backtest-trade-volatility-action.js';
import {
  tradePlanAtrExpression,
  trailingProtectionLine,
  protectionArmed,
  tradePlanProtectionCondition,
} from './backtest-trade-protection.js';
import type { BacktestTradePlan, TradePlanAction } from './backtest-trade-plan-contract.js';
import type {
  SignalEvaluationResult,
  SimulationExpressionContext,
  SimulationFillRecord,
  SimulationSignal,
  SimulationTargetIntent,
} from './backtest-simulation.js';

export { tradePlanIndicatorExpressions } from './backtest-trade-protection.js';

export interface TradePlanMemory {
  cycle: number;
  initialQuantity: string;
  entryPrice: string;
  entryAtr?: string;
  highClose: string;
  stopLine?: string;
  initialStopLine?: string;
  initialStopArmed?: boolean;
  trailingArmed?: boolean;
  stageTargets: Record<string, string>;
  stageFilled: Record<string, string>;
  lastClosedIndex?: number;
  lastCloseWasStop?: boolean;
}
const emptyMemory = (): TradePlanMemory => ({
  cycle: 0,
  initialQuantity: '0',
  entryPrice: '0',
  highClose: '0',
  stageTargets: {},
  stageFilled: {},
});

/** 仅接受已提交成交；待成交动作与已完成数量分开，重复订单不会推进记忆。 */
export class BacktestTradePlanRuntime {
  readonly actions = new Map<string, TradePlanAction>();
  readonly diagnostics: string[] = [];
  private memory: TradePlanMemory;
  private pending: string | undefined;
  private entryOrderId: string | undefined;
  private entryPending = false;
  private orders = new Map<string, string>();
  private fills = new Set<string>();
  private evaluated = new Set<string>();
  private readonly lossPause: BacktestTradeLossPause | undefined;
  private readonly allocation: BacktestTradePlanAllocation;
  constructor(
    private readonly plan: BacktestTradePlan,
    private readonly prices: BacktestSeries,
    private readonly ticks: readonly string[],
    private readonly stageLotSize?: string,
    calendar?: TradePlanCalendar,
    readSizing?: TradePlanSizingReader,
  ) {
    this.memory = emptyMemory();
    this.lossPause = plan.lossPause
      ? new BacktestTradeLossPause(plan.lossPause, calendar, this.diagnostics)
      : undefined;
    this.allocation = new BacktestTradePlanAllocation(plan, prices, calendar, readSizing);
  }
  snapshot() {
    return {
      ...structuredClone(this.memory),
      ...(this.lossPause ? { lossPause: this.lossPause.snapshot() } : {}),
    };
  }
  action(intent: SimulationTargetIntent) {
    return this.actions.get(intent.signalId);
  }
  registerOrder(orderId: string, signalId: string) {
    this.orders.set(orderId, signalId);
  }
  reject(orderId: string) {
    if (this.orders.get(orderId) === this.pending) this.pending = undefined;
    if (orderId === this.entryOrderId) this.entryPending = false;
  }

  applySplit(ratio: string) {
    const r = D.from(ratio),
      m = this.memory;
    if (!r.isPositive()) throw new Error('TRADE_PLAN_INVALID_SPLIT');
    m.initialQuantity = D.from(m.initialQuantity).times(r).toString();
    m.entryPrice = D.from(m.entryPrice).dividedBy(r).toString();
    m.highClose = D.from(m.highClose).dividedBy(r).toString();
    if (m.entryAtr) m.entryAtr = D.from(m.entryAtr).dividedBy(r).toString();
    if (m.stopLine) m.stopLine = D.from(m.stopLine).dividedBy(r).toString();
    if (m.initialStopLine) m.initialStopLine = D.from(m.initialStopLine).dividedBy(r).toString();
    for (const values of [m.stageTargets, m.stageFilled])
      for (const key of Object.keys(values)) values[key] = D.from(values[key]!).times(r).toString();
    if (this.pending) {
      const action = this.actions.get(this.pending)!;
      for (const key of ['atr', 'distance'] as const)
        if (action[key]) action[key] = D.from(action[key]).dividedBy(r).toString();
    }
  }

  select(
    context: SimulationExpressionContext,
    selection: SignalEvaluationResult,
    explicitEntryPolicy = false,
  ): SimulationSignal | undefined {
    const at = context.tick.occurredAt;
    if (this.evaluated.has(at)) return;
    this.evaluated.add(at);
    const price = this.priceAt(at);
    if (!price) return;
    const held = D.from(context.positionState?.quantity ?? '0');
    if (!held.isPositive()) return this.pending || (explicitEntryPolicy && selection.signal?.kind !== 'entry')
      ? undefined : this.entry(context, selection, price);
    if (!D.from(this.memory.initialQuantity).isPositive())
      throw new Error('TRADE_PLAN_MEMORY_MISSING: 持仓缺少入场成交记忆');
    this.tightenStop(price, context);
    if (this.pending && !['entry', 'add'].includes(this.actions.get(this.pending)!.kind)) return;
    if (this.memory.stopLine && price.compareTo(this.memory.stopLine) <= 0)
      return this.signal(context, { kind: 'stop' }, 'risk', `动态保护线 ${this.memory.stopLine}`);
    if (selection.signal?.kind === 'risk')
      return this.signal(
        context,
        {
          kind:
            selection.risk?.status === 'available' && selection.risk.trigger === 'fixedStop'
              ? 'stop'
              : 'exit',
        },
        'risk',
        selection.signal.reason,
      );
    if (selection.signal?.kind === 'exit')
      return this.signal(context, { kind: 'exit' }, 'exit', selection.signal.reason);
    if (this.pending || this.entryPending) return;
    return this.stageSignal(context, price, held) ?? this.allocationSignal(context);
  }

  private priceAt(at: string) {
    const aligned = alignSeriesAt(this.prices, [at])[0];
    if (
      !aligned?.point?.value ||
      Date.parse(aligned.point.occurredAt) !== Date.parse(at) ||
      !isAvailableForDecisionAt(aligned.point, at)
    ) {
      this.diagnostics.push(`${at}:TRADE_PLAN_PRICE_UNAVAILABLE`);
      return;
    }
    const price = D.from(aligned.point.value);
    return price.isPositive() ? price : undefined;
  }

  private stageSignal(context: SimulationExpressionContext, price: D, held: D) {
    const stages = [
      ...this.plan.stages.filter((s) => s.action.kind === 'reduce'),
      ...this.plan.stages.filter((s) => s.action.kind === 'add'),
    ];
    for (const stage of stages) {
      const distance =
        stage.trigger.kind === 'gainPercent'
          ? D.from(this.memory.entryPrice).times(stage.trigger.value)
          : D.from(this.memory.entryAtr!).times(stage.trigger.value);
      if (price.compareTo(D.from(this.memory.entryPrice).plus(distance)) < 0) continue;
      const action = stage.action;
      const basis =
        action.kind === 'reduce' && action.basis === 'remainingQuantity'
          ? held
          : D.from(this.memory.initialQuantity);
      const target =
        this.memory.stageTargets[stage.id] ??
        this.stageQuantity(
          basis.times(action.kind === 'reduce' ? action.fraction : action.initialFraction),
        );
      this.memory.stageTargets[stage.id] = target;
      const remaining = D.from(target).minus(this.memory.stageFilled[stage.id] ?? '0');
      if (!remaining.isPositive()) continue;
      const quantity = action.kind === 'reduce' && remaining.compareTo(held) > 0 ? held : remaining;
      return this.signal(
        context,
        {
          kind: action.kind,
          stageId: stage.id,
          quantity: quantity.toString(),
          ...(action.kind === 'add' ? { maxEquityFraction: action.maxEquityFraction } : {}),
        },
        action.kind === 'add' ? 'entry' : 'exit',
        `阶段 ${stage.id}`,
      );
    }
    return;
  }

  private stageQuantity(quantity: D) {
    if (!this.stageLotSize) return quantity.toString();
    return D.from(floorLotUnits(quantity.toString(), this.stageLotSize))
      .times(this.stageLotSize)
      .toString();
  }

  private entry(context: SimulationExpressionContext, selection: SignalEvaluationResult, price: D) {
    if (selection.entry.status !== 'available' || !selection.entry.value) return;
    if (this.lossPause && !this.lossPause.entryAllowed(context.tick.occurredAt)) return;
    const cooldown = this.memory.lastCloseWasStop
      ? this.plan.cooldown?.stopBars
      : this.plan.cooldown?.bars;
    const index = this.index(context.tick.occurredAt);
    if (
      this.memory.lastClosedIndex !== undefined &&
      index - this.memory.lastClosedIndex <= (cooldown ?? 0)
    )
      return;
    const action = this.entryAction(context, price);
    if (action && this.allocation.enabled) return this.allocationSignal(context, action);
    if (action) return this.signal(context, action, 'entry', '交易计划入场');
    return;
  }

  private allocationSignal(context: SimulationExpressionContext, entry?: TradePlanAction) {
    if (!this.allocation.enabled) return;
    const at = context.tick.occurredAt;
    const result = this.allocation.at(at, Boolean(entry));
    if (result.status === 'unavailable') {
      this.diagnostics.push(`${at}:${result.reason}`);
      return;
    }
    if (result.status === 'unchanged') return;
    return this.signal(
      context,
      { ...entry, ...result.action },
      result.action.side === 'buy' ? 'entry' : 'exit',
      result.description,
    );
  }

  private entryAction(context: SimulationExpressionContext, price: D): TradePlanAction | undefined {
    let atr: string | undefined;
    const stop = this.plan.initialStop;
    const expression = stop?.kind === 'entryAtr' ? tradePlanAtrExpression(stop) : undefined;
    if (expression) {
      const value = evaluateNumericExpression(expression, context);
      if (
        value.status !== 'available' ||
        !isAvailableForDecisionAt(value, context.tick.occurredAt) ||
        !D.from(value.value).isPositive()
      ) {
        this.diagnostics.push(`${context.tick.occurredAt}:TRADE_PLAN_ATR_UNAVAILABLE`);
        return;
      }
      atr = value.value;
    }
    let distance: string | undefined;
    if (stop?.kind === 'percent') distance = price.times(stop.percent).toString();
    else if (stop?.kind === 'entryAtr') distance = D.from(atr!).times(stop.multiple).toString();
    if (distance && D.from(distance).compareTo(price) >= 0) {
      this.diagnostics.push(`${context.tick.occurredAt}:TRADE_PLAN_STOP_PRICE_NON_POSITIVE`);
      return;
    }
    return { kind: 'entry', ...(atr ? { atr } : {}), ...(distance ? { distance } : {}) };
  }

  private signal(
    context: SimulationExpressionContext,
    action: TradePlanAction,
    kind: SimulationSignal['kind'],
    reason: string,
  ): SimulationSignal {
    const at = context.tick.occurredAt;
    const signalId = `trade-plan:${this.memory.cycle}:${action.stageId ?? action.kind}:${at}`;
    this.actions.set(signalId, action);
    this.pending = signalId;
    return {
      signalId,
      source: 'BACKTEST',
      kind,
      occurredAt: at,
      availableAt: at,
      executionSymbol: this.prices.symbol,
      reason,
    };
  }

  private tightenStop(price: D, context: SimulationExpressionContext) {
    const m = this.memory;
    if (price.compareTo(m.highClose) > 0) m.highClose = price.toString();
    const trailing = this.plan.trailing;
    const entry = D.from(m.entryPrice);
    const raise = (line: D) => {
      if (!m.stopLine || line.compareTo(m.stopLine) > 0) m.stopLine = line.toString();
    };
    m.initialStopArmed = protectionArmed(
      m.initialStopArmed,
      tradePlanProtectionCondition(this.plan.initialStop),
      context,
      'tradePlan.initialStop',
    );
    if (m.initialStopArmed && m.initialStopLine) raise(D.from(m.initialStopLine));
    m.trailingArmed = protectionArmed(
      m.trailingArmed,
      tradePlanProtectionCondition(trailing),
      context,
      'tradePlan.trailing',
    );
    if (
      trailing &&
      m.trailingArmed &&
      D.from(m.highClose).compareTo(
        entry.times(D.from('1').plus(trailing.activationGainPercent ?? '0')),
      ) >= 0
    ) {
      const line = trailingProtectionLine(trailing, D.from(m.highClose), context, this.diagnostics);
      if (line) raise(line);
    }
    if (
      trailing?.breakEvenGainPercent &&
      m.trailingArmed &&
      D.from(m.highClose).compareTo(entry.times(D.from('1').plus(trailing.breakEvenGainPercent))) >=
        0
    )
      raise(entry);
  }

  accept(fill: SimulationFillRecord, remainingQuantity: string, realizedPnl?: string,
    execution: { terminal: boolean } = { terminal: true }) {
    if (this.fills.has(fill.fillId)) return;
    this.lossPause?.accept(fill, remainingQuantity, realizedPnl);
    this.fills.add(fill.fillId);
    const signalId = this.orders.get(fill.orderId);
    if (!signalId) throw new Error('TRADE_PLAN_ORDER_MISSING');
    const action = this.actions.get(signalId)!;
    if (execution.terminal && signalId === this.pending) this.pending = undefined;
    const m = this.memory;
    if (action.kind === 'entry') this.entryPending = !execution.terminal;
    if (action.kind === 'entry' && !D.from(m.initialQuantity).isPositive()) {
      this.entryOrderId = fill.orderId;
      m.cycle += 1;
      m.initialQuantity = fill.quantity;
      m.entryPrice = fill.price;
      m.highClose = '0';
      if (action.atr) m.entryAtr = action.atr;
      else delete m.entryAtr;
      m.stageTargets = {};
      m.stageFilled = {};
      const stop = this.plan.initialStop;
      if (stop?.kind === 'percent')
        m.initialStopLine = D.from(fill.price).times(D.from('1').minus(stop.percent)).toString();
      else if (stop?.kind === 'entryAtr')
        m.initialStopLine = D.from(fill.price)
          .minus(D.from(action.atr!).times(stop.multiple))
          .toString();
      else delete m.initialStopLine;
      m.initialStopArmed = !tradePlanProtectionCondition(stop);
      m.trailingArmed = !tradePlanProtectionCondition(this.plan.trailing);
      if (m.initialStopArmed && m.initialStopLine) m.stopLine = m.initialStopLine;
      else delete m.stopLine;
    }
    else if (action.kind === 'entry' && this.entryOrderId === fill.orderId)
      m.initialQuantity = D.from(m.initialQuantity).plus(fill.quantity).toString();
    if (action.stageId)
      m.stageFilled[action.stageId] = D.from(m.stageFilled[action.stageId] ?? '0')
        .plus(fill.quantity)
        .toString();
    if (fill.side === 'sell' && D.from(remainingQuantity).isZero()) {
      m.lastClosedIndex = this.index(fill.occurredAt);
      m.lastCloseWasStop = action.kind === 'stop';
      m.initialQuantity = '0';
      delete m.stopLine;
      delete m.initialStopLine;
      delete m.initialStopArmed;
      delete m.trailingArmed;
    }
  }

  private index(at: string) {
    return this.ticks.filter((t) => Date.parse(t) <= Date.parse(at)).length;
  }
}
