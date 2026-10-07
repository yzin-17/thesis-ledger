import { navLocalDate, type TradingCalendar, type TradingDayStatus } from '@thesis-ledger/domain';
import type { NavPlanningCalendar } from './backtest-nav-planning-calendar.js';
import { navPlanUnavailable } from './backtest-nav-planning-calendar.js';

/** 冻结合同只声明处理日期；不得引入静态日历或虚构交易时段。 */
export const navDomainCalendar = (input: NavPlanningCalendar): TradingCalendar => {
  const calendar = structuredClone(input);
  const dates = new Set(calendar.tradingDates);
  const status = (value: Date | string): TradingDayStatus => {
    const instant = value instanceof Date ? value.toISOString() : value;
    const date = navLocalDate(instant, calendar.timezone);
    if (!date || date < calendar.coverage.startDate || date > calendar.coverage.endDate) {
      navPlanUnavailable('NAV 处理日期超出冻结日历覆盖');
    }
    const open = dates.has(date);
    return { market: 'CN', date, open, reason: open ? 'open' : 'exchange-holiday' };
  };
  const unavailableSession = (): never => navPlanUnavailable('NAV 冻结日历未声明交易时段');
  return {
    market: 'CN',
    timezone: calendar.timezone,
    status,
    isTradingDay: (value) => status(value).open,
    sessionStatus: unavailableSession,
    isTradingSession: unavailableSession,
    sessionsForDate: unavailableSession,
  };
};
