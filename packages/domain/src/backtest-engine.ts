import {
  createCorporateActionPort,
  type CorporateActionMutation,
} from './backtest-corporate-actions.js';
import { DecimalValue } from './decimal.js';
import {
  resolveNormalizedExecutionModelSegment,
  type FrozenExecutionModel,
} from './backtest-execution-model.js';
import type { ExchangeBarFact, ExchangeCostModel } from './backtest-exchange.js';
import type { SimulationAccountingBasis } from './backtest-normalized-accounting.js';
import { createExchangeSizingAdapter } from './backtest-sizing-risk-adapter.js';
import type { SizingInput } from './backtest-sizing.js';
import {
  runDeterministicSimulation,
  type SimulationEngineInput,
  type SimulationFillRecord,
  type SimulationMutationCommand,
  type SimulationMutationDecision,
  type SimulationRunResult,
  type SimulationTargetIntent,
} from './backtest-simulation.js';
import type { VersionedExecutionRules } from './execution-rules.js';
import type {
  SimulationLedger,
  LedgerMutationResult,
  SimulationLedgerState,
  SimulationSettlement,
} from './simulation-ledger.js';
import type { TradingCalendar } from './trading-calendar.js';

export interface ExchangeSimulationRunInput {
  simulation: Omit<SimulationEngineInput, 'execution' | 'corporateActionPort'>;
  ledger: SimulationLedger;
  accountingBasis: SimulationAccountingBasis;
  exchange: {
    rules: VersionedExecutionRules;
    calendar: TradingCalendar;
    /** Frozen execution prices and their session/availability times. */
    bars: readonly ExchangeBarFact[];
    costs: ExchangeCostModel;
    executionModel?: FrozenExecutionModel;
    dataAsOf?: string;
    sizingForIntent: (intent: SimulationTargetIntent, ledger: SimulationLedgerState) => SizingInput;
  };
}

export interface ExchangeSimulationRunResult extends SimulationRunResult {
  ledger: SimulationLedgerState;
  ledgerMutations: readonly LedgerMutationResult[];
}

const assertExchangeSimulationInput = (input: ExchangeSimulationRunInput) => {
  const strategyInstrument = input.simulation.strategy.executionInstrument;
  const ledgerInstrument = input.ledger.snapshot().position;
  const ruleInstrument = input.exchange.rules.instrumentFact;
  const ruleMarket = ruleInstrument.market;
  const orderRules = input.exchange.rules.orderRules;
  if (input.ledger.accountingBasis !== input.accountingBasis) {
    throw new Error('SimulationLedger accountingBasis 与运行口径不一致');
  }
  if (
    strategyInstrument.symbol !== ledgerInstrument.symbol ||
    strategyInstrument.market !== ledgerInstrument.market ||
    strategyInstrument.assetType !== ledgerInstrument.assetType ||
    strategyInstrument.symbol !== ruleInstrument.symbol ||
    strategyInstrument.market !== ruleMarket ||
    input.ledger.snapshot().position.currency !== ruleInstrument.currency
  ) {
    throw new Error('策略、SimulationLedger 与执行规则必须指向同一执行标的');
  }
  if (input.exchange.calendar.market !== ruleMarket) {
    throw new Error('Exchange session calendar 与执行规则市场不一致');
  }
  if (
    orderRules.type !== 'Market' ||
    orderRules.timeInForce !== 'DAY' ||
    orderRules.executionTiming !== 'nextEligibleBarOpen' ||
    orderRules.fillPolicy !== 'full-or-reject' ||
    !orderRules.longOnly
  ) {
    throw new Error('回测 Exchange 仅支持只做多、DAY、下一有效开盘及整单成交');
  }
};

const ledgerDecision = (result: LedgerMutationResult): SimulationMutationDecision =>
  result.applied
    ? { accepted: true }
    : {
        accepted: false,
        reason: result.reason,
        ruleVersion: 'simulation-ledger-v1',
        inputFacts: [`ledger.code=${result.code}`, `ledger.eventId=${result.eventId}`],
      };

