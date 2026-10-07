import type { z } from 'zod';
import {
  backtestNavPlanningCalendarV3Schema as calendarSchema,
  compareMarketPitEvidenceInstantStringsV1,
} from '@thesis-ledger/schemas';

export type NavPlanningCalendar = z.infer<typeof calendarSchema>;

export class NavInputPlanError extends Error {
  readonly code = 'DATA_UNAVAILABLE';
}

export function navPlanUnavailable(message: string): never {
  throw new NavInputPlanError(message);
}

export const validateNavPlanningCalendar = (
  value: NavPlanningCalendar,
  symbol: string,
  dataAsOf: string,
  visibilityMode?: 'strict-publication' | 'research-assumption',
): NavPlanningCalendar => {
  const parsed = calendarSchema.safeParse(value);
  if (!parsed.success) navPlanUnavailable('NAV 独立日历格式或证据身份无效');
  const calendar = parsed.data;
  if (
    calendar.version.startsWith('nav-research-calendar-v1:') ||
    calendar.evidenceRef.startsWith('research-config://nav-calendar/')
  ) {
    const proofHash = calendar.version.slice('nav-research-calendar-v1:'.length);
    if (
      visibilityMode !== 'research-assumption' ||
      !/^[a-f0-9]{64}$/.test(proofHash) ||
      calendar.evidenceRef !== `research-config://nav-calendar/${proofHash}`
    ) {
      navPlanUnavailable('NAV 来源日期构造只允许显式研究模式及一致的假设证据引用');
    }
  }
  const visible = compareMarketPitEvidenceInstantStringsV1(calendar.availableAt, dataAsOf);
  if (calendar.symbol !== symbol || visible === undefined || visible > 0) {
    navPlanUnavailable('NAV 日历标的不符或在冻结时点不可见');
  }
  const { startDate, endDate } = calendar.coverage;
  if (startDate > endDate) navPlanUnavailable('NAV 日历覆盖范围无效');
  for (const dates of [
    calendar.valuationDates,
    calendar.tradingDates,
    calendar.disclosureWorkDates,
  ]) {
    if (
      dates.some((day, i) => day < startDate || day > endDate || (i > 0 && day <= dates[i - 1]!))
    ) {
      navPlanUnavailable('NAV 日历日期必须在覆盖范围内升序且唯一');
    }
  }
  return calendar;
};

export const resolveNavDateRanges = (
  calendar: NavPlanningCalendar,
  runWindow: { startDate: string; endDate: string },
  warmupPeriods: number,
  tailTradingDays: number,
) => {
  const { startDate, endDate } = runWindow;
  if (calendar.coverage.startDate > startDate || calendar.coverage.endDate < endDate) {
    navPlanUnavailable('NAV 日历未覆盖运行区间');
  }
  const executionDates = calendar.valuationDates.filter(
    (day) => day >= startDate && day <= endDate,
  );
  if (executionDates.length === 0) navPlanUnavailable('NAV 运行区间没有预期估值日');
  const preceding = calendar.valuationDates.filter((day) => day < startDate);
  if (preceding.length < warmupPeriods) navPlanUnavailable('NAV 日历不足以确定所需预热范围');
  const warmupDates = preceding.slice(-warmupPeriods);
  const forward = calendar.tradingDates.filter((day) => day > endDate);
  if (forward.length < tailTradingDays) navPlanUnavailable('NAV 日历未覆盖确认与结算尾部预算');
  const warmupStartDate = warmupDates[0]!;
  const calendarEndDate = forward[tailTradingDays - 1]!;
  const processingDates = calendar.tradingDates.filter(
    (day) => day >= warmupStartDate && day <= calendarEndDate,
  );
  if (!processingDates.some((day) => day >= startDate && day <= endDate)) {
    navPlanUnavailable('NAV 运行区间没有申赎处理交易日');
  }
  return {
    warmupDates,
    executionDates,
    expectedValuationDates: [...warmupDates, ...executionDates],
    navRange: { startDate: warmupStartDate, endDate },
    calendarRange: { startDate: warmupStartDate, endDate: calendarEndDate },
    processingDates,
  };
};
