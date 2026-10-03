import { DecimalValue } from './decimal.js';
import { fitNormalizedQuantityToAvailableCash } from './backtest-normalized-budget.js';
import {
  computeSizing,
  floorLotUnits,
  type SizingAvailable,
  type SizingInput,
  type SizingResult,
} from './backtest-sizing.js';
import type {
  ExchangeMarketSimulationInput,
  ExchangeOrderRequest,
  ExchangePlan,
} from './backtest-exchange.js';
import { ExchangeMarketSimulation, findNextEligibleExchangeBar } from './backtest-exchange.js';
import type {
  SimulationExecutionPort,
  SimulationOrderRequest,
  SimulationTargetIntent,
  SimulationFillRecord,
  SimulationExpressionContext,
  BooleanEvaluation,
} from './backtest-simulation.js';
import { evaluateRiskAt, type RiskEvaluationInput, type RiskResult } from './backtest-risk.js';
import type { CnNavRequest } from './nav-simulation-contracts.js';

export interface ExchangeSizingAdapterConfig {
  sizingForIntent: (intent: SimulationTargetIntent) => SizingInput;
  orderDefaults: (
    intent: SimulationTargetIntent,
    sizing: Extract<SizingResult, { status: 'available' }>,
  ) => Pick<ExchangeOrderRequest, 'market'> &
    Partial<Pick<ExchangeOrderRequest, 'orderType' | 'timeInForce' | 'executionTiming'>>;
  exchangeInputForOrder: (
    order: ExchangeOrderRequest,
  ) => Omit<ExchangeMarketSimulationInput, 'order'>;
  reserveCashForOrder?: (
    order: ExchangeOrderRequest,
    plan: Extract<ExchangePlan, { status: 'filled' }>,
  ) =>
    | { accepted: true }
    | { accepted: false; code: string; reason: string; inputFacts?: readonly string[] };
}

export interface ExchangeSizingAdapter {
  port: SimulationExecutionPort;
  sizingFor: (orderId: string) => SizingResult | undefined;
  planFor: (orderId: string) => ExchangePlan | undefined;
}

type SizingFailure = Exclude<SizingResult, { status: 'available' }>;

const unavailableSizingDecision = (result: SizingFailure) => ({
  accepted: false as const,
  code: result.reasonCode,
  reason: result.reason,
  ruleVersion: 'sizing-v1',
  inputFacts: result.inputFacts,
});

const fitBuyToAvailableCash = (
  order: ExchangeOrderRequest,
  sizing: SizingAvailable,
  exchangeInputForOrder: ExchangeSizingAdapterConfig['exchangeInputForOrder'],
  simulation: ExchangeMarketSimulation,
) => {
  if (order.side !== 'buy' || !DecimalValue.from(order.quantity).isPositive()) {
    return { order, sizing };
  }

  const input = exchangeInputForOrder(order);
  const accountingBasis = input.accountingBasis ?? 'raw-events';
  if ((sizing.accountingBasis ?? 'raw-events') !== accountingBasis) {
    return { order, sizing };
  }
  if (accountingBasis === 'normalized-series') {
    return fitNormalizedBuyToAvailableCash(order, sizing, input, simulation);
  }

  const initialPlan = simulation.plan({ ...input, order });
  if (initialPlan.status !== 'rejected' || initialPlan.reject.code !== 'INSUFFICIENT_CASH') {
    return { order, sizing };
  }

  const lotSize = input.rules.instrumentFact.lotSize;
  let low = 0n;
  let high = BigInt(floorLotUnits(order.quantity, lotSize));
  let bestOrder: ExchangeOrderRequest | undefined;
  let bestPlan: Extract<ExchangePlan, { status: 'filled' }> | undefined;
  while (low < high) {
    const middle = low + (high - low + 1n) / 2n;
    const candidate: ExchangeOrderRequest = {
      ...order,
      quantity: DecimalValue.from(middle.toString()).times(lotSize).toString(),
    };
    const candidatePlan = simulation.plan({
      ...exchangeInputForOrder(candidate),
      order: candidate,
    });
    if (candidatePlan.status === 'filled') {
      low = middle;
      bestOrder = candidate;
      bestPlan = candidatePlan;
    } else if (candidatePlan.reject.code === 'INSUFFICIENT_CASH') {
      high = middle - 1n;
    } else {
      return { order, sizing };
    }
  }

  if (low === 0n || !bestOrder || !bestPlan) return { order, sizing };
  const requiredCash = bestPlan.cashReservation?.amount;
  if (requiredCash === undefined) return { order, sizing };
  const cashConstraint = {
    requestedQuantity: sizing.normalizedQuantity,
    availableCash: input.account.settledCash,
    requiredCash,
  };
  return {
    order: bestOrder,
    sizing: {
      ...sizing,
      normalizedQuantity: bestOrder.quantity,
      cashConstraint,
      inputFacts: [
        ...sizing.inputFacts,
        `cash.available=${cashConstraint.availableCash}`,
        `cash.required=${cashConstraint.requiredCash}`,
      ].sort(),
    },
  };
};

