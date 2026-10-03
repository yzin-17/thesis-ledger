import { describe, expect, it } from 'vitest';
import {
  marketChartOptionsV3Schema,
  marketChartOptionsWindowV3Schema,
} from '../src/market-chart-options-v3.js';

const options = {
  contractVersion: 3,
  symbol: '159516.SZ',
  mode: 'v3',
  options: [
    { adjustment: 'none', available: false, reason: 'route_not_configured' },
    { adjustment: 'qfq', available: true, reason: null, availableVia: 'backup' },
    { adjustment: 'hfq', available: false, reason: 'route_not_configured' },
  ],
};
describe('图表窗口可用性契约', () => {
  it('基础备用可用性允许独立于具体窗口返回', () => {
    expect(marketChartOptionsV3Schema.safeParse(options).success).toBe(true);
    expect(
      marketChartOptionsV3Schema.safeParse({
        ...options,
        window: { start: '2026-05-01', end: '2026-05-20' },
      }).success,
    ).toBe(true);
  });
  it('日期真实、有序且必须成对', () => {
    for (const window of [
      { start: '2026-02-30', end: '2026-05-01' },
      { start: '2026-05-02', end: '2026-05-01' },
      { start: '2026-05-01' },
    ]) {
      expect(marketChartOptionsWindowV3Schema.safeParse(window).success).toBe(false);
    }
  });
});
