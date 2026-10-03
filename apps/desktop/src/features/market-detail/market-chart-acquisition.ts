import type { BarSeries } from '@thesis-ledger/schemas';

/** Different V3 acquisitions may have different adjustment anchors or revisions. */
export const canCombineChartSeries = (left: BarSeries, right: BarSeries): boolean => {
  if (
    left.identity.symbol !== right.identity.symbol ||
    left.identity.assetType !== right.identity.assetType ||
    left.identity.timeframe !== right.identity.timeframe ||
    left.identity.adjustment !== right.identity.adjustment
  )
    return false;
  if (!left.chartContextV3 && !right.chartContextV3) return true;
  return Boolean(
    left.chartContextV3 &&
    right.chartContextV3 &&
    left.chartContextV3.acquisitionFingerprint === right.chartContextV3.acquisitionFingerprint,
  );
};
