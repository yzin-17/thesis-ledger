import type { HistoricalDecisionWindowV3 } from './market-pit-historical-evidence-v1.js';
import { compareMarketPitEvidenceInstantStringsV1 as compareInstant } from './market-pit-evidence-instant-v1.js';
import type { HistoricalEvidenceReferences } from './market-pit-historical-references-v1.js';
import type { indexCalendarTradingDates } from './market-pit-calendar-structure-v1.js';

type Evidence = HistoricalDecisionWindowV3;
type Binding = Evidence['barDecisionBindings'][number];
type Calendar = Evidence['calendars'][number];
type TradingDates = ReturnType<typeof indexCalendarTradingDates>;

const validateCalendarDecision = (
  item: Binding,
  cal: Calendar,
  dateIndex: number,
  { successors }: TradingDates,
  fail: (message: string) => void,
) => {
  const state = cal.dateStates[dateIndex]!;
  const next = successors.get(cal.id)?.get(item.tradingDate);
  if (
    state.status !== 'open' ||
    !next ||
    next.date !== item.nextTradingDate ||
    compareInstant(state.sessions.at(-1)?.closedAt ?? '', item.closedAt) !== 0 ||
    compareInstant(next.sessions[0]?.openedAt ?? '', item.nextOpenedAt) !== 0
  )
    fail('Bar 收盘和下一有效交易日须由日历明确提供');
  if (
    (compareInstant(item.closedAt, item.decisionAt) ?? 1) > 0 ||
    (compareInstant(item.decisionAt, item.nextOpenedAt) ?? 0) >= 0
  )
    fail('Bar 决策时刻须处于收盘与下一开盘之间');
};

export const validateHistoricalBarBindings = (
  value: Evidence,
  { witnesses, calendars, fail }: HistoricalEvidenceReferences,
  tradingDates: TradingDates,
) => {
  for (const [index, item] of value.barDecisionBindings.entries()) {
    if (compareInstant(item.timestamp, item.timestamp) !== 0)
      fail('Bar 原始时刻须为有效且已知偏移的证据瞬时');
    if ((compareInstant(item.timestamp, item.decisionAt) ?? 1) > 0)
      fail('Bar 原始时刻不得晚于其决策时刻');
    if (
      index > 0 &&
      (compareInstant(item.timestamp, value.barDecisionBindings[index - 1]!.timestamp) ?? 0) <= 0
    )
      fail('Bar 窗口绑定须按原始时间严格递增');
    const source = witnesses.get(item.sourceWitnessId);
    if (
      !source ||
      source.windowIdentityFingerprint !== item.windowIdentityFingerprint ||
      source.completeResponseHash !== item.completeResponseHash
    )
      fail('Bar 来源见证引用或归档摘要不匹配');
    const cal = calendars.get(item.calendarEvidenceId);
    const dateIndex = tradingDates.dateIndexes.get(item.calendarEvidenceId)?.get(item.tradingDate);
    if (!cal || dateIndex === undefined) {
      fail('Bar 交易日须位于引用日历范围');
      continue;
    }
    validateCalendarDecision(item, cal, dateIndex, tradingDates, fail);
    if (
      (compareInstant(cal.knownAvailableAt, item.decisionAt) ?? 1) > 0 ||
      (source && (compareInstant(source.revisionKnownAvailableAt, item.decisionAt) ?? 1) > 0)
    )
      fail('日历或来源修订声明晚于历史决策');
  }
};
