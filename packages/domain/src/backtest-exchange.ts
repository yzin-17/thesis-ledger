import { DecimalValue } from './decimal.js';
import {
  calculateExecutionModelFees,
  ExecutionModelUnavailableError,
  resolveExecutionModelSegment,
  type FrozenExchangeExecutionModelSegment,
  type FrozenExecutionModel,
} from './backtest-execution-model.js';
import type { BacktestCurrency } from './backtest-v2.js';
import type {
  ExecutionRuleDecision,
  ExecutionRuleFacts,
  ExecutionRuleTrace,
  SettlementDates,
  VersionedExecutionRules,
} from './execution-rules.js';
import type { SimulationFillRecord, SimulationOrderRequest } from './backtest-simulation.js';
import type { SimulationLedgerFill, SimulationSettlement } from './simulation-ledger.js';
import type { TradingCalendar } from './trading-calendar.js';

export interface ExchangeBarFact {
  occurredAt: string;
  availableAt: string;
  openedAt: string;
  openAvailableAt: string;
  previousCloseAvailableAt: string;
  open: string;
  previousClose: string;
  status?: 'available' | 'unavailable';
  reason?: string;
  suspended?: boolean;
}

export interface ExchangeAccountFacts {
  settledCash: string;
  availableQuantity: string;
  acquiredOn?: string;
}

export interface ExchangeCostModel {
  version: string;
  slippageRate: string;
  commissionRate: string;
  minimumCommission?: { amount: string; currency: BacktestCurrency };
}

export interface ExchangeOrderRequest extends SimulationOrderRequest {
  market: ExecutionRuleFacts['instrument']['market'];
  quantity: string;
  orderType?: 'Market' | 'Limit';
  timeInForce?: 'DAY' | 'GTC';
  executionTiming?: 'nextEligibleBarOpen';
}

export type ExchangeRejectCode =
  'FUTURE_DATA' | 'DAY_EXPIRED' | 'INSUFFICIENT_CASH' | 'RULE_REJECTED' | 'INVALID_COST';

export interface ExchangeReject {
  rejectionId: string;
  orderId: string;
  code: ExchangeRejectCode;
  reason: string;
  ruleVersion: string;
  occurredAt: string;
  availableAt: string;
  inputFacts: readonly string[];
}

export interface ExchangeSettlementPlan extends SettlementDates {
  eventId: string;
  sourceEventId: string;
  kind: 'cash' | 'position' | 'both';
  occurredAt: string;
  availableAt: string;
  symbol: string;
  tradingDate: string;
  currency: ExecutionRuleFacts['instrument']['currency'];
  ledgerSettlements: readonly SimulationSettlement[];
}

export interface ExchangeChargeBreakdown {
  code: string;
  amount: string;
  currency: ExecutionRuleFacts['instrument']['currency'];
  source: 'strategy' | 'executionRules' | 'executionModel';
}

export interface ExchangeFillPlan {
  status: 'filled';
  fill: SimulationFillRecord;
  ledgerFill: SimulationLedgerFill;
  chargeBreakdown: readonly ExchangeChargeBreakdown[];
  settlement: ExchangeSettlementPlan;
  ruleTrace: ExecutionRuleTrace;
  cashReservation?: { reservationId: string; amount: string; currency: BacktestCurrency };
}

export interface ExchangeRejectPlan {
  status: 'rejected';
  reject: ExchangeReject;
}

export type ExchangePlan = ExchangeFillPlan | ExchangeRejectPlan;

export interface ExchangeMarketSimulationInput {
  rules: VersionedExecutionRules;
  calendar: TradingCalendar;
  currency: ExecutionRuleFacts['instrument']['currency'];
  bars: readonly ExchangeBarFact[];
  account: ExchangeAccountFacts;
  costs: ExchangeCostModel;
  order: ExchangeOrderRequest;
  executionModel?: FrozenExecutionModel;
  dataAsOf?: string;
}

class InvalidExchangeTimeError extends Error {}

const instant = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new InvalidExchangeTimeError(`无效时间: ${value}`);
  return parsed;
};

const laterTime = (left: string, right: string) => (instant(left) >= instant(right) ? left : right);