const nextEligibleExchangeFillAt = (
  order: { occurredAt: string },
  calendar: TradingCalendar,
  bars: readonly ExchangeBarFact[],
) => {
  const eligibleBars = [...bars]
    .filter(
      (bar) =>
        Date.parse(bar.openedAt) > Date.parse(order.occurredAt) &&
        calendar.isTradingSession(bar.openedAt),
    )
    .sort((left, right) => Date.parse(left.openedAt) - Date.parse(right.openedAt));
  const firstEligibleBar = eligibleBars[0];
  if (!firstEligibleBar) return undefined;
  const targetDate = calendar.status(firstEligibleBar.openedAt).date;
  return eligibleBars.find((bar) => calendar.status(bar.openedAt).date === targetDate)?.openedAt;
};

const sellableQuantityAt = (
  state: SimulationLedgerState,
  fillAt: string | undefined,
  pendingPositionSettlements: ReadonlyMap<string, { quantity: string; availableAt: string }>,
) => {
  const settledQuantity = DecimalValue.from(state.position.settledQuantity);
  if (!fillAt) return settledQuantity.toString();
  return [...pendingPositionSettlements.values()]
    .filter((settlement) => Date.parse(settlement.availableAt) <= Date.parse(fillAt))
    .reduce((quantity, settlement) => quantity.plus(settlement.quantity), settledQuantity)
    .toString();
};

