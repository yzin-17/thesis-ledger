import { describe, expect, it } from 'vitest';
import { normalizeMarketBarWindow } from '../../src/market/market-bar-window.js';

describe('图表窗口日期边界', () => {
  it('按市场时区展开日期，并保留显式时间戳', () => {
    expect(normalizeMarketBarWindow('00700.HK', { end: '2025-01-03' }).end)
      .toBe('2025-01-03T15:59:59.999Z');
    expect(normalizeMarketBarWindow('AAPL.US', { start: '2025-03-09', end: '2025-03-09' }))
      .toEqual({ start: '2025-03-09T05:00:00.000Z', end: '2025-03-10T03:59:59.999Z' });
    expect(normalizeMarketBarWindow('AAPL.US', { start: '2025-11-02', end: '2025-11-02' }))
      .toEqual({ start: '2025-11-02T04:00:00.000Z', end: '2025-11-03T04:59:59.999Z' });
    const precise = '2025-01-03T06:59:59.999Z';
    expect(normalizeMarketBarWindow('510300.SH', { end: precise }).end).toBe(precise);
  });
});
