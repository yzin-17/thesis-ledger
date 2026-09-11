import { DecimalValue } from './decimal.js';
import type {
  TradingCalendar,
  TradingDayStatus,
  TradingMarket,
  TradingSessionStatus,
  TradingSessionWindow,
} from './trading-calendar.js';
import type { FrozenExchangeExecutionModelSegment } from './backtest-execution-model.js';

export type ExecutionSide = 'buy' | 'sell';
export type ExecutionRuleRejectCode =
  | 'MARKET_CLOSED'
  | 'CALENDAR_UNAVAILABLE'
  | 'OUTSIDE_SESSION'
  | 'INSTRUMENT_NOT_TRADABLE'
  | 'SUSPENDED'
  | 'UNSUPPORTED_ORDER'
  | 'LONG_ONLY'
  | 'POSITION_NOT_SETTLED'
  | 'INSUFFICIENT_POSITION'
  | 'INVALID_QUANTITY'
  | 'INVALID_TICK'
  | 'PRICE_LIMIT';

export interface ExecutionInstrumentFact {
  symbol: string;
  market: TradingMarket;
  instrumentType: 'STOCK' | 'ETF';
  currency: 'CNY' | 'HKD' | 'USD';
  lotSize: string;
  tickSize: string;
  tradable: boolean;
  provider: string;
  providerRevision: string;
  occurredAt: string;
  availableAt: string;
}

export interface ExecutionCalendarFact {
  market: TradingMarket;
  timezone: string;
  provider: string;
  providerRevision: string;
  availableAt: string;
  sessions: readonly { startMinute: number; endMinute: number }[];
  sessionOverrides: readonly {
    date: string;
    sessions: readonly { startMinute: number; endMinute: number }[];
  }[];
  holidays: readonly string[];
  range: { start: string | null; end: string | null };
}

export interface ExecutionRuleFacts {
  version: string;
  calendar: TradingCalendar;
  calendarProvider: string;
  calendarProviderRevision: string;
  calendarAvailableAt: string;
  instrument: ExecutionInstrumentFact;
  order: {
    type: 'Market';
    timeInForce: 'DAY';
    executionTiming: 'nextEligibleBarOpen';
    fillPolicy: 'full-or-reject';
    longOnly: true;
  };
  price: {
    reference: 'previousClose';
    maxUpRatio?: string;
    maxDownRatio?: string;
    rounding?: 'halfUpToTick';
    minimumDistanceTicks?: number;
    minimumPriceTicks?: number;
  };
  positionSettlement: { sellableAfterTradingDays: number };
  cashSettlement: {
    buyDebitAfterTradingDays: number;
    sellCreditAfterTradingDays: number;
  };
  statutoryCharges: readonly {
    code: string;
    side: ExecutionSide | 'both';
    rate: string;
    minimum?: string;
  }[];
}

export interface ExecutionOrderCandidate {
  symbol: string;
  market: TradingMarket;
  side: ExecutionSide;
  quantity: string;
  rawPrice: string;
  previousClose: string;
  evaluatedAt: string;
  orderType?: 'Market' | 'Limit';
  timeInForce?: 'DAY' | 'GTC';
  suspended?: boolean;
  acquiredOn?: string;
  availableQuantity?: string;
}

export interface ExecutionRuleTrace {
  ruleVersion: string;
  calendarProvider: string;
  calendarProviderRevision: string;
  calendarAvailableAt: string;
  instrumentProvider: string;
  instrumentProviderRevision: string;
  instrumentAvailableAt: string;
  evaluatedAt: string;
}

export interface ExecutionRuleRejection {
  accepted: false;
  code: 'RULE_REJECTED';
  reasonCode: ExecutionRuleRejectCode;
  reason: string;
  normalizedQuantity: string;
  trace: ExecutionRuleTrace;
}

export interface ExecutionRuleAcceptance {
  accepted: true;
  normalizedQuantity: string;
  normalizedPrice?: string;
  trace: ExecutionRuleTrace;
}

export type ExecutionRuleDecision = ExecutionRuleAcceptance | ExecutionRuleRejection;

export interface SettlementDates {
  positionAvailableOn: string;
  cashAvailableOn: string;
}

export interface StatutoryCharge {
  code: string;
  amount: string;
  currency: ExecutionInstrumentFact['currency'];
}