/** 连接现行事件引擎、单标的 Exchange 与模拟账本。 */
export const runExchangeSimulation = (
  input: ExchangeSimulationRunInput,
): ExchangeSimulationRunResult => {
  assertExchangeSimulationInput(input);
  const { ledger } = input;
  const { rules, calendar, bars, costs, executionModel, dataAsOf } = input.exchange;
  const currency = rules.instrumentCurrency;
  const ledgerMutations: LedgerMutationResult[] = [];
  const pendingPositionSettlements = new Map<string, { quantity: string; availableAt: string }>();
  const sizingInputForIntent = (
    intent: SimulationTargetIntent,
    state: SimulationLedgerState,
  ): SizingInput => {
    const sizing = input.exchange.sizingForIntent(intent, state);
    if (sizing.accountingBasis !== undefined && sizing.accountingBasis !== input.accountingBasis) {
      throw new Error('Sizing 与 ExchangeSimulationRunInput 的 accountingBasis 不一致');
    }
    if (input.accountingBasis !== 'normalized-series') {
      return { ...sizing, accountingBasis: input.accountingBasis };
    }

    const normalizedSizing = { ...sizing };
    delete normalizedSizing.normalizedExecution;
    let normalizedExecution: SizingInput['normalizedExecution'];
    const evaluatedAt = nextEligibleExchangeFillAt(intent, calendar, bars) ?? intent.occurredAt;
    if (executionModel && dataAsOf) {
      try {
        normalizedExecution = resolveNormalizedExecutionModelSegment(executionModel, {
          expectedVersion: executionModel.version,
          symbol: rules.instrumentFact.symbol,
          market: rules.instrumentFact.market,
          instrumentType: rules.instrumentFact.instrumentType,
          currency,
          evaluatedAt,
          dataAsOf,
        }).execution.normalizedExecution;
      } catch {
        // Missing, stale, or incompatible frozen segments make normalized sizing unavailable.
      }
    }
    return {
      ...normalizedSizing,
      accountingBasis: input.accountingBasis,
      ...(normalizedExecution ? { normalizedExecution } : {}),
    };
  };
  const adapter = createExchangeSizingAdapter({
    sizingForIntent: (intent) => sizingInputForIntent(intent, ledger.snapshot()),
    orderDefaults: () => ({
      market: rules.instrumentFact.market,
      orderType: 'Market',
      timeInForce: 'DAY',
      executionTiming: 'nextEligibleBarOpen',
    }),
    exchangeInputForOrder: (order) => ({
      accountingBasis: input.accountingBasis,
      rules,
      calendar,
      currency,
      bars,
      account: {
        settledCash: ledger.availableCash(currency),
        availableQuantity: sellableQuantityAt(
          ledger.snapshot(),
          nextEligibleExchangeFillAt(order, calendar, bars),
          pendingPositionSettlements,
        ),
      },
      costs,
      ...(executionModel ? { executionModel } : {}),
      ...(dataAsOf ? { dataAsOf } : {}),
    }),
    reserveCashForOrder: (order, plan) => {
      if (order.side === 'sell') return { accepted: true };
      if (!plan.cashReservation) {
        return {
          accepted: false,
          code: 'MISSING_RESERVATION',
          reason: '买入成交计划缺少现金占款',
          inputFacts: [`orderId=${order.orderId}`],
        };
      }
      const reservation = plan.cashReservation;
      const result = ledger.reserveCash(
        reservation.reservationId,
        reservation.currency,
        reservation.amount,
      );
      return result.accepted
        ? { accepted: true }
        : {
            accepted: false,
            code: result.code,
            reason: result.reason,
            inputFacts: [
              `cash.currency=${reservation.currency}`,
              `cash.required=${reservation.amount}`,
            ],
          };
    },
  });
  const onMutation = (command: {
    type: string;
    payload: Record<string, unknown>;
  }): SimulationMutationDecision => {
    if (command.type === 'simulationFill') {
      const fill = command.payload as unknown as SimulationFillRecord;
      const plan = adapter.planFor(fill.orderId);
      if (plan?.status !== 'filled' || plan.fill.fillId !== fill.fillId) {
        return {
          accepted: false,
          reason: 'Simulation Fill 与 Exchange 成交计划不匹配',
          inputFacts: [`orderId=${fill.orderId}`, `fillId=${fill.fillId}`],
        };
      }
      const result = ledger.applyEvent(
        { type: 'fill', payload: plan.ledgerFill },
        fill.availableAt,
      );
      ledgerMutations.push(result);
      if (!result.applied && plan.cashReservation) {
        ledger.releaseCash(plan.cashReservation.reservationId);
      }
      return ledgerDecision(result);
    }
    if (command.type === 'cashSettlement') {
      const settlement = command.payload as unknown as SimulationSettlement;
      const result = ledger.applyEvent(
        { type: 'settlement', payload: settlement },
        settlement.availableAt,
      );
      ledgerMutations.push(result);
      if (result.applied && (settlement.kind === 'position' || settlement.kind === 'both')) {
        pendingPositionSettlements.delete(settlement.sourceEventId);
      }
      return ledgerDecision(result);
    }
    return { accepted: true };
  };
  const observeMutation = (command: SimulationMutationCommand) => {
    if (command.type !== 'corporateAction') return;
    const ledgerEvent = (command.payload as unknown as CorporateActionMutation).ledgerEvent;
    if (ledgerEvent.type !== 'split') return;
    const ratio = DecimalValue.from(ledgerEvent.payload.ratio);
    for (const [sourceEventId, settlement] of pendingPositionSettlements) {
      pendingPositionSettlements.set(sourceEventId, {
        ...settlement,
        quantity: DecimalValue.from(settlement.quantity).times(ratio).toString(),
      });
    }
  };
  const originalPositionStateAt = input.simulation.positionStateAt;
  const positionStateAt: NonNullable<SimulationEngineInput['positionStateAt']> = (tick) => {
    const position = ledger.snapshot().position;
    const supplied = originalPositionStateAt?.(tick) ?? input.simulation.positionState;
    return {
      isOpen: position.quantity !== '0',
      quantity: position.quantity,
      averageCost: position.averageCost,
      holdingPeriods: supplied?.holdingPeriods ?? 0,
      availableAt: tick.availableAt ?? tick.occurredAt,
    };
  };
  const execution = {
    ...adapter.port,
    applyMutation: onMutation,
    onMutation: observeMutation,
    scheduledMutationsForFill: (fill: SimulationFillRecord) => {
      const plan = adapter.planFor(fill.orderId);
      if (plan?.status !== 'filled') return [];
      if (plan.ledgerFill.side === 'buy') {
        for (const settlement of plan.settlement.ledgerSettlements) {
          if (settlement.kind === 'position' || settlement.kind === 'both') {
            pendingPositionSettlements.set(settlement.sourceEventId, {
              quantity: plan.ledgerFill.quantity,
              availableAt: settlement.availableAt,
            });
          }
        }
      }
      return plan.settlement.ledgerSettlements.map((settlement: SimulationSettlement) => ({
        type: 'cashSettlement' as const,
        eventId: settlement.eventId,
        occurredAt: settlement.occurredAt,
        availableAt: settlement.availableAt,
        payload: settlement as unknown as Record<string, unknown>,
      }));
    },
  };
  const result = runDeterministicSimulation({
    ...input.simulation,
    positionStateAt,
    corporateActionPort: createCorporateActionPort(
      ledger,
      {
        symbol: ledger.snapshot().position.symbol,
        market: ledger.snapshot().position.market,
        assetType: ledger.snapshot().position.assetType,
        currency,
      },
      input.simulation.runId,
    ),
    execution,
  });
  return { ...result, ledger: ledger.snapshot(), ledgerMutations };
};
