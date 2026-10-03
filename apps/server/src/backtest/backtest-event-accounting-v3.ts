import type { BacktestCorporateActionFact, TradingCalendar } from '@thesis-ledger/domain';
import { compareMarketPitEvidenceInstantStringsV1 } from '@thesis-ledger/schemas';

export class BacktestEventAccountingError extends Error {
  readonly code = 'DATA_UNAVAILABLE';
}

/** 调度来自冻结开盘，源时间保持不变；事件没有价格研究时钟的豁免。 */
export function prepareEventAccountingV3(
  facts: readonly BacktestCorporateActionFact[],
  input: {
    calendar: TradingCalendar;
    bars: readonly { openedAt: string }[];
    startDate: string;
    endDate: string;
    dataAsOf: string;
  },
): BacktestCorporateActionFact[] {
  const openings = new Map<string, string>();
  for (const bar of input.bars) {
    if (
      compareMarketPitEvidenceInstantStringsV1(bar.openedAt, bar.openedAt) === undefined ||
      !input.calendar.isTradingSession(bar.openedAt)
    )
      continue;
    const date = input.calendar.status(bar.openedAt).date;
    const prior = openings.get(date);
    if (!prior || compareMarketPitEvidenceInstantStringsV1(bar.openedAt, prior) === -1)
      openings.set(date, bar.openedAt);
  }
  return facts.flatMap((fact) => {
    const date = fact.effectiveDate;
    if (!date) throw new BacktestEventAccountingError('公司行动记账缺少明确生效日。');
    if (date < input.startDate || date > input.endDate) return [];
    const accountingAt = openings.get(date);
    const asOfOrder = compareMarketPitEvidenceInstantStringsV1(fact.availableAt, input.dataAsOf);
    const accountingOrder = accountingAt
      ? compareMarketPitEvidenceInstantStringsV1(fact.availableAt, accountingAt)
      : undefined;
    if (
      !accountingAt ||
      asOfOrder === undefined ||
      asOfOrder > 0 ||
      accountingOrder === undefined ||
      accountingOrder > 0
    ) {
      throw new BacktestEventAccountingError(
        '公司行动缺少生效日冻结开盘或事实在生效记账时尚不可用。',
      );
    }
    return [{ ...fact, accountingAt }];
  });
}