const parseCost = (value: string, name: string) => {
  try {
    const parsed = DecimalValue.from(value);
    if (parsed.isNegative()) throw new Error(`${name} 不能为负数`);
    return parsed;
  } catch {
    throw new Error(`${name} 不是规范十进制值`);
  }
};

const rejectPlan = (
  input: ExchangeMarketSimulationInput,
  code: ExchangeRejectCode,
  reason: string,
  inputFacts: readonly string[],
  at = input.order.occurredAt,
): ExchangeRejectPlan => ({
  status: 'rejected',
  reject: {
    rejectionId: `${input.order.orderId}:reject:${code}`,
    orderId: input.order.orderId,
    code,
    reason,
    ruleVersion: input.rules.ruleVersion,
    occurredAt: at,
    availableAt: at,
    inputFacts: [...inputFacts].sort(),
  },
});

const findNextEligibleBar = (input: ExchangeMarketSimulationInput): ExchangeBarFact | undefined => {
  const firstEligible = [...input.bars]
    .filter(
      (bar) =>
        instant(bar.openedAt) > instant(input.order.occurredAt) &&
        input.calendar.isTradingSession(bar.openedAt),
    )
    .sort((left, right) => instant(left.openedAt) - instant(right.openedAt))
    .find(() => true);
  if (!firstEligible) return undefined;
  const targetDate = input.calendar.status(firstEligible.openedAt).date;
  return [...input.bars]
    .filter(
      (bar) =>
        instant(bar.openedAt) > instant(input.order.occurredAt) &&
        input.calendar.isTradingSession(bar.openedAt) &&
        input.calendar.status(bar.openedAt).date === targetDate,
    )
    .sort((left, right) => instant(left.openedAt) - instant(right.openedAt))[0];
};

const strategyCharges = (
  costs: ExchangeCostModel,
  side: ExchangeOrderRequest['side'],
  rawPrice: string,
  quantity: string,
  currency: BacktestCurrency,
) => {
  const slippageRate = parseCost(costs.slippageRate, '滑点');
  const commissionRate = parseCost(costs.commissionRate, '佣金费率');
  if (costs.minimumCommission && costs.minimumCommission.currency !== currency) {
    throw new Error('最低佣金币种必须与执行标的一致');
  }
  const minimumCommission = costs.minimumCommission
    ? parseCost(costs.minimumCommission.amount, '最低佣金')
    : DecimalValue.from('0');
  const direction = side === 'buy' ? DecimalValue.from('1') : DecimalValue.from('-1');
  const price = DecimalValue.from(rawPrice).times(
    DecimalValue.from('1').plus(direction.times(slippageRate)),
  );
  if (!price.isPositive()) throw new Error('滑点后成交价必须为正数');
  const turnover = price.times(quantity);
  let commission = turnover.times(commissionRate);
  if (commission.compareTo(minimumCommission) < 0) commission = minimumCommission;
  return { price, turnover, commission };
};

const validateExecutionBar = (
  input: ExchangeMarketSimulationInput,
  bar: ExchangeBarFact,
): ExchangeRejectPlan | undefined => {
  if (bar.status === 'unavailable' || instant(bar.openAvailableAt) > instant(bar.openedAt)) {
    return rejectPlan(
      input,
      'FUTURE_DATA',
      '执行 Bar 在成交时尚不可用',
      [`bar.openedAt=${bar.openedAt}`, `bar.openAvailableAt=${bar.openAvailableAt}`],
      bar.openedAt,
    );
  }
  if (instant(bar.previousCloseAvailableAt) > instant(bar.openedAt)) {
    return rejectPlan(
      input,
      'FUTURE_DATA',
      '前收盘事实在成交时尚不可用',
      [
        `bar.openedAt=${bar.openedAt}`,
        `bar.previousCloseAvailableAt=${bar.previousCloseAvailableAt}`,
      ],
      bar.openedAt,
    );
  }
  return undefined;
};

const calculateStrategyCharges = (
  input: ExchangeMarketSimulationInput,
  bar: ExchangeBarFact,
  quantity: string,
  rawPrice = bar.open,
): ReturnType<typeof strategyCharges> | ExchangeRejectPlan => {
  try {
    return strategyCharges(input.costs, input.order.side, rawPrice, quantity, input.currency);
  } catch (error) {
    return rejectPlan(
      input,
      'INVALID_COST',
      error instanceof Error ? error.message : '成本参数无效',
      [`cost.version=${input.costs.version}`],
      bar.openedAt,
    );
  }
};

