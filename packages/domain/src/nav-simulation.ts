import { DecimalValue } from './decimal.js';
import { SimulationLedger, type SimulationExecutionInstrument } from './simulation-ledger.js';

export * from './nav-simulation-contracts.js';
import type {
  CnNavAppliedEvent,
  CnNavCashSettlementEvent,
  CnNavConfirmationEvent,
  CnNavCutoffEvent,
  CnNavEventResult,
  CnNavRequest,
  CnNavRequestState,
  CnNavRejectedEvent,
  CnNavSimulationState,
  CnNavSimulationConfig,
  CnNavSimulationEvent,
  CnNavSimulationRejectCode,
  CnNavPricingEvent,
  CnNavShareAvailabilityEvent,
  CnNavCancelEvent,
} from './nav-simulation-contracts.js';
import { CnNavSimulationError } from './nav-simulation-contracts.js';
import {
  expectedCutoffSchedule,
  navEventTimeReason,
  navLocalDate,
  navTime,
} from './nav-simulation-rules.js';
import {
  ledgerRejectCode,
  navFactRejectReason,
  settlementRejectReason,
} from './nav-simulation-guards.js';

interface InternalRequest extends CnNavRequestState {
  requestEventId?: string;
  navEventId?: string;
  fillAvailableAt?: string;
  sharesAvailable?: boolean;
  cashSettled?: boolean;
}

const toPublicRequestState = (value: InternalRequest): CnNavRequestState => {
  const request = { ...value };
  delete request.requestEventId;
  delete request.navEventId;
  delete request.fillAvailableAt;
  delete request.sharesAvailable;
  delete request.cashSettled;
  return request;
};

const parse = (value: string, label: string) => {
  try {
    return DecimalValue.from(value);
  } catch {
    throw new Error(`${label} 不是规范十进制值`);
  }
};

const requestAmount = (request: CnNavRequest) => {
  if (request.requestType === 'subscribe') {
    if (request.amount === undefined) throw new Error('申购必须提供 amount');
    return parse(request.amount, '申购金额');
  }
  if (request.shares === undefined) throw new Error('赎回必须提供 shares');
  return parse(request.shares, '赎回份额');
};

export const validateCnNavExecution = (instrument: SimulationExecutionInstrument) => {
  if (instrument.market !== 'CN' || instrument.assetType !== 'fund') {
    return {
      valid: false as const,
      code: 'UNSUPPORTED_CAPABILITY' as const,
      reason: 'NavExecution 只支持中国内地 NAV Fund',
    };
  }
  if (instrument.currency !== 'CNY') {
    return {
      valid: false as const,
      code: 'CURRENCY_MISMATCH' as const,
      reason: 'CN NAV Fund 执行币种必须为 CNY',
    };
  }
  return { valid: true as const };
};

export class CnNavSimulation {
  private readonly timezone: string;

  private readonly ledger: SimulationLedger;

  private readonly requests = new Map<string, InternalRequest>();

  private readonly results = new Map<string, CnNavEventResult>();

  private reservedSubscribeCash = DecimalValue.from('0');

  private reservedRedeemShares = DecimalValue.from('0');

  constructor(private readonly config: CnNavSimulationConfig) {
    const capability = validateCnNavExecution(config.executionInstrument);
    if (!capability.valid) throw new CnNavSimulationError(capability.code, capability.reason);
    this.ledger = new SimulationLedger(config.ledgerConfig);
    const ledgerInstrument = this.ledger.snapshot().position;
    if (
      config.executionInstrument.symbol !== ledgerInstrument.symbol ||
      config.executionInstrument.market !== ledgerInstrument.market ||
      config.executionInstrument.assetType !== ledgerInstrument.assetType ||
      config.executionInstrument.currency !== ledgerInstrument.currency
    ) {
      throw new CnNavSimulationError(
        'INSTRUMENT_MISMATCH',
        'NAV 标的必须与 SimulationLedger 执行标的一致',
      );
    }
    if (config.timeframe !== '1d') {
      throw new CnNavSimulationError('UNSUPPORTED_CAPABILITY', 'CN NAV Fund 只支持 1d');
    }
    this.timezone = config.calendar.timezone;
  }

