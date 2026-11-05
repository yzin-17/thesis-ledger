import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({ period: '1m', select: vi.fn() }));
vi.mock('./useMarketChartSelection.js', () => ({
  useMarketChartSelection: () => ({ adjustment: 'qfq', select: state.select }),
}));
vi.mock('./MarketPeriodSelection.js', () => ({
  MarketPeriodSelection: ({ children }: { children: (period: string) => ReactNode }) => children(state.period),
}));
import { MarketDetailSelection } from './MarketDetailSelection.js';

describe('分钟口径与日线偏好隔离', () => {
  it('分钟固定不复权，切回日线保留原前复权偏好', () => {
    const position = { symbol: 'SPY.US', asset: { name: 'SPY', assetType: 'etf' as const } };
    const seen: Array<{ timeframe: string; adjustment: string | undefined }> = [];
    state.select.mockReset();
    state.period = '1m';
    renderToStaticMarkup(<MarketDetailSelection position={position}>{(selection) => {
      seen.push(selection); selection.select('none'); return null;
    }}</MarketDetailSelection>);
    expect(seen[0]).toMatchObject({ timeframe: '1m', adjustment: 'none' });
    expect(state.select).not.toHaveBeenCalled();
    state.period = '1d';
    renderToStaticMarkup(<MarketDetailSelection position={position}>{(selection) => {
      seen.push(selection); selection.select('qfq'); return null;
    }}</MarketDetailSelection>);
    expect(seen[1]).toMatchObject({ timeframe: '1d', adjustment: 'qfq' });
    expect(state.select).toHaveBeenCalledWith('qfq');
  });
});
