import type { MarketPeriodCalendarReader } from './market-period-calendar-reader.js';
import { executionSessionEnds } from './market-cn-live-execution.js';

/** 只递进读取实际需要的后续交易日；委托日期单独读取，缺失不污染当前观察。 */
export async function sampledCalendar(
  reader: Pick<MarketPeriodCalendarReader, 'read'>,
  market: 'CN' | 'HK' | 'US',
  day: string,
  at: Date,
  nextDay: boolean,
  expiresOn: string[],
) {
  const ends = new Map<string, string>();
  let next: string | undefined;
  for (let offset = 0; offset <= (nextDay ? 31 : 0); offset++) {
    const date = new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000)
      .toISOString()
      .slice(0, 10);
    const result = await reader.read({
      market,
      start: day,
      end: date,
      evaluationAsOf: at.toISOString(),
    });
    if (result.status !== 'ready') return null;
    for (const [d, end] of executionSessionEnds(result.calendar)) ends.set(d, end);
    next = [...ends.keys()].filter((d) => d > day).sort()[0];
    if (!nextDay || next) break;
  }
  if (!ends.has(day) || (nextDay && !next)) return null;
  for (const date of new Set(expiresOn.filter((d) => d > day))) {
    const result = await reader.read({
      market,
      start: day,
      end: date,
      evaluationAsOf: at.toISOString(),
    });
    if (result.status !== 'ready') {
      ends.delete(date);
      continue;
    }
    const close = [...executionSessionEnds(result.calendar)]
      .filter(([d]) => d <= date && d >= day)
      .sort(([a], [b]) => a.localeCompare(b))
      .at(-1)?.[1];
    if (close) ends.set(date, close);
  }
  return { ends, positionAvailableOn: nextDay ? next! : day };
}
