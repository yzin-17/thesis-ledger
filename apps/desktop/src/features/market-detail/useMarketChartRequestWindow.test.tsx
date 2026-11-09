// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { MarketTimeframe } from '@thesis-ledger/schemas';
import { useMarketChartRequestWindow } from './useMarketChartRequestWindow.js';

const flush = async (action: () => void) => {
  await act(async () => { action(); await Promise.resolve(); });
};

describe('周期请求窗口隔离', () => {
  it('切换首帧即使用目标周期上限，不携带其他周期、标的或口径的历史锚点', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    const root = createRoot(host);
    let current: ReturnType<typeof useMarketChartRequestWindow>;
    const frames: Array<{ limit: number; anchor: string | undefined }> = [];
    function Probe({ symbol, timeframe, adjustment }: { symbol: string; timeframe: MarketTimeframe; adjustment: string }) {
      current = useMarketChartRequestWindow(symbol, timeframe, adjustment);
      frames.push({ limit: current.limit, anchor: current.anchor });
      return null;
    }
    const render = async (timeframe: MarketTimeframe, symbol = '600036.SH', adjustment = 'qfq') => {
      frames.length = 0;
      await flush(() => root.render(<Probe symbol={symbol} timeframe={timeframe} adjustment={adjustment} />));
      expect(frames).toEqual([{ limit: timeframe === '1y' ? 2 : 90, anchor: undefined }]);
    };
    try {
      await render('1d');
      await flush(() => { current.setAnchor('2026-08-01T07:00:00Z'); current.setLimit((limit) => limit + 90); });
      expect(current!.limit).toBe(180);
      expect(current!.anchor).toBe('2026-08-01T07:00:00Z');
      await render('1y');
      await render('1w');
      await render('1d', '510300.SH');
      await render('1d', '600036.SH', 'none');
      await flush(() => { current.setAnchor('2026-11-01T07:00:00Z'); current.setLimit(270); });
      await render('1d');
    } finally { await flush(() => root.unmount()); vi.unstubAllGlobals(); }
  });
});