const factLocalDateTime = (value: Date | string, timezone: string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('无效日期');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday!,
    minute: Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60,
  };
};

/** Adapts frozen DSA calendar facts without reaching back to a live provider. */
export const tradingCalendarFromFact = (fact: ExecutionCalendarFact): TradingCalendar => {
  const sessions: readonly TradingSessionWindow[] = fact.sessions.map((session) => ({
    start: session.startMinute,
    end: session.endMinute,
  }));
  const sessionOverrides = new Map(
    fact.sessionOverrides.map((override) => [
      override.date,
      override.sessions.map((session) => ({
        start: session.startMinute,
        end: session.endMinute,
      })),
    ]),
  );
  const sessionsForDate = (date: string) => sessionOverrides.get(date) ?? sessions;
  const holidays = new Set(fact.holidays);
  const status = (value: Date | string): TradingDayStatus => {
    const local = factLocalDateTime(value, fact.timezone);
    if (
      !fact.range.start ||
      !fact.range.end ||
      local.date < fact.range.start ||
      local.date > fact.range.end
    ) {
      return { market: fact.market, date: local.date, open: false, reason: 'calendar-unavailable' };
    }
    if (local.weekday === 'Sat' || local.weekday === 'Sun') {
      return { market: fact.market, date: local.date, open: false, reason: 'weekend' };
    }
    if (holidays.has(local.date)) {
      return { market: fact.market, date: local.date, open: false, reason: 'exchange-holiday' };
    }
    return { market: fact.market, date: local.date, open: true, reason: 'open' };
  };
  const sessionStatus = (value: Date | string): TradingSessionStatus => {
    const day = status(value);
    if (!day.open) return day;
    const local = factLocalDateTime(value, fact.timezone);
    const open = sessionsForDate(local.date).some(
      (session) => local.minute >= session.start && local.minute < session.end,
    );
    return { ...day, open, reason: open ? 'open' : 'outside-session' };
  };
  return {
    market: fact.market,
    timezone: fact.timezone,
    status,
    sessionStatus,
    isTradingDay: (value) => status(value).open,
    isTradingSession: (value) => sessionStatus(value).open,
    sessionsForDate: (value) => {
      const day = status(value);
      if (!day.open) return [];
      return sessionsForDate(day.date);
    },
  };
};

const normalizedDown = (value: DecimalValue, step: DecimalValue) => {
  if (!value.isPositive() || !step.isPositive()) return DecimalValue.from('0');
  let units = value.dividedBy(step, 0);
  let normalized = units.times(step);
  if (normalized.compareTo(value) > 0) {
    units = units.minus('1');
    normalized = units.times(step);
  }
  return normalized;
};

const isTickAligned = (value: DecimalValue, tick: DecimalValue) => {
  if (!value.isPositive() || !tick.isPositive()) return false;
  return value.dividedBy(tick, 0).times(tick).compareTo(value) === 0;
};

const roundedLimit = (
  reference: DecimalValue,
  ratio: string,
  tick: DecimalValue,
  direction: 'up' | 'down',
  minimumDistanceTicks?: number,
) => {
  const multiplier =
    direction === 'up'
      ? DecimalValue.from('1').plus(ratio)
      : DecimalValue.from('1').minus(ratio);
  let limit = reference.times(multiplier).dividedBy(tick, 0).times(tick);
  if (minimumDistanceTicks !== undefined) {
    const minimumDistance = tick.times(minimumDistanceTicks.toString());
    const minimumLimit =
      direction === 'up' ? reference.plus(minimumDistance) : reference.minus(minimumDistance);
    if (
      (direction === 'up' && limit.compareTo(minimumLimit) < 0) ||
      (direction === 'down' && limit.compareTo(minimumLimit) > 0)
    ) {
      limit = minimumLimit;
    }
  }
  return limit;
};

const dateAfterTradingDays = (
  calendar: TradingCalendar,
  tradingDate: string,
  tradingDays: number,
) => {
  if (tradingDays <= 0) return tradingDate;
  const cursor = new Date(`${tradingDate}T12:00:00Z`);
  let remaining = tradingDays;
  let inspectedDays = 0;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    inspectedDays += 1;
    if (inspectedDays > 3660) throw new Error('交易日历覆盖不足，无法计算结算日');
    if (calendar.isTradingDay(cursor)) remaining -= 1;
  }
  return calendar.status(cursor).date;
};