const fitNormalizedBuyToAvailableCash = (
  order: ExchangeOrderRequest,
  sizing: SizingAvailable,
  input: Omit<ExchangeMarketSimulationInput, 'order'>,
  simulation: ExchangeMarketSimulation,
) => {
  const fitted = fitNormalizedQuantityToAvailableCash(order.quantity, (quantity) => {
    const candidateOrder = { ...order, quantity };
    const plan = simulation.plan({ ...input, order: candidateOrder });
    if (plan.status === 'filled') return { status: 'affordable' as const, value: plan };
    if (plan.reject.code === 'INSUFFICIENT_CASH') {
      return { status: 'insufficient-cash' as const };
    }
    return { status: 'unavailable' as const, reason: 'EXCHANGE_PLAN_REJECTED' };
  });
  if (fitted.status !== 'available' || fitted.quantity === order.quantity) {
    return { order, sizing };
  }

  const bestOrder = { ...order, quantity: fitted.quantity };
  const bestPlan = fitted.value;
  const requiredCash = bestPlan.cashReservation?.amount;
  if (requiredCash === undefined) return { order, sizing };
  const cashConstraint = {
    requestedQuantity: sizing.normalizedQuantity,
    availableCash: input.account.settledCash,
    requiredCash,
  };
  return {
    order: bestOrder,
    sizing: {
      ...sizing,
      normalizedQuantity: bestOrder.quantity,
      cashConstraint,
      inputFacts: [
        ...sizing.inputFacts,
        `cash.available=${cashConstraint.availableCash}`,
        `cash.required=${cashConstraint.requiredCash}`,
      ].sort(),
    },
  };
};

export const createExchangeSizingAdapter = (
  config: ExchangeSizingAdapterConfig,
): ExchangeSizingAdapter => {
  const sizingByOrder = new Map<string, SizingResult>();
  const plansByOrder = new Map<string, ExchangePlan>();
  const simulation = new ExchangeMarketSimulation();

  const toOrder = (intent: SimulationTargetIntent): ExchangeOrderRequest => {
    let sizing = computeSizing(config.sizingForIntent(intent));
    const orderId = `${intent.intentId}:order`;
    const available = sizing.status === 'available' ? sizing : undefined;
    const defaults = available
      ? config.orderDefaults(intent, available)
      : { market: 'CN' as const };
    let order: ExchangeOrderRequest = {
      ...intent,
      orderId,
      quantity: available?.normalizedQuantity ?? '0',
      ...defaults,
    };
    if (available) {
      const result = fitBuyToAvailableCash(
        order,
        available,
        config.exchangeInputForOrder,
        simulation,
      );
      order = result.order;
      sizing = result.sizing;
    }
    sizingByOrder.set(orderId, sizing);
    return order;
  };

  const validateOrder = (order: SimulationOrderRequest) => {
    const sizing = sizingByOrder.get(order.orderId);
    if (!sizing) {
      return {
        accepted: false as const,
        code: 'SIZING_MISSING',
        reason: '缺少 order 对应的 sizing 结果',
        ruleVersion: 'sizing-v1',
        inputFacts: [`orderId=${order.orderId}`],
      };
    }
    if (sizing.status !== 'available') {
      if (sizing.status === 'unavailable' && sizing.reasonCode === 'PRICE_UNAVAILABLE') {
        const input = {
          ...config.exchangeInputForOrder(order as ExchangeOrderRequest),
          order: order as ExchangeOrderRequest,
        };
        if (!findNextEligibleExchangeBar(input)) {
          return {
            accepted: false as const,
            code: 'DAY_EXPIRED',
            reason: 'DAY 订单在冻结区间内没有下一根可执行 Bar',
            ruleVersion: input.rules.ruleVersion,
            inputFacts: ['order.timeInForce=DAY', 'nextEligibleBar=missing'],
          };
        }
      }
      return unavailableSizingDecision(sizing);
    }
    if (sizing.side === 'none' || sizing.normalizedQuantity === '0') {
      return {
        accepted: false as const,
        code: 'QUANTITY_ZERO',
        reason: 'sizing 规范化后数量为零',
        ruleVersion: 'sizing-v1',
        inputFacts: sizing.inputFacts,
      };
    }
    const exchangeInput = config.exchangeInputForOrder(order as ExchangeOrderRequest);
    const sizingBasis = sizing.accountingBasis ?? 'raw-events';
    const exchangeBasis = exchangeInput.accountingBasis ?? 'raw-events';
    if (sizingBasis !== exchangeBasis) {
      return {
        accepted: false as const,
        code: 'ACCOUNTING_BASIS_MISMATCH',
        reason: 'Sizing 与 Exchange 的记账口径不一致',
        ruleVersion: 'sizing-v1',
        inputFacts: [
          `sizing.accountingBasis=${sizingBasis}`,
          `exchange.accountingBasis=${exchangeBasis}`,
        ],
      };
    }
    const plan = simulation.plan({ ...exchangeInput, order: order as ExchangeOrderRequest });
    plansByOrder.set(order.orderId, plan);
    if (plan.status === 'rejected') {
      return {
        accepted: false as const,
        code: plan.reject.code,
        reason: plan.reject.reason,
        ruleVersion: plan.reject.ruleVersion,
        inputFacts: plan.reject.inputFacts,
      };
    }
    const reservation = config.reserveCashForOrder?.(order as ExchangeOrderRequest, plan);
    if (reservation && !reservation.accepted) {
      const code = reservation.code === 'INSUFFICIENT_CASH' ? 'INSUFFICIENT_CASH' : 'RULE_REJECTED';
      const rejected: ExchangePlan = {
        status: 'rejected',
        reject: {
          rejectionId: `${order.orderId}:reject:${code}`,
          orderId: order.orderId,
          code,
          reason: reservation.reason,
          ruleVersion: plan.ruleTrace.ruleVersion,
          occurredAt: plan.fill.occurredAt,
          availableAt: plan.fill.availableAt,
          inputFacts: [...(reservation.inputFacts ?? [])].sort(),
        },
      };
      plansByOrder.set(order.orderId, rejected);
      return {
        accepted: false as const,
        code,
        reason: reservation.reason,
        ruleVersion: plan.ruleTrace.ruleVersion,
        ...(reservation.inputFacts === undefined ? {} : { inputFacts: reservation.inputFacts }),
      };
    }
    return { accepted: true as const, ruleVersion: plan.ruleTrace.ruleVersion };
  };

  const createFill = (order: SimulationOrderRequest): SimulationFillRecord | undefined => {
    const plan = plansByOrder.get(order.orderId);
    return plan?.status === 'filled' ? plan.fill : undefined;
  };

  return {
    port: { toOrder, validateOrder, createFill },
    sizingFor: (orderId) => sizingByOrder.get(orderId),
    planFor: (orderId) => plansByOrder.get(orderId),
  };
};

