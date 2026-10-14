import type {
  BacktestCorporateActionFact,
  TradingCalendar,
  CorporateActionResult,
  LedgerMutationResult,
} from '@thesis-ledger/domain';
import type { RunConfigV3 } from '@thesis-ledger/schemas';

export function cashDividendExecutionEventsV3(
  config: RunConfigV3,
  result: {
    corporateActionResults: readonly CorporateActionResult[];
    ledgerMutations: readonly LedgerMutationResult[];
  },
) {
  return config.executionPriceProtocol.cashEventResearch
    ? { cashEvents: { actions: result.corporateActionResults, ledger: result.ledgerMutations } }
    : {};
}

/** 只把已绑定的现金事实投影为显式日期级研究模型；保留源时间。 */
export function cashEventAccountingProjectionV3(
  fact: BacktestCorporateActionFact,
  input: {
    calendar: TradingCalendar;
    openings: ReadonlyMap<string, string>;
    accountingAt: string;
    dataAsOf: string;
    endDate: string;
  },
): BacktestCorporateActionFact {
  const { recordDate, effectiveDate, paymentDate } = fact;
  if (
    fact.market !== 'CN' ||
    fact.instrumentType !== 'ETF' ||
    fact.type !== 'CASH_DIVIDEND' ||
    !recordDate ||
    !effectiveDate ||
    !paymentDate ||
    recordDate >= effectiveDate ||
    paymentDate < effectiveDate ||
    !input.calendar.isTradingDay(recordDate)
  )
    throw new Error('现金研究需要境内ETF的明确登记/除息/发放日');
  const cursor = new Date(`${recordDate}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.toISOString().slice(0, 10) < effectiveDate) {
    if (input.calendar.isTradingDay(cursor.toISOString().slice(0, 10)))
      throw new Error('当前现金研究要求登记日为除息日前最后交易日');
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const paymentAt = input.openings.get(paymentDate);
  if (paymentDate <= input.endDate && !paymentAt) throw new Error('现金发放日缺冻结开盘');
  return {
    ...fact,
    accountingAt: input.accountingAt,
    researchClock: {
      basis: 'fixed-provider-snapshot',
      dataAsOf: input.dataAsOf,
      decisionAt: input.accountingAt,
    },
    ...(paymentAt && paymentDate <= input.endDate ? { cashSettlementAt: paymentAt } : {}),
  };
}