/**
 * Versioned execution rules for the isolated backtest domain.
 *
 * The module owns orchestration while calendars, instruments and market charges
 * remain immutable input facts. It never reads a real account or ledger.
 */
export class VersionedExecutionRules {
  constructor(private readonly facts: ExecutionRuleFacts) {
    if (facts.instrument.market !== facts.calendar.market) {
      throw new Error('交易日历与标的市场不一致');
    }
    if (
      !Number.isInteger(facts.positionSettlement.sellableAfterTradingDays) ||
      facts.positionSettlement.sellableAfterTradingDays < 0
    ) {
      throw new Error('持仓结算交易日必须是非负整数');
    }
    const settlementDays = [
      facts.cashSettlement.buyDebitAfterTradingDays,
      facts.cashSettlement.sellCreditAfterTradingDays,
    ];
    if (settlementDays.some((days) => !Number.isInteger(days) || days < 0)) {
      throw new Error('现金结算交易日必须是非负整数');
    }
    if (!DecimalValue.from(facts.instrument.lotSize).isPositive()) {
      throw new Error('lotSize 必须为正数');
    }
    if (!DecimalValue.from(facts.instrument.tickSize).isPositive()) {
      throw new Error('tickSize 必须为正数');
    }
    for (const ratio of [facts.price.maxUpRatio, facts.price.maxDownRatio]) {
      if (ratio !== undefined && DecimalValue.from(ratio).isNegative()) {
        throw new Error('价格限制比例不能为负数');
      }
    }
    if (facts.price.rounding === 'halfUpToTick') {
      for (const ticks of [facts.price.minimumDistanceTicks, facts.price.minimumPriceTicks]) {
        if (ticks !== undefined && (!Number.isInteger(ticks) || ticks < 1)) {
          throw new Error('价格限制 tick 参数必须为正整数');
        }
      }
    }
    for (const charge of facts.statutoryCharges) {
      if (DecimalValue.from(charge.rate).isNegative()) throw new Error('市场费率不能为负数');
      if (charge.minimum !== undefined && DecimalValue.from(charge.minimum).isNegative()) {
        throw new Error('市场最低费用不能为负数');
      }
    }
  }

  get ruleVersion() {
    return this.facts.version;
  }

  get orderRules() {
    return this.facts.order;
  }

  get instrumentCurrency() {
    return this.facts.instrument.currency;
  }

  get instrumentFact() {
    return this.facts.instrument;
  }

  /** Builds an execution-only rules view without reusing legacy charges. */
  withExecutionModel(
    segment: FrozenExchangeExecutionModelSegment,
    ruleVersion = `execution-model-v1:${segment.id}`,
  ) {
    if (segment.execution.calendarMarket !== this.facts.instrument.market) {
      throw new Error('执行模型日历市场与标的不一致');
    }
    if (segment.fees.currency !== this.facts.instrument.currency) {
      throw new Error('执行模型费用币种与标的不一致');
    }
    const price =
      segment.execution.price.kind === 'dailyLimit'
        ? {
            reference: 'previousClose' as const,
            maxUpRatio: segment.execution.price.maxUpRatio,
            maxDownRatio: segment.execution.price.maxDownRatio,
            rounding: 'halfUpToTick' as const,
            minimumDistanceTicks: segment.execution.price.minimumDistanceTicks,
            minimumPriceTicks: segment.execution.price.minimumPriceTicks,
          }
        : { reference: 'previousClose' as const };
    return new VersionedExecutionRules({
      ...this.facts,
      version: ruleVersion,
      price,
      positionSettlement: {
        sellableAfterTradingDays: segment.execution.sellableAfterTradingDays,
      },
      cashSettlement: {
        buyDebitAfterTradingDays: segment.execution.buyDebitAt === 'fill' ? 0 : 0,
        sellCreditAfterTradingDays: segment.execution.saleReinvestableAfterTradingDays,
      },
      statutoryCharges: [],
    });
  }

  private trace(evaluatedAt: string): ExecutionRuleTrace {
    return {
      ruleVersion: this.facts.version,
      calendarProvider: this.facts.calendarProvider,
      calendarProviderRevision: this.facts.calendarProviderRevision,
      calendarAvailableAt: this.facts.calendarAvailableAt,
      instrumentProvider: this.facts.instrument.provider,
      instrumentProviderRevision: this.facts.instrument.providerRevision,
      instrumentAvailableAt: this.facts.instrument.availableAt,
      evaluatedAt,
    };
  }