  snapshot(): CnNavSimulationState {
    return {
      ledger: this.ledger.snapshot(),
      calendarVersion: this.config.calendarVersion,
      requests: [...this.requests.values()]
        .sort((left, right) => left.requestId.localeCompare(right.requestId))
        .map(toPublicRequestState),
    };
  }

  submitRequest(request: CnNavRequest, evaluationAt = request.availableAt) {
    return this.applyEvent({ type: 'request', payload: request }, evaluationAt);
  }

  applyEvent(event: CnNavSimulationEvent, evaluationAt?: string): CnNavEventResult {
    const eventEvaluationAt =
      evaluationAt ??
      (event.type === 'nav' ? event.payload.fact.availableAt : event.payload.availableAt);
    const requestId = 'requestId' in event.payload ? event.payload.requestId : undefined;
    if (this.results.has(event.payload.eventId)) {
      return this.reject(
        event.payload.eventId,
        'DUPLICATE_EVENT',
        'NAV Simulation Event 已经应用',
        requestId,
      );
    }
    let result: CnNavEventResult;
    if (event.type === 'request') result = this.applyRequest(event.payload, eventEvaluationAt);
    else if (event.type === 'cutoff') result = this.applyCutoff(event.payload, eventEvaluationAt);
    else if (event.type === 'nav') result = this.applyNav(event.payload, eventEvaluationAt);
    else if (event.type === 'confirmation')
      result = this.applyConfirmation(event.payload, eventEvaluationAt);
    else if (event.type === 'shareAvailable')
      result = this.applyShareAvailable(event.payload, eventEvaluationAt);
    else if (event.type === 'cashSettlement')
      result = this.applyCashSettlement(event.payload, eventEvaluationAt, false);
    else if (event.type === 'redemptionCash')
      result = this.applyCashSettlement(event.payload, eventEvaluationAt, true);
    else result = this.applyCancel(event.payload, eventEvaluationAt);
    if (result.applied || !['FUTURE_DATA', 'NAV_DELAYED'].includes(result.code ?? '')) {
      this.results.set(event.payload.eventId, result);
    }
    return result;
  }

  private applyRequest(request: CnNavRequest, evaluationAt: string): CnNavEventResult {
    const timing = navEventTimeReason(request, evaluationAt);
    if (timing) return this.reject(request.eventId, timing.code, timing.reason, request.requestId);
    if (navTime(request.requestAt) !== navTime(request.occurredAt)) {
      return this.reject(
        request.eventId,
        'INVALID_TIME',
        'requestAt 必须与 request occurredAt 一致',
        request.requestId,
      );
    }
    if (this.requests.has(request.requestId)) {
      return this.reject(
        request.eventId,
        'DUPLICATE_REQUEST',
        'requestId 已经提交',
        request.requestId,
      );
    }
    if (request.executionSymbol !== this.config.executionInstrument.symbol) {
      return this.reject(
        request.eventId,
        'INSTRUMENT_MISMATCH',
        'NAV 请求标的不是执行标的',
        request.requestId,
      );
    }
    let requested: DecimalValue;
    let fee: DecimalValue;
    try {
      requested = requestAmount(request);
      fee = parse(request.fee ?? '0', 'NAV 费用');
    } catch (error) {
      return this.reject(
        request.eventId,
        'INVALID_AMOUNT',
        error instanceof Error ? error.message : 'NAV 金额无效',
        request.requestId,
      );
    }
    if (!requested.isPositive() || fee.isNegative()) {
      return this.reject(
        request.eventId,
        'INVALID_AMOUNT',
        'NAV 金额/份额必须为正数，费用不能为负数',
        request.requestId,
      );
    }
    if (request.requestType === 'subscribe') {
      const cashNeeded = requested.plus(fee);
      const available = DecimalValue.from(this.ledger.availableCash('CNY')).minus(
        this.reservedSubscribeCash,
      );
      if (available.compareTo(cashNeeded) < 0) {
        return this.reject(
          request.eventId,
          'INSUFFICIENT_CASH',
          '申购只能使用已有 CNY 已结算现金',
          request.requestId,
        );
      }
      this.reservedSubscribeCash = this.reservedSubscribeCash.plus(cashNeeded);
    } else {
      const availableShares = DecimalValue.from(
        this.ledger.snapshot().position.settledQuantity,
      ).minus(this.reservedRedeemShares);
      if (availableShares.compareTo(requested) < 0) {
        return this.reject(
          request.eventId,
          'INSUFFICIENT_POSITION',
          '赎回只能使用已确认且可用份额',
          request.requestId,
        );
      }
      this.reservedRedeemShares = this.reservedRedeemShares.plus(requested);
    }
    this.requests.set(request.requestId, {
      requestId: request.requestId,
      requestEventId: request.eventId,
      requestType: request.requestType,
      executionSymbol: request.executionSymbol,
      status: 'pending',
      requestAt: request.requestAt,
      fee: fee.toString(),
      ...(request.requestType === 'subscribe'
        ? { requestedAmount: requested.toString() }
        : { requestedShares: requested.toString() }),
      sharesAvailable: false,
      cashSettled: false,
    });
    return this.applied(request.eventId, request.requestId);
  }

