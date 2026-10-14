import type {
  BacktestKnownCashResearchInputV3,
  MarketKnownCashRecordV3,
} from '@thesis-ledger/schemas';

/** 同一冻结选择同时供记账与披露消费，不由消费者解释供应商枚举。 */
export function knownCashRecordAdoptedV3(
  policy: BacktestKnownCashResearchInputV3['policy'],
  record: MarketKnownCashRecordV3,
): boolean {
  if (policy.uncertainRecords === undefined) return true; // 旧快照语义保持。
  if (record.statusBasis === 'source-defined' || record.statusBasis === 'event-reconciled')
    return true;
  return policy.uncertainRecords === 'assume-scheduled';
}