const isRejectPlan = (value: unknown): value is ExchangeRejectPlan =>
  typeof value === 'object' && value !== null && 'status' in value && value.status === 'rejected';

const prepareBar = (
  input: ExchangeMarketSimulationInput,
): { bar: ExchangeBarFact } | ExchangeRejectPlan => {
  if (input.currency !== input.rules.instrumentCurrency) {
    return rejectPlan(input, 'INVALID_COST', '执行币种与标的规则事实不一致', [
      `input.currency=${input.currency}`,
      `rules.currency=${input.rules.instrumentCurrency}`,
    ]);
  }
  if (instant(input.order.availableAt) > instant(input.order.occurredAt)) {
    return rejectPlan(input, 'FUTURE_DATA', '订单事实在提交时尚不可用', [
      `order.availableAt=${input.order.availableAt}`,
    ]);
  }
  const orderDay = input.calendar.status(input.order.occurredAt);
  if (!orderDay.open) {
    return rejectPlan(input, 'RULE_REJECTED', `订单日期不可交易：${orderDay.reason}`, [
      `calendar.date=${orderDay.date}`,
      `calendar.reason=${orderDay.reason}`,
    ]);
  }
  const bar = findNextEligibleBar(input);
  if (!bar) {
    return rejectPlan(input, 'DAY_EXPIRED', 'DAY 订单在目标交易日没有下一根可执行 Bar', [
      `calendar.date=${orderDay.date}`,
      'order.timeInForce=DAY',
    ]);
  }
  const rejection = validateExecutionBar(input, bar);
  return rejection ?? { bar };
};

const evaluateAtBar = (
  input: ExchangeMarketSimulationInput,
  bar: ExchangeBarFact,
  rules: VersionedExecutionRules,
): ExecutionRuleDecision | ExchangeRejectPlan => {
  const decision = rules.evaluate({
    symbol: input.order.executionSymbol,
    market: input.order.market,
    side: input.order.side,
    quantity: input.order.quantity,
    rawPrice: bar.open,
    previousClose: bar.previousClose,
    evaluatedAt: bar.openedAt,
    orderType: input.order.orderType ?? 'Market',
    timeInForce: input.order.timeInForce ?? 'DAY',
    ...(bar.suspended === undefined ? {} : { suspended: bar.suspended }),
    ...(input.account.acquiredOn === undefined ? {} : { acquiredOn: input.account.acquiredOn }),
    availableQuantity: input.account.availableQuantity,
  });
  if (decision.accepted) return decision;
  return rejectPlan(
    input,
    'RULE_REJECTED',
    decision.reason,
    [
      `reasonCode=${decision.reasonCode}`,
      `calendarProvider=${decision.trace.calendarProvider}`,
      `instrumentProvider=${decision.trace.instrumentProvider}`,
    ],
    bar.openedAt,
  );
};

const isRuleReject = (
  value: ExecutionRuleDecision | ExchangeRejectPlan,
): value is ExchangeRejectPlan => 'status' in value;