  private applyCutoff(event: CnNavCutoffEvent, evaluationAt: string): CnNavEventResult {
    const timing = navEventTimeReason(event, evaluationAt);
    if (timing) return this.reject(event.eventId, timing.code, timing.reason, event.requestId);
    const request = this.requests.get(event.requestId);
    if (!request)
      return this.reject(event.eventId, 'REQUEST_NOT_FOUND', 'NAV 请求不存在', event.requestId);
    if (request.status === 'cancelled')
      return this.reject(event.eventId, 'REQUEST_CANCELLED', 'NAV 请求已取消', event.requestId);
    if (request.cutoffAt)
      return this.reject(event.eventId, 'DUPLICATE_EVENT', 'NAV cutoff 已应用', event.requestId);
    if (
      !navLocalDate(event.cutoffAt, this.timezone) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(event.valuationDate)
    ) {
      return this.reject(
        event.eventId,
        'INVALID_TIME',
        'cutoff 或 valuationDate 无效',
        event.requestId,
      );
    }
    if (
      navTime(event.occurredAt) < navTime(event.cutoffAt) ||
      navTime(event.availableAt) < navTime(event.cutoffAt)
    ) {
      return this.reject(
        event.eventId,
        'RULE_REJECTED',
        'cutoff 事件只能在 cutoff 时点或之后可消费',
        event.requestId,
      );
    }
    const expected = expectedCutoffSchedule(
      request.requestAt,
      this.config.calendar,
      this.config.cutoffLocalTime,
    );
    if (
      !expected ||
      navTime(event.cutoffAt) !== navTime(expected.cutoffAt) ||
      event.valuationDate !== expected.valuationDate
    ) {
      return this.reject(
        event.eventId,
        'RULE_REJECTED',
        'cutoff 前后对应的 valuationDate 无效',
        event.requestId,
      );
    }
    request.cutoffAt = event.cutoffAt;
    request.valuationDate = event.valuationDate;
    return this.applied(event.eventId, event.requestId);
  }

