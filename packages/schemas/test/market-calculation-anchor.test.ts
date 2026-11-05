import { expect, it } from 'vitest';
import { marketCalculationAnchor } from '../src/market-calculation-anchor.js';

it('日线与分钟均使用市场本地日期，偏移写法按同一时刻归一', () => {
  const base = { symbol: 'AAPL.US', calculationAnchor: '2026-11-04T00:00:00.000Z' };
  expect(marketCalculationAnchor(base)).toEqual({
    timestamp: base.calculationAnchor,
    end: '2026-11-03',
  });
  expect(marketCalculationAnchor({ ...base, timeframe: '1m' })?.end).toBe('2026-11-03');
  expect(marketCalculationAnchor({ ...base, symbol: '00700.HK', timeframe: '1m' })?.end).toBe(
    '2026-11-04',
  );
  expect(
    marketCalculationAnchor({ ...base, calculationAnchor: '2026-11-03T19:00:00-05:00' }),
  ).toEqual(marketCalculationAnchor(base));
  expect(
    marketCalculationAnchor({ ...base, calculationAnchor: '2026-11-04T00:00:00-05:00' })?.end,
  ).toBe('2026-11-04');
  expect(
    marketCalculationAnchor({
      ...base,
      symbol: '00700.HK',
      calculationAnchor: '2026-11-04T00:00:00+08:00',
    })?.end,
  ).toBe('2026-11-04');
});

it('缺省保持当前行为，错误锚点与窗口冲突必须拒绝', () => {
  expect(marketCalculationAnchor({ symbol: '600519.SH' })).toBeUndefined();
  for (const value of ['2026-11-04', '2026-02-30T00:00:00Z', '2026-11-04T00:00:00'])
    expect(() =>
      marketCalculationAnchor({ symbol: '600519.SH', calculationAnchor: value }),
    ).toThrow();
  expect(() =>
    marketCalculationAnchor({
      symbol: '600519.SH',
      end: '2026-11-05',
      calculationAnchor: '2026-11-04T00:00:00Z',
    }),
  ).toThrow('end必须');
});
