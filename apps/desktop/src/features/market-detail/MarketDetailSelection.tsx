import type { ReactNode } from 'react';
import { MarketPeriodSelection, type ChartPeriod } from './MarketPeriodSelection.js';
import { useMarketChartSelection, type ChartAdjustment } from './useMarketChartSelection.js';
import type { MarketDetailPosition } from './market-detail.types.js';

const keepMinuteBasis = () => {};
export function MarketDetailSelection({ position, initial, children }: {
  position: MarketDetailPosition;
  initial?: ChartAdjustment | undefined;
  children: (selection: { timeframe: ChartPeriod; adjustment: ChartAdjustment | undefined;
    select: (value: ChartAdjustment) => void }) => ReactNode;
}) {
  const { adjustment, select } = useMarketChartSelection(position.symbol, initial);
  return <MarketPeriodSelection symbol={position.symbol} {...(adjustment ? { adjustment } : {})}
    enabled={position.asset.assetType !== 'fund' && /\.(SH|SZ|BJ|HK|US)$/.test(position.symbol)}>
    {(timeframe) => children({ timeframe, adjustment: timeframe === '1m' ? 'none' : adjustment,
      select: timeframe === '1m' ? keepMinuteBasis : select })}
  </MarketPeriodSelection>;
}