  private applyNav(event: CnNavPricingEvent, evaluationAt: string): CnNavEventResult {
    const fact = event.fact;
    const timing = navEventTimeReason(fact, evaluationAt, 'NAV_DELAYED');
    if (timing) return this.reject(event.eventId, timing.code, timing.reason, event.requestId);
    const request = this.requests.get(event.requestId);
    if (!request)
      return this.reject(event.eventId, 'REQUEST_NOT_FOUND', 'NAV 请求不存在', event.requestId);
    if (request.status === 'cancelled')
      return this.reject(event.eventId, 'REQUEST_CANCELLED', 'NAV 请求已取消', event.requestId);
    if (!request.valuationDate)
      return this.reject(event.eventId, 'NAV_DELAYED', '尚未完成 cutoff', event.requestId);
    if (request.nav)
      return this.reject(event.eventId, 'DUPLICATE_EVENT', 'NAV 已应用', event.requestId);
    const factIssue = navFactRejectReason(fact, request);
    if (factIssue)
      return this.reject(event.eventId, factIssue.code, factIssue.reason, event.requestId);
    if (fact.nav === null)
      return this.reject(event.eventId, 'NAV_UNAVAILABLE', 'NAV Fact 不可用', event.requestId);
    let nav: DecimalValue;
    try {
      nav = parse(fact.nav, 'NAV');
    } catch (error) {
      return this.reject(
        event.eventId,
        'INVALID_AMOUNT',
        error instanceof Error ? error.message : 'NAV 无效',
        event.requestId,
      );
    }
    if (!nav.isPositive())
      return this.reject(event.eventId, 'NAV_UNAVAILABLE', 'NAV 必须为正数', event.requestId);
    request.nav = nav.toString();
    request.status = 'priced';
    request.navEventId = event.eventId;
    request.navOccurredAt = fact.occurredAt;
    request.navAvailableAt = fact.availableAt;
    request.navProvider = fact.provider;
    request.navProviderRevision = fact.providerRevision;
    request.navFreshness = fact.freshness;
    request.navQuality = fact.quality;
    return this.applied(event.eventId, event.requestId);
  }

  private applyConfirmation(event: CnNavConfirmationEvent, evaluationAt: string): CnNavEventResult {
    const timing = navEventTimeReason(event, evaluationAt);
    if (timing) return this.reject(event.eventId, timing.code, timing.reason, event.requestId);
    const request = this.requests.get(event.requestId);
    if (!request)
      return this.reject(event.eventId, 'REQUEST_NOT_FOUND', 'NAV 请求不存在', event.requestId);
    if (request.status === 'cancelled')
      return this.reject(event.eventId, 'REQUEST_CANCELLED', 'NAV 请求已取消', event.requestId);
    if (!request.nav || !request.navEventId)
      return this.reject(event.eventId, 'NAV_DELAYED', 'NAV 尚未 available', event.requestId);
    if (request.fillId)
      return this.reject(
        event.eventId,
        'DUPLICATE_EVENT',
        'NAV confirmation 已应用',
        event.requestId,
      );
    if (
      request.navOccurredAt === undefined ||
      request.navAvailableAt === undefined ||
      navTime(event.occurredAt) < navTime(request.navOccurredAt) ||
      navTime(event.occurredAt) < navTime(request.navAvailableAt) ||
      navTime(event.availableAt) < navTime(request.navAvailableAt)
    ) {
      return this.reject(
        event.eventId,
        'NAV_DELAYED',
        '确认不能早于 NAV availableAt',
        event.requestId,
      );
    }
    const fillId = `nav-fill:${request.requestId}`;
    const fee = request.fee;
    const nav = DecimalValue.from(request.nav);
    const quantity =
      request.requestType === 'subscribe'
        ? DecimalValue.from(request.requestedAmount!).dividedBy(nav)
        : DecimalValue.from(request.requestedShares!);
    const fillResult = this.ledger.applyFill(
      {
        eventId: fillId,
        fillId,
        executionSymbol: request.executionSymbol,
        side: request.requestType === 'subscribe' ? 'buy' : 'sell',
        quantity: quantity.toString(),
        price: nav.toString(),
        charges: [{ amount: fee, currency: 'CNY' }],
        currency: 'CNY',
        occurredAt: request.navOccurredAt,
        availableAt: event.availableAt,
      },
      evaluationAt,
    );
    if (!fillResult.applied) {
      const code = ledgerRejectCode(fillResult);
      if (request.requestType === 'subscribe')
        this.reservedSubscribeCash = this.reservedSubscribeCash.minus(
          DecimalValue.from(request.requestedAmount!).plus(fee),
        );
      else this.reservedRedeemShares = this.reservedRedeemShares.minus(quantity);
      request.status = 'rejected';
      request.reason = fillResult.reason;
      return this.reject(event.eventId, code, fillResult.reason, event.requestId);
    }
    if (request.requestType === 'subscribe') {
      this.reservedSubscribeCash = this.reservedSubscribeCash.minus(
        DecimalValue.from(request.requestedAmount!).plus(fee),
      );
      request.confirmedShares = quantity.toString();
      request.expectedCashSettlement = DecimalValue.from(request.requestedAmount!)
        .plus(fee)
        .toString();
    } else {
      this.reservedRedeemShares = this.reservedRedeemShares.minus(quantity);
      request.confirmedShares = quantity.toString();
      request.expectedCashSettlement = quantity.times(nav).minus(fee).toString();
    }
    request.fillId = fillId;
    request.fillAvailableAt = event.availableAt;
    request.confirmationAt = event.confirmationDate ?? event.occurredAt;
    request.status = 'confirmed';
    return this.applied(event.eventId, event.requestId);
  }

