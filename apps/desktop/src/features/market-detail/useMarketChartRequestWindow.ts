import { useState, type SetStateAction } from 'react';
import type { MarketTimeframe } from '@thesis-ledger/schemas';

type WindowState = { scope: string; limit: number; anchor: string | undefined };
export function useMarketChartRequestWindow(symbol: string, timeframe: MarketTimeframe, adjustment?: string) {
  const scope = JSON.stringify([symbol, timeframe, adjustment]);
  const initial = (): WindowState => ({ scope, limit: timeframe === '1y' ? 2 : 90, anchor: undefined });
  const [stored, setStored] = useState(initial);
  const state = stored.scope === scope ? stored : initial();
  return {
    limit: state.limit,
    anchor: state.anchor,
    setLimit: (change: SetStateAction<number>) => setStored((current) => {
      const active = current.scope === scope ? current : initial();
      return { ...active, limit: typeof change === 'function' ? change(active.limit) : change };
    }),
    setAnchor: (anchor: string | undefined) => setStored((current) => ({ ...(current.scope === scope ? current : initial()), anchor })),
  };
}
