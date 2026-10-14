import {
  backtestUnknownListingWarningV3,
  marketCoverageProofV3Schema,
  type BacktestTradingStatusDisclosureV3,
} from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';

/** 只从本次冻结的覆盖信息产生说明，不推断或补取上市日期。 */
export const backtestListingWarningsV3 = (
  row: ArtifactRow | undefined,
  status?: BacktestTradingStatusDisclosureV3,
): string[] => {
  if (typeof row?.coverageProof !== 'string') throw new Error('冻结行情缺少上市覆盖信息');
  const proof = marketCoverageProofV3Schema.parse(JSON.parse(row.coverageProof) as unknown);
  if (status?.status === 'source' && status.response.basicLifecycle?.ipoDateStatus === 'known')
    return [];
  if ('status' in proof.listing) return [backtestUnknownListingWarningV3];
  return [];
};
