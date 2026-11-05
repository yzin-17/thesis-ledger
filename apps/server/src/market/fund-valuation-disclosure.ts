import type { FundHoldings } from '@thesis-ledger/schemas';

/** 日期型证据只提供保守边界，不能写成真实精确披露时间或回填过去。 */
export function fundDisclosureAvailableAt(holdings: FundHoldings, at: Date) {
  let availableAt = holdings.disclosureDate;
  if (availableAt === null && holdings.disclosureEvidence?.status === 'matched')
    availableAt = holdings.disclosureEvidence.availableAt;
  if (
    !availableAt ||
    !Number.isFinite(Date.parse(availableAt)) ||
    Date.parse(availableAt) > at.getTime()
  )
    throw new Error('披露时间未知或晚于估值时点');
  return availableAt;
}
