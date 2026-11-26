import type { BacktestStrategy } from '@thesis-ledger/schemas';

/** 月末身份需要整月事实；只扩展日历冻结请求，不增加价格或执行窗口。 */
export function tradePlanCalendarRange(
  strategy: BacktestStrategy,
  range: { start: string; end: string },
  executionStart: string,
  executionEnd: string,
) {
  if (!strategy.tradePlan?.monthlyRebalance) return range;
  const start = executionStart.slice(0, 7) + '-01';
  const cursor = new Date(executionEnd.slice(0, 7) + '-01T12:00:00Z');
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  cursor.setUTCDate(0);
  const end = cursor.toISOString().slice(0, 10);
  return {
    start: range.start < start ? range.start : start,
    end: range.end > end ? range.end : end,
  };
}