const settlementAvailability = (calendar: TradingCalendar, date: string, occurredAt: string) => {
  const firstSession = calendar.sessionsForDate(`${date}T12:00:00.000Z`)[0];
  if (!firstSession) return laterTime(occurredAt, occurredAt);
  const hours = Math.floor(firstSession.start / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (firstSession.start % 60).toString().padStart(2, '0');
  const localAsUtc = Date.parse(`${date}T${hours}:${minutes}:00.000Z`);
  let candidate = localAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: calendar.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    const observedAsUtc = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00.000Z`,
    );
    candidate += localAsUtc - observedAsUtc;
  }
  return laterTime(new Date(candidate).toISOString(), occurredAt);
};

const buildLedgerSettlements = (
  input: ExchangeMarketSimulationInput,
  fill: SimulationLedgerFill,
  dates: SettlementDates,
): readonly SimulationSettlement[] => {
  const positionAvailableAt = settlementAvailability(
    input.calendar,
    dates.positionAvailableOn,
    fill.occurredAt,
  );
  const cashAvailableAt = settlementAvailability(
    input.calendar,
    dates.cashAvailableOn,
    fill.occurredAt,
  );
  if (input.order.side === 'sell') {
    return [
      {
        eventId: `${input.order.orderId}:cash-settlement`,
        sourceEventId: fill.eventId,
        kind: 'cash',
        currency: input.currency,
        symbol: input.order.executionSymbol,
        occurredAt: fill.occurredAt,
        availableAt: cashAvailableAt,
      },
    ];
  }
  if (positionAvailableAt === cashAvailableAt) {
    return [
      {
        eventId: `${input.order.orderId}:settlement`,
        sourceEventId: fill.eventId,
        kind: 'both',
        currency: input.currency,
        symbol: input.order.executionSymbol,
        occurredAt: fill.occurredAt,
        availableAt: positionAvailableAt,
      },
    ];
  }
  return [
    {
      eventId: `${input.order.orderId}:position-settlement`,
      sourceEventId: fill.eventId,
      kind: 'position',
      currency: input.currency,
      symbol: input.order.executionSymbol,
      occurredAt: fill.occurredAt,
      availableAt: positionAvailableAt,
    },
    {
      eventId: `${input.order.orderId}:cash-settlement`,
      sourceEventId: fill.eventId,
      kind: 'cash',
      currency: input.currency,
      symbol: input.order.executionSymbol,
      occurredAt: fill.occurredAt,
      availableAt: cashAvailableAt,
    },
  ];
};

export class ExchangeMarketSimulation {
  plan(input: ExchangeMarketSimulationInput): ExchangePlan {
    try {
      return this.planInternal(input);
    } catch (error) {
      if (error instanceof InvalidExchangeTimeError) {
        return rejectPlan(input, 'RULE_REJECTED', '输入时间事实无效', ['time.invalid']);
      }
      if (error instanceof ExecutionModelUnavailableError) {
        return rejectPlan(input, 'RULE_REJECTED', error.message, [
          `executionModel=${input.executionModel?.id ?? 'missing'}`,
        ]);
      }
      throw error;
    }
  }

  private planInternal(input: ExchangeMarketSimulationInput): ExchangePlan {
    const preparation = prepareBar(input);
    if (isRejectPlan(preparation)) return preparation;
    const { bar } = preparation;
    let rules = input.rules;
    let modelSegment: FrozenExchangeExecutionModelSegment | undefined;
    if (input.executionModel) {
      if (!input.dataAsOf) {
        return rejectPlan(input, 'RULE_REJECTED', 'execution-model-v1 缺少 dataAsOf', [
          'executionModel.dataAsOf=missing',
        ], bar.openedAt);
      }
      const segment = resolveExecutionModelSegment<FrozenExchangeExecutionModelSegment>(
        input.executionModel as FrozenExecutionModel & {
          segments: readonly FrozenExchangeExecutionModelSegment[];
        },
        {
        expectedVersion: input.executionModel.version,
        symbol: input.order.executionSymbol,
        market: input.order.market,
        instrumentType: input.rules.instrumentFact.instrumentType,
        currency: input.currency,
        evaluatedAt: bar.openedAt,
        dataAsOf: input.dataAsOf,
        },
      );
      if (segment.execution.mode !== 'exchange') {
        return rejectPlan(input, 'RULE_REJECTED', 'NAV 执行模型不能用于 Exchange', [
          `executionModel.segment=${segment.id}`,
        ], bar.openedAt);
      }
      modelSegment = segment;
      rules = input.rules.withExecutionModel(
        segment,
        `execution-model-v1:${input.executionModel.id}:${input.executionModel.version}:${segment.id}`,
      );
    }
    const decision = evaluateAtBar(input, bar, rules);
    if (isRuleReject(decision)) return decision;
    const initialCosts = calculateStrategyCharges(
      input,
      bar,
      decision.normalizedQuantity,
      (decision.accepted ? decision.normalizedPrice : undefined) ?? bar.open,
    );
    if (isRejectPlan(initialCosts)) return initialCosts;
    let costs = initialCosts;
    if (modelSegment && modelSegment.execution.price.kind === 'dailyLimit') {
      const roundedPrice = rules.normalizePrice(costs.price);
      const priceDecision = evaluateAtBar(
        input,
        { ...bar, open: roundedPrice.toString() },
        rules,
      );
      if (isRuleReject(priceDecision)) return priceDecision;
      costs = {
        ...costs,
        price: roundedPrice,
        turnover: roundedPrice.times(decision.normalizedQuantity),
      };
    }
    const modelCharges = modelSegment
      ? calculateExecutionModelFees(modelSegment.fees, {
          side: input.order.side,
          turnover: costs.turnover.toString(),
          currency: input.currency,
        })
      : undefined;
    const statutory = modelSegment
      ? []
      : input.rules.statutoryCharges(input.order.side, costs.turnover.toString());
    const chargeBreakdown: ExchangeChargeBreakdown[] = modelSegment
      ? modelCharges!.charges.map((charge) => ({ ...charge, source: 'executionModel' as const }))
      : [
          ...(input.costs.commissionRate !== '0' ||
          (input.costs.minimumCommission?.amount !== undefined &&
            input.costs.minimumCommission.amount !== '0')
            ? [
                {
                  code: 'STRATEGY_COMMISSION',
                  amount: costs.commission.toString(),
                  currency: input.currency,
                  source: 'strategy' as const,
                },
              ]
            : []),
          ...statutory.map((charge) => ({ ...charge, source: 'executionRules' as const })),
        ];
    const charges = [...chargeBreakdown.map(({ amount, currency }) => ({ amount, currency }))];
    const cashRequired = costs.turnover
      .plus(
        modelCharges?.total ??
          costs.commission
            .plus(statutory.reduce((total, charge) => total.plus(charge.amount), DecimalValue.from('0')))
            .toString(),
      );
    if (
      input.order.side === 'buy' &&
      DecimalValue.from(input.account.settledCash).compareTo(cashRequired) < 0
    ) {
      return rejectPlan(
        input,
        'INSUFFICIENT_CASH',
        '结算现金不足',
        [`cash.settled=${input.account.settledCash}`, `cash.required=${cashRequired.toString()}`],
        bar.openedAt,
      );
    }
    const targetDay = input.calendar.status(bar.openedAt);
    const settlement = rules.settlementDates(input.order.side, targetDay.date);
    const fill: SimulationFillRecord = {
      fillId: `${input.order.orderId}:fill`,
      orderId: input.order.orderId,
      executionSymbol: input.order.executionSymbol,
      side: input.order.side,
      quantity: decision.normalizedQuantity,
      price: costs.price.toString(),
      charges,
      occurredAt: bar.openedAt,
      availableAt: laterTime(bar.openAvailableAt, input.order.availableAt),
      reason: input.order.reason,
    };
    const ledgerFill: SimulationLedgerFill = {
      eventId: `${input.order.orderId}:fill-event`,
      fillId: fill.fillId,
      executionSymbol: fill.executionSymbol,
      side: fill.side,
      quantity: fill.quantity,
      price: fill.price,
      charges: fill.charges.map((charge) => ({ ...charge, currency: input.currency })),
      currency: input.currency,
      occurredAt: fill.occurredAt,
      availableAt: fill.availableAt,
      ...(modelSegment && input.order.side === 'buy'
        ? { cashReservationId: `${input.order.orderId}:cash-reservation` }
        : {}),
    };
    const ledgerSettlements = buildLedgerSettlements(input, ledgerFill, settlement);
    const settlementAvailableAt = ledgerSettlements.reduce(
      (latest, item) => laterTime(latest, item.availableAt),
      fill.occurredAt,
    );
    return {
      status: 'filled',
      fill,
      ledgerFill,
      chargeBreakdown,
      settlement: {
        ...settlement,
        eventId: `${input.order.orderId}:settlement-plan`,
        sourceEventId: ledgerFill.eventId,
        kind: 'both',
        occurredAt: fill.occurredAt,
        availableAt: settlementAvailableAt,
        symbol: input.order.executionSymbol,
        tradingDate: targetDay.date,
        currency: input.currency,
        ledgerSettlements,
      },
      ruleTrace: decision.trace,
      ...(modelSegment && input.order.side === 'buy'
        ? {
            cashReservation: {
              reservationId: `${input.order.orderId}:cash-reservation`,
              amount: cashRequired.toString(),
              currency: input.currency,
            },
          }
        : {}),
    };
  }
}