  private applyShareAvailable(
    event: CnNavShareAvailabilityEvent,
    evaluationAt: string,
  ): CnNavEventResult {
    const timing = navEventTimeReason(event, evaluationAt);
    if (timing) return this.reject(event.eventId, timing.code, timing.reason, event.requestId);
    const request = this.requests.get(event.requestId);
    if (!request)
      return this.reject(event.eventId, 'REQUEST_NOT_FOUND', 'NAV 请求不存在', event.requestId);
    if (request.requestType !== 'subscribe')
      return this.reject(event.eventId, 'RULE_REJECTED', '赎回不产生可用份额事件', event.requestId);
    if (!request.fillId || request.status === 'cancelled')
      return this.reject(
        event.eventId,
        request.status === 'cancelled' ? 'REQUEST_CANCELLED' : 'NAV_DELAYED',
        '申购尚未确认',
        event.requestId,
      );
    if (
      request.fillAvailableAt === undefined ||
      navTime(event.occurredAt) < navTime(request.fillAvailableAt) ||
      navTime(event.availableAt) < navTime(request.fillAvailableAt)
    ) {
      return this.reject(event.eventId, 'NAV_DELAYED', '份额可用不能早于确认', event.requestId);
    }
    if (request.sharesAvailable)
      return this.reject(event.eventId, 'DUPLICATE_EVENT', '份额可用事件已经应用', event.requestId);
    if (
      request.confirmedShares === undefined ||
      (() => {
        try {
          return DecimalValue.from(event.shares).compareTo(request.confirmedShares) !== 0;
        } catch {
          return true;
        }
      })()
    )
      return this.reject(
        event.eventId,
        'RULE_REJECTED',
        '份额可用数量与确认不一致',
        event.requestId,
      );
    const settlement = this.ledger.applySettlement(
      {
        eventId: event.eventId,
        sourceEventId: request.fillId,
        kind: 'position',
        symbol: request.executionSymbol,
        currency: 'CNY',
        occurredAt: event.occurredAt,
        availableAt: event.availableAt,
      },
      evaluationAt,
    );
    if (!settlement.applied)
      return this.reject(
        event.eventId,
        ledgerRejectCode(settlement),
        settlement.reason,
        event.requestId,
      );
    request.sharesAvailable = true;
    request.shareAvailableAt = event.availableAt;
    request.status = request.cashSettled ? 'settled' : 'shareAvailable';
    return this.applied(event.eventId, event.requestId);
  }

