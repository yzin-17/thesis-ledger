import { compareMarketPitEvidenceInstantStringsV1 } from '@thesis-ledger/schemas';

/** 无效证据时间与冻结截点之后的证据都不能进入 V3 快照。 */
export const isBacktestEvidenceAfterDataAsOfV3 = (
  evidenceAt: string,
  dataAsOf: string,
): boolean => {
  const order = compareMarketPitEvidenceInstantStringsV1(evidenceAt, dataAsOf);
  return order === undefined || order > 0;
};
