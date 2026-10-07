import { compareMarketPitEvidenceInstantStringsV1 } from '@thesis-ledger/schemas';

export function compareDerivedInstantV3(left: string, right: string): number {
  const order = compareMarketPitEvidenceInstantStringsV1(left, right);
  if (order === undefined) throw new Error('派生输入时刻无效');
  return order;
}

/** 保留原始时刻精度；同一瞬时保留先出现的表示。 */
export function latestDerivedInstantV3(values: readonly string[]): string {
  const [first, ...rest] = values;
  if (first === undefined) throw new Error('派生输入时刻缺失');
  let latest = first;
  for (const value of rest) {
    if (compareDerivedInstantV3(value, latest) > 0) latest = value;
  }
  return latest;
}