  private applyCashSettlement(
    event: CnNavCashSettlementEvent,
    evaluationAt: string,
    redemption: boolean,
  ): CnNavEventResult {
    const timing = navEventTimeReason(event, evaluationAt);
    if (timing) return this.reject(event.eventId, timing.code, timing.reason, event.requestId);
    const request = this.requests.get(event.requestId);
    if (!request)
      return this.reject(event.eventId, 'REQUEST_NOT_FOUND', 'NAV 请求不存在', event.requestId);
    const lifecycleIssue = settlementRejectReason(request, redemption);
    if (lifecycleIssue)
      return this.reject(
        event.eventId,
        lifecycleIssue.code,
        lifecycleIssue.reason,
        event.requestId,
      );
    if (
      request.fillAvailableAt === undefined ||
      navTime(event.occurredAt) < navTime(request.fillAvailableAt) ||
      navTime(event.availableAt) < navTime(request.fillAvailableAt)
    ) {
      return this.reject(event.eventId, 'NAV_DELAYED', '现金结算不能早于确认', event.requestId);
    }
    if (request.cashSettled)
      return this.reject(event.eventId, 'DUPLICATE_EVENT', '现金结算事件已经应用', event.requestId);
    let amount: DecimalValue;
    try {
      amount = parse(event.amount, '现金结算金额');
    } catch (error) {
      return this.reject(
        event.eventId,
        'INVALID_AMOUNT',
        error instanceof Error ? error.message : '现金结算金额无效',
        event.requestId,
      );
    }
    if (
      amount.isNegative() ||
      request.expectedCashSettlement === undefined ||
      amount.compareTo(request.expectedCashSettlement) !== 0
    ) {
      return this.reject(
        event.eventId,
        'RULE_REJECTED',
        '现金结算金额与确认结果不一致',
        event.requestId,
      );
    }
    if (request.fillId === undefined)
      return this.reject(event.eventId, 'NAV_DELAYED', 'NAV 尚未确认', event.requestId);
    const settlement = this.ledger.applySettlement(
      {
        eventId: event.eventId,
        sourceEventId: request.fillId,
        kind: 'cash',
        symbol: request.executionSymbol,
        currency: 'CNY',
        occurredAt: event.occurredAt,
        availableAt: event.availableAt,
      },
      evaluationAt,
    );
    if (!settlement.applied)
      return this.reject(
        event.eventId,
        ledgerRejectCode(settlement),
        settlement.reason,
        event.requestId,
      );
    request.cashSettled = true;
    if (redemption) request.redemptionCashAt = event.availableAt;
    request.status =
      request.requestType === 'subscribe' && !request.sharesAvailable ? 'confirmed' : 'settled';
    return this.applied(event.eventId, event.requestId);
  }

  private applyCancel(event: CnNavCancelEvent, evaluationAt: string): CnNavEventResult {
    const timing = navEventTimeReason(event, evaluationAt);
    if (timing) return this.reject(event.eventId, timing.code, timing.reason, event.requestId);
    const request = this.requests.get(event.requestId);
    if (!request)
      return this.reject(event.eventId, 'REQUEST_NOT_FOUND', 'NAV 请求不存在', event.requestId);
    if (request.status !== 'pending' && request.status !== 'priced') {
      return this.reject(
        event.eventId,
        'RULE_REJECTED',
        '已确认或已结算请求不能取消',
        event.requestId,
      );
    }
    if (request.requestType === 'subscribe')
      this.reservedSubscribeCash = this.reservedSubscribeCash.minus(
        DecimalValue.from(request.requestedAmount!).plus(request.fee),
      );
    else this.reservedRedeemShares = this.reservedRedeemShares.minus(request.requestedShares!);
    request.status = 'cancelled';
    request.reason = event.reason ?? '请求已取消';
    return this.applied(event.eventId, event.requestId);
  }

  private applied(eventId: string, requestId: string): CnNavAppliedEvent {
    return { applied: true, eventId, requestId, state: this.snapshot() };
  }

  private reject(
    eventId: string,
    code: CnNavSimulationRejectCode,
    reason: string,
    requestId?: string,
  ): CnNavRejectedEvent {
    return {
      applied: false,
      eventId,
      ...(requestId === undefined ? {} : { requestId }),
      code,
      reason,
      state: this.snapshot(),
    };
  }
}

export const replayCnNavSimulation = (
  config: CnNavSimulationConfig,
  events: readonly CnNavSimulationEvent[],
) => {
  const simulation = new CnNavSimulation(config);
  const results = events.map((event) => simulation.applyEvent(event));
  return { simulation, results, state: simulation.snapshot() };
};

export const NavSimulation = CnNavSimulation;
export type NavSimulationEvent = CnNavSimulationEvent;
export type NavSimulationState = CnNavSimulationState;
export type NavSimulationRejectCode = CnNavSimulationRejectCode;
