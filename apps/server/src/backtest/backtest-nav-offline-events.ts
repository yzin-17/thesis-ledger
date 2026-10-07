import {
  expectedCutoffSchedule,
  navLocalDate,
  resolveExecutionModelSegment,
  tradingDateAfter,
  type CnNavRequest,
  type CnNavRequestState,
  type CnNavSimulationEvent,
  type FrozenNavExecutionModelSegment,
} from '@thesis-ledger/domain';
import { compareMarketPitEvidenceInstantStringsV1 } from '@thesis-ledger/schemas';
import type { adaptNavDomainInputsV3 } from './backtest-nav-domain-input.js';

export type NavOfflineInputs = ReturnType<typeof adaptNavDomainInputsV3>;
export interface NavOfflineEvent {
  event: CnNavSimulationEvent;
  evaluationAt: string;
  phase: number;
}

export const compareNavOfflineTime = (left: string, right: string): number => {
  const result = compareMarketPitEvidenceInstantStringsV1(left, right);
  if (result === undefined) throw new Error('NAV 离线时刻无效');
  return result;
};

const later = (left: string, right: string) =>
  compareNavOfflineTime(left, right) >= 0 ? left : right;

export const navOfflineEventVisible = (item: NavOfflineEvent): boolean => {
  const payload = item.event.payload;
  if ('requestAt' in payload && compareNavOfflineTime(payload.requestAt, payload.occurredAt) !== 0)
    return false;
  const time = 'fact' in payload ? payload.fact : payload;
  return (
    compareNavOfflineTime(time.occurredAt, time.availableAt) <= 0 &&
    compareNavOfflineTime(time.availableAt, item.evaluationAt) <= 0
  );
};

export const navOfflineExecutionDay = (input: NavOfflineInputs, requestAt: string): boolean => {
  const day = navLocalDate(requestAt, input.config.calendar.timezone);
  return (
    !!day &&
    day >= input.plan.runWindow.startDate &&
    day <= input.plan.runWindow.endDate &&
    input.config.calendar.isTradingDay(requestAt)
  );
};

export const navOfflineEventIssue = (input: NavOfflineInputs, item: NavOfflineEvent) => {
  if (
    item.event.type === 'request' &&
    !navOfflineExecutionDay(input, item.event.payload.requestAt)
  ) {
    return { code: 'OUTSIDE_EXECUTION_WINDOW', reason: '预热或非执行处理日不能申请交易' };
  }
  if (!navOfflineEventVisible(item)) {
    return { code: 'INVALID_TIME', reason: 'NAV 离线事件时间或微秒可见性不符' };
  }
  return undefined;
};

export const navOfflineSegment = (input: NavOfflineInputs, request: CnNavRequest) =>
  resolveExecutionModelSegment<FrozenNavExecutionModelSegment>(
    input.config.executionModel! as typeof input.config.executionModel & {
      segments: readonly FrozenNavExecutionModelSegment[];
    },
    {
      expectedVersion: input.plan.executionModel.version,
      symbol: request.executionSymbol,
      market: 'CN',
      instrumentType: 'NAV_FUND',
      currency: 'CNY',
      evaluatedAt: request.requestAt,
      dataAsOf: input.config.dataAsOf!,
    },
  );

/** 日期合同没有交易时段；日期延迟以处理日零点为下界，再等待实际可见时刻。 */
const processingAt = (input: NavOfflineInputs, date: string, days: number, notBefore: string) => {
  const day = tradingDateAfter(input.config.calendar, date, days);
  if (!day) throw new Error('NAV 离线处理日期预算不足');
  return later(`${day}T00:00:00+08:00`, notBefore);
};

export const navOfflineCutoff = (input: NavOfflineInputs, request: CnNavRequest) => {
  const segment = navOfflineSegment(input, request);
  const schedule = expectedCutoffSchedule(
    request.requestAt,
    input.config.calendar,
    segment.execution.cutoffLocalTime,
  );
  if (!schedule) throw new Error('NAV 离线截止日期不可用');
  const at = later(schedule.cutoffAt, request.availableAt);
  return {
    schedule,
    segment,
    item: {
      phase: 1,
      evaluationAt: at,
      event: {
        type: 'cutoff',
        payload: {
          eventId: `${request.requestId}:cutoff`,
          requestId: request.requestId,
          cutoffAt: schedule.cutoffAt,
          valuationDate: schedule.valuationDate,
          occurredAt: at,
          availableAt: at,
        },
      },
    } satisfies NavOfflineEvent,
  };
};

export const navOfflineConfirmation = (
  input: NavOfflineInputs,
  requestId: string,
  segment: FrozenNavExecutionModelSegment,
  valuationDate: string,
  pricedAt: string,
): NavOfflineEvent => {
  const at = processingAt(
    input,
    valuationDate,
    segment.execution.confirmationAfterTradingDays,
    pricedAt,
  );
  return {
    phase: 3,
    evaluationAt: at,
    event: {
      type: 'confirmation',
      payload: {
        eventId: `${requestId}:confirmation`,
        requestId,
        occurredAt: at,
        availableAt: at,
      },
    },
  };
};

/** 金额、费用与份额只消费经济内核确认结果，编排层不重复计算。 */
export const navOfflineSettlements = (
  input: NavOfflineInputs,
  request: CnNavRequestState,
  segment: FrozenNavExecutionModelSegment,
): NavOfflineEvent[] => {
  const confirmationAt = request.confirmationAt!;
  const date = navLocalDate(confirmationAt, input.config.calendar.timezone)!;
  const events: NavOfflineEvent[] = [];
  if (request.requestType === 'subscribe') {
    const at = processingAt(
      input,
      date,
      segment.execution.sellableAfterConfirmationTradingDays,
      confirmationAt,
    );
    events.push({
      phase: 4,
      evaluationAt: at,
      event: {
        type: 'shareAvailable',
        payload: {
          eventId: `${request.requestId}:shares`,
          requestId: request.requestId,
          shares: request.confirmedShares!,
          occurredAt: at,
          availableAt: at,
        },
      },
    });
  }
  let at = confirmationAt;
  if (request.requestType === 'redeem') {
    at = processingAt(
      input,
      date,
      segment.execution.redemptionReinvestableAfterConfirmationTradingDays,
      confirmationAt,
    );
  }
  events.push({
    phase: 5,
    evaluationAt: at,
    event: {
      type: request.requestType === 'subscribe' ? 'cashSettlement' : 'redemptionCash',
      payload: {
        eventId: `${request.requestId}:cash`,
        requestId: request.requestId,
        amount: request.expectedCashSettlement!,
        occurredAt: at,
        availableAt: at,
      },
    },
  });
  return events;
};
