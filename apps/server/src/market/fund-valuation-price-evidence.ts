import type { FundNav } from '@thesis-ledger/schemas';

/** 盘中沿用已知陈旧锚点，但零值及不可用标记不能成为 NAV 基数。 */
export function requireFundEstimateAnchor(nav: Pick<FundNav, 'unitNav' | 'freshness'>) {
  if (
    !Number.isFinite(nav.unitNav) ||
    nav.unitNav <= 0 ||
    !['delayed', 'stale'].includes(nav.freshness)
  )
    throw new Error('基金盘中估算缺少可用净值锚点');
}

/** 未定价证券返回缺失，调用方保持零变动并从可定价覆盖中排除。 */
export function fundHoldingReturn(currentPrice: number, anchorPrice: number) {
  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    !Number.isFinite(anchorPrice) ||
    anchorPrice <= 0
  )
    return undefined;
  return currentPrice / anchorPrice - 1;
}
