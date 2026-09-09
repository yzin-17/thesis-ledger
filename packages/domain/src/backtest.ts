import { VersionedExecutionRules } from './execution-rules.js';
import type { TradingCalendar } from './trading-calendar.js';

export interface ExecutionConstraint {
  tPlusOne: boolean;
  lotSize: number;
  commissionRate: number;
  minimumCommission: number;
  stampDutyRate: number;
  slippageRate: number;
}

export interface OrderCandidate {
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  previousClose: number;
  suspended?: boolean;
  boughtAt?: string;
  tradingDate: string;
}

export interface ExecutionDecision {
  accepted: boolean;
  quantity: number;
  fillPrice: number;
  fees: number;
  commission?: number;
  stampDuty?: number;
  slippageCost?: number;
  reason?: string;
}

const legacyBacktestCalendar: TradingCalendar = {
  market: 'CN',
  timezone: 'Asia/Shanghai',
  status(value) {
    const date = (value instanceof Date ? value.toISOString() : value).slice(0, 10);
    return { market: 'CN', date, open: true, reason: 'open' };
  },
  sessionStatus(value) {
    const date = (value instanceof Date ? value.toISOString() : value).slice(0, 10);
    return { market: 'CN', date, open: true, reason: 'open' };
  },
  isTradingDay() {
    return true;
  },
  isTradingSession() {
    return true;
  },
  sessionsForDate() {
    return [{ start: 0, end: 1440 }];
  },
};

const legacyRejectReason = (reasonCode: string, fallback: string) => {
  if (reasonCode === 'SUSPENDED') return '停牌';
  if (reasonCode === 'POSITION_NOT_SETTLED') return 'T+1 限制';
  if (reasonCode === 'PRICE_LIMIT' || reasonCode === 'INVALID_TICK') return '超出涨跌停价格';
  if (reasonCode === 'INVALID_QUANTITY') return '不足最小交易单位';
  return fallback;
};

export const simulateAStockExecution = (
  order: OrderCandidate,
  constraint: ExecutionConstraint,
): ExecutionDecision => {
  const rules = new VersionedExecutionRules({
    version: 'legacy-a-share-v1',
    calendar: legacyBacktestCalendar,
    calendarProvider: 'legacy-backtest-v1',
    calendarProviderRevision: 'legacy-always-open-v1',
    calendarAvailableAt: '1970-01-01T00:00:00.000Z',
    instrument: {
      symbol: 'LEGACY.CN',
      market: 'CN',
      instrumentType: 'STOCK',
      currency: 'CNY',
      lotSize: String(constraint.lotSize),
      tickSize: '0.00000001',
      tradable: true,
      provider: 'legacy-backtest-v1',
      providerRevision: 'legacy-a-share-v1',
      occurredAt: '1970-01-01T00:00:00.000Z',
      availableAt: '1970-01-01T00:00:00.000Z',
    },
    order: {
      type: 'Market',
      timeInForce: 'DAY',
      executionTiming: 'nextEligibleBarOpen',
      fillPolicy: 'full-or-reject',
      longOnly: true,
    },
    price: { reference: 'previousClose', maxUpRatio: '0.1', maxDownRatio: '0.1' },
    positionSettlement: { sellableAfterTradingDays: constraint.tPlusOne ? 1 : 0 },
    cashSettlement: { buyDebitAfterTradingDays: 0, sellCreditAfterTradingDays: 0 },
    statutoryCharges: [
      { code: 'STAMP_DUTY', side: 'sell', rate: String(constraint.stampDutyRate) },
    ],
  });
  const evaluatedAt = `${order.tradingDate}T01:30:00.000Z`;
  const decision = rules.evaluate({
    symbol: 'LEGACY.CN',
    market: 'CN',
    side: order.side,
    quantity: String(order.quantity),
    rawPrice: String(order.price),
    previousClose: String(order.previousClose),
    evaluatedAt,
    ...(order.suspended === undefined ? {} : { suspended: order.suspended }),
    ...(order.boughtAt === undefined ? {} : { acquiredOn: order.boughtAt }),
    ...(order.side === 'sell' ? { availableQuantity: String(order.quantity) } : {}),
  });
  if (!decision.accepted) {
    return {
      accepted: false,
      quantity: 0,
      fillPrice: order.price,
      fees: 0,
      reason: legacyRejectReason(decision.reasonCode, decision.reason),
    };
  }
  const quantity = Number(decision.normalizedQuantity);
  const fillPrice = order.price * (1 + (order.side === 'buy' ? 1 : -1) * constraint.slippageRate);
  const turnover = quantity * fillPrice;
  const commission = Math.max(constraint.minimumCommission, turnover * constraint.commissionRate);
  const statutoryCharges = rules.statutoryCharges(order.side, String(turnover));
  const stampDuty = statutoryCharges.reduce((sum, charge) => sum + Number(charge.amount), 0);
  return {
    accepted: true,
    quantity,
    fillPrice,
    fees: commission + stampDuty,
    commission,
    stampDuty,
    slippageCost: Math.abs(fillPrice - order.price) * quantity,
  };
};