  private reject(
    input: ExecutionOrderCandidate,
    reasonCode: ExecutionRuleRejectCode,
    reason: string,
    normalizedQuantity = '0',
  ): ExecutionRuleRejection {
    return {
      accepted: false,
      code: 'RULE_REJECTED',
      reasonCode,
      reason,
      normalizedQuantity,
      trace: this.trace(input.evaluatedAt),
    };
  }

  evaluate(input: ExecutionOrderCandidate): ExecutionRuleDecision {
    const trace = this.trace(input.evaluatedAt);
    if (
      input.symbol !== this.facts.instrument.symbol ||
      input.market !== this.facts.instrument.market
    ) {
      return this.reject(input, 'INSTRUMENT_NOT_TRADABLE', '订单标的与规则事实不匹配');
    }
    const evaluatedAt = new Date(input.evaluatedAt).getTime();
    const instrumentAvailableAt = new Date(this.facts.instrument.availableAt).getTime();
    const calendarAvailableAt = new Date(this.facts.calendarAvailableAt).getTime();
    if (!Number.isFinite(evaluatedAt) || !Number.isFinite(instrumentAvailableAt)) {
      return this.reject(input, 'INSTRUMENT_NOT_TRADABLE', '评估时间或 Instrument Fact 时间无效');
    }
    if (!Number.isFinite(calendarAvailableAt)) {
      return this.reject(input, 'CALENDAR_UNAVAILABLE', 'Calendar Fact 时间无效');
    }
    if (calendarAvailableAt > evaluatedAt) {
      return this.reject(input, 'CALENDAR_UNAVAILABLE', 'Calendar Fact 在评估时尚不可用');
    }
    if (instrumentAvailableAt > evaluatedAt) {
      return this.reject(input, 'INSTRUMENT_NOT_TRADABLE', 'Instrument Fact 在评估时尚不可用');
    }
    const day = this.facts.calendar.status(input.evaluatedAt);
    if (!day.open) return this.reject(input, 'MARKET_CLOSED', `市场不开市：${day.reason}`);
    if (!this.facts.calendar.isTradingSession(input.evaluatedAt)) {
      return this.reject(input, 'OUTSIDE_SESSION', '不在交易 Session 内');
    }
    if (!this.facts.instrument.tradable) {
      return this.reject(input, 'INSTRUMENT_NOT_TRADABLE', '标的当前不可交易');
    }
    if (input.suspended) return this.reject(input, 'SUSPENDED', '标的停牌');
    if ((input.orderType ?? 'Market') !== 'Market' || (input.timeInForce ?? 'DAY') !== 'DAY') {
      return this.reject(input, 'UNSUPPORTED_ORDER', '仅支持 Market + DAY');
    }

    let quantity: DecimalValue;
    let rawPrice: DecimalValue;
    let previousClose: DecimalValue;
    try {
      quantity = DecimalValue.from(input.quantity);
      rawPrice = DecimalValue.from(input.rawPrice);
      previousClose = DecimalValue.from(input.previousClose);
    } catch {
      return this.reject(input, 'INVALID_QUANTITY', '数量或价格不是规范十进制值');
    }
    const normalizedQuantity = normalizedDown(
      quantity,
      DecimalValue.from(this.facts.instrument.lotSize),
    ).toString();
    if (normalizedQuantity === '0') {
      return this.reject(input, 'INVALID_QUANTITY', '数量不足最小交易单位');
    }
    const tick = DecimalValue.from(this.facts.instrument.tickSize);
    const normalizedPrice = this.normalizePrice(rawPrice);
    if (!isTickAligned(normalizedPrice, tick)) {
      return this.reject(input, 'INVALID_TICK', '价格不符合最小变动单位', normalizedQuantity);
    }
    if (!normalizedPrice.isPositive() || !previousClose.isPositive()) {
      return this.reject(input, 'PRICE_LIMIT', '价格和前收盘价必须为正数', normalizedQuantity);
    }
    const minimumPriceTicks = this.facts.price.minimumPriceTicks;
    if (
      minimumPriceTicks !== undefined &&
      normalizedPrice.compareTo(tick.times(minimumPriceTicks.toString())) < 0
    ) {
      return this.reject(input, 'PRICE_LIMIT', '价格低于规则最低 tick', normalizedQuantity);
    }
    if (this.facts.price.rounding === 'halfUpToTick') {
      if (this.facts.price.maxUpRatio) {
        const upperLimit = roundedLimit(
          previousClose,
          this.facts.price.maxUpRatio,
          tick,
          'up',
          this.facts.price.minimumDistanceTicks,
        );
        if (normalizedPrice.compareTo(upperLimit) > 0) {
          return this.reject(input, 'PRICE_LIMIT', '价格高于规则上限', normalizedQuantity);
        }
      }
      if (this.facts.price.maxDownRatio) {
        const lowerLimit = roundedLimit(
          previousClose,
          this.facts.price.maxDownRatio,
          tick,
          'down',
          this.facts.price.minimumDistanceTicks,
        );
        if (normalizedPrice.compareTo(lowerLimit) < 0) {
          return this.reject(input, 'PRICE_LIMIT', '价格低于规则下限', normalizedQuantity);
        }
      }
    } else {
      const change = normalizedPrice.minus(previousClose).dividedBy(previousClose);
      if (this.facts.price.maxUpRatio && change.compareTo(this.facts.price.maxUpRatio) > 0) {
        return this.reject(input, 'PRICE_LIMIT', '价格高于规则上限', normalizedQuantity);
      }
      if (
        this.facts.price.maxDownRatio &&
        change.compareTo(DecimalValue.from(this.facts.price.maxDownRatio).times('-1')) < 0
      ) {
        return this.reject(input, 'PRICE_LIMIT', '价格低于规则下限', normalizedQuantity);
      }
    }
    if (input.side === 'sell') {
      const available = DecimalValue.from(input.availableQuantity ?? '0');
      if (available.compareTo(normalizedQuantity) < 0) {
        return this.reject(input, 'INSUFFICIENT_POSITION', '可卖持仓不足', normalizedQuantity);
      }
      if (input.acquiredOn) {
        const sellableOn = dateAfterTradingDays(
          this.facts.calendar,
          input.acquiredOn,
          this.facts.positionSettlement.sellableAfterTradingDays,
        );
        if (day.date < sellableOn) {
          return this.reject(
            input,
            'POSITION_NOT_SETTLED',
            `持仓将于 ${sellableOn} 可卖`,
            normalizedQuantity,
          );
        }
      }
    }
    return {
      accepted: true,
      normalizedQuantity,
      ...(this.facts.price.rounding === 'halfUpToTick'
        ? { normalizedPrice: normalizedPrice.toString() }
        : {}),
      trace,
    };
  }

