import type { TradingCalendar } from './trading-calendar.js';

export interface TradePlanCalendar {
  calendar: TradingCalendar;
  availableAt: string;
  research?: { basis: 'fixed-provider-snapshot'; dataAsOf: string };
}

/** 只检查冻结日历来源的可见性，具体交易日及覆盖仍由日历投影决定。 */
export function readTradePlanCalendar(
  source: TradePlanCalendar | undefined,
  at: string,
):
  | { status: 'available'; calendar: TradingCalendar }
  | { status: 'unavailable'; reason: 'MISSING' | 'NOT_VISIBLE' } {
  if (!source) return { status: 'unavailable', reason: 'MISSING' };
  const decision = Date.parse(at),
    available = Date.parse(source.availableAt);
  const cutoff = Date.parse(source.research?.dataAsOf ?? at);
  if (
    ![decision, available, cutoff].every(Number.isFinite) ||
    cutoff < decision ||
    available > cutoff
  )
    return { status: 'unavailable', reason: 'NOT_VISIBLE' };
  return { status: 'available', calendar: source.calendar };
}
