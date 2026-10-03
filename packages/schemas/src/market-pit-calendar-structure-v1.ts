import type { HistoricalDecisionWindowV3 } from './market-pit-historical-evidence-v1.js';
import { compareMarketPitEvidenceInstantStringsV1 } from './market-pit-evidence-instant-v1.js';

type Calendar = HistoricalDecisionWindowV3['calendars'][number];
type DateState = Calendar['dateStates'][number];

const matchesLocalMinute = (
  value: string,
  date: string,
  minute: number,
  clock: Intl.DateTimeFormat,
) => {
  if (compareMarketPitEvidenceInstantStringsV1(value, value) !== 0) return false;
  if (!/T\d{2}:\d{2}(?::00(?:\.0+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const parts = Object.fromEntries(
    clock.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  return (
    `${parts.year}-${parts.month}-${parts.day}` === date &&
    Number(parts.hour) * 60 + Number(parts.minute) === minute &&
    Number(parts.second) === 0
  );
};
const validateDailySessions = (
  state: DateState,
  clock: Intl.DateTimeFormat,
  fail: (message: string) => void,
) => {
  if ((state.status === 'open') !== state.sessions.length > 0) fail('开闭市状态与时段矛盾');
  for (const [index, current] of state.sessions.entries()) {
    const previous = state.sessions[index - 1];
    if (
      current.startMinute >= current.endMinute ||
      Date.parse(current.openedAt) >= Date.parse(current.closedAt) ||
      !matchesLocalMinute(current.openedAt, state.date, current.startMinute, clock) ||
      !matchesLocalMinute(current.closedAt, state.date, current.endMinute, clock) ||
      (previous &&
        (previous.endMinute > current.startMinute ||
          Date.parse(previous.closedAt) > Date.parse(current.openedAt)))
    )
      fail('日内时段须有序、不重叠且不跨午夜');
  }
};

export const validateCalendarStructure = (
  item: Calendar,
  fail: (message: string) => void,
  validatePublications: (ids: string[]) => void,
) => {
  if (Date.parse(item.knownAvailableAt) > Date.parse(item.acquiredAt))
    fail('日历获取不得早于其声明可见时刻');
  let clock: Intl.DateTimeFormat;
  try {
    clock = new Intl.DateTimeFormat('en', {
      timeZone: item.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      calendar: 'iso8601',
      numberingSystem: 'latn',
    });
  } catch {
    return;
  }
  const days =
    (Date.parse(item.historicalRange.end) - Date.parse(item.historicalRange.start)) / 86_400_000 +
    1;
  if (days < 1 || days !== item.dateStates.length) fail('日历范围须与连续逐日状态完全一致');
  for (const [index, state] of item.dateStates.entries()) {
    const expected = Date.parse(item.historicalRange.start) + index * 86_400_000;
    if (Date.parse(state.date) !== expected) fail('日历逐日状态缺失、乱序或重复');
    validatePublications(state.publicationIds);
    if (state.publicationIds.some((id) => !item.publicationIds.includes(id)))
      fail('日期发布引用须属于日历发布集合');
    validateDailySessions(state, clock, fail);
  }
};

/** 一次线性索引保留每一天到下一有效交易日的映射，包含最后一根 Bar 的后继。 */
export const indexCalendarTradingDates = (calendars: Calendar[]) => {
  const dateIndexes = new Map<string, Map<string, number>>();
  const successors = new Map<string, Map<string, DateState>>();
  for (const cal of calendars) {
    dateIndexes.set(cal.id, new Map(cal.dateStates.map((state, index) => [state.date, index])));
    const byDate = new Map<string, DateState>();
    let next: DateState | undefined;
    for (let index = cal.dateStates.length - 1; index >= 0; index--) {
      const state = cal.dateStates[index]!;
      if (next) byDate.set(state.date, next);
      if (state.status === 'open') next = state;
    }
    successors.set(cal.id, byDate);
  }
  return { dateIndexes, successors };
};