  normalizePrice(value: string | DecimalValue) {
    const price = DecimalValue.from(value);
    if (this.facts.price.rounding !== 'halfUpToTick') return price;
    return price
      .dividedBy(this.facts.instrument.tickSize, 0)
      .times(this.facts.instrument.tickSize);
  }

  settlementDates(side: ExecutionSide, tradingDate: string): SettlementDates {
    const positionDays =
      side === 'buy' ? this.facts.positionSettlement.sellableAfterTradingDays : 0;
    const cashDays =
      side === 'buy'
        ? this.facts.cashSettlement.buyDebitAfterTradingDays
        : this.facts.cashSettlement.sellCreditAfterTradingDays;
    return {
      positionAvailableOn: dateAfterTradingDays(this.facts.calendar, tradingDate, positionDays),
      cashAvailableOn: dateAfterTradingDays(this.facts.calendar, tradingDate, cashDays),
    };
  }

  statutoryCharges(side: ExecutionSide, turnover: string): StatutoryCharge[] {
    const value = DecimalValue.from(turnover);
    if (value.isNegative()) throw new Error('成交金额不能为负数');
    return this.facts.statutoryCharges
      .filter((charge) => charge.side === 'both' || charge.side === side)
      .map((charge) => {
        let amount = value.times(charge.rate);
        if (charge.minimum && amount.compareTo(charge.minimum) < 0) {
          amount = DecimalValue.from(charge.minimum);
        }
        return {
          code: charge.code,
          amount: amount.toString(),
          currency: this.facts.instrument.currency,
        };
      });
  }
}
