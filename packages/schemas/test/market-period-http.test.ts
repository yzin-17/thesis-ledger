import { describe, expect, it } from 'vitest';
import { barSeriesIdentitySchema, marketDetailRequestSchema } from '../src/index.js';

describe('行情展示请求周期与原始来源边界', () => {
  it.each(['1m', '1d', '5d', '1w', '1mo', '1y'])('%s 可作为详情展示请求', (timeframe) => {
    expect(marketDetailRequestSchema.parse({ symbol: '159516.SZ', timeframe }).timeframe).toBe(
      timeframe,
    );
  });
  it('展示周期扩展不扩大原始 BarSeries identity', () => {
    expect(
      barSeriesIdentitySchema.safeParse({
        symbol: '159516.SZ',
        assetType: 'ETF',
        timeframe: '1w',
        adjustment: 'qfq',
      }).success,
    ).toBe(false);
  });
  it('省略周期保持省略，非法周期拒绝', () => {
    expect(marketDetailRequestSchema.parse({ symbol: '159516.SZ' }).timeframe).toBeUndefined();
    expect(
      marketDetailRequestSchema.safeParse({ symbol: '159516.SZ', timeframe: 'weekly' }).success,
    ).toBe(false);
  });
});