export interface RiskEvaluationAdapterConfig {
  riskInputAt: (context: SimulationExpressionContext) => RiskEvaluationInput;
}

export interface RiskEvaluationAdapter {
  evaluate: (context: SimulationExpressionContext) => RiskResult;
  asSimulationRisk: (context: SimulationExpressionContext) => BooleanEvaluation;
}

export const createRiskEvaluationAdapter = (
  config: RiskEvaluationAdapterConfig,
): RiskEvaluationAdapter => {
  const evaluate = (context: SimulationExpressionContext) =>
    evaluateRiskAt(config.riskInputAt(context));
  const asSimulationRisk = (context: SimulationExpressionContext): BooleanEvaluation => {
    const result = evaluate(context);
    if (result.status === 'available') {
      return {
        status: 'available',
        value: Boolean(result.intent),
        occurredAt: result.occurredAt,
        availableAt: result.availableAt,
      };
    }
    return {
      status: 'unavailable',
      occurredAt: context.tick.occurredAt,
      reason: `${result.status}:${result.reasonCode}`,
    };
  };
  return { evaluate, asSimulationRisk };
};

export interface CnNavTargetIntentInput {
  requestAt: string;
  fee?: string;
  sizing: SizingInput;
}

const laterTime = (left: string, right: string) =>
  Date.parse(left) >= Date.parse(right) ? left : right;

export const navRequestFromTargetIntent = (
  intent: SimulationTargetIntent,
  input: CnNavTargetIntentInput,
): CnNavRequest | { status: 'unavailable' | 'rejected'; reason: string; reasonCode: string } => {
  const sizing = computeSizing(input.sizing);
  if (sizing.status !== 'available') {
    return { status: sizing.status, reason: sizing.reason, reasonCode: sizing.reasonCode };
  }
  if (sizing.side === 'none') {
    return { status: 'rejected', reason: 'NAV request quantity 为零', reasonCode: 'QUANTITY_ZERO' };
  }
  const requestId = `${intent.intentId}:nav-request`;
  const requestBase = {
    eventId: `${requestId}:request`,
    requestId,
    executionSymbol: intent.executionSymbol,
    requestAt: input.requestAt,
    fee: input.fee ?? '0',
    occurredAt: input.requestAt,
    availableAt: laterTime(input.requestAt, intent.availableAt),
  };
  if (intent.side === 'sell') {
    return {
      ...requestBase,
      requestType: 'redeem',
      shares: sizing.normalizedQuantity,
    };
  }
  const price = input.sizing.price?.value;
  if (!price)
    return {
      status: 'unavailable',
      reason: 'NAV subscribe 缺少 NAV price',
      reasonCode: 'PRICE_UNAVAILABLE',
    };
  const amount = DecimalValue.from(sizing.normalizedQuantity).times(price).toString();
  return { ...requestBase, requestType: 'subscribe', amount };
};
