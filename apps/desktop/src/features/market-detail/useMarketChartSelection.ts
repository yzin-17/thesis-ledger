import { useCallback, useState } from 'react';

export type ChartAdjustment = 'none' | 'qfq' | 'hfq';
export function useMarketChartSelection(symbol: string, initial?: ChartAdjustment) {
  const key = JSON.stringify([symbol, initial]);
  const [selection, setSelection] = useState<{ key: string; adjustment: ChartAdjustment }>();
  const active = selection?.key === key ? selection : undefined;
  const select = useCallback((adjustment: ChartAdjustment) => {
    setSelection((current) => current?.key === key && current.adjustment === adjustment
      ? current : { key, adjustment });
  }, [key]);
  return { adjustment: active?.adjustment ?? initial, select };
}
