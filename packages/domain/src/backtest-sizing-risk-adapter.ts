import { DecimalValue } from './decimal.js';
import { computeSizing, type SizingInput, type SizingResult } from './backtest-sizing.js';
import type {
  ExchangeMarketSimulationInput,
  ExchangeOrderRequest,
  ExchangePlan,
} from './backtest-exchange.js';
import { ExchangeMarketSimulation } from './backtest-exchange.js';
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

export const createExchangeSizingAdapter = (
  config: ExchangeSizingAdapterConfig,
): ExchangeSizingAdapter => {
  const sizingByOrder = new Map<string, SizingResult>();
  const plansByOrder = new Map<string, ExchangePlan>();
  const simulation = new ExchangeMarketSimulation();

  const toOrder = (intent: SimulationTargetIntent): ExchangeOrderRequest => {
    const sizing = computeSizing(config.sizingForIntent(intent));
    const orderId = `${intent.intentId}:order`;
    sizingByOrder.set(orderId, sizing);
    const available = sizing.status === 'available' ? sizing : undefined;
    const defaults = available
      ? config.orderDefaults(intent, available)
      : { market: 'CN' as const };
    return {
      ...intent,
      orderId,
      quantity: available?.normalizedQuantity ?? '0',
      ...defaults,
    };
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
    if (sizing.status !== 'available') return unavailableSizingDecision(sizing);
    if (sizing.side === 'none' || sizing.normalizedQuantity === '0') {
      return {
        accepted: false as const,
        code: 'QUANTITY_ZERO',
        reason: 'sizing 规范化后数量为零',
        ruleVersion: 'sizing-v1',
        inputFacts: sizing.inputFacts,
      };
    }
    const plan = simulation.plan({
      ...config.exchangeInputForOrder(order as ExchangeOrderRequest),
      order: order as ExchangeOrderRequest,
    });
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
