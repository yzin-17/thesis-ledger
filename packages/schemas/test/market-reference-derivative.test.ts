import { describe, expect, it } from 'vitest';
import {
  marketReferenceInputSchema,
  marketReferenceAssetType,
  marketReferenceCodeInput,
} from '../src/index.js';
import { marketRouteKeyV3Schema } from '../src/market-route-v3.js';

describe('衍生品资料身份', () => {
  it.each(['RB0', 'M0', 'IF2612'])('接受期货代码 %s', (symbol) => {
    expect(marketReferenceInputSchema.parse({ dataset: 'futures-quote', symbol }).symbol).toBe(
      symbol,
    );
  });
  it.each(['RB2613', 'IF', 'nf_RB0', '600519.SH', 'RB0&list=secret'])(
    '拒绝错误期货代码 %s',
    (symbol) => {
      expect(
        marketReferenceInputSchema.safeParse({ dataset: 'futures-quote', symbol }).success,
      ).toBe(false);
    },
  );
  it.each(['510050.SH', '510300.SH', '588000.SH', '510500.SH'])(
    '期权清单接受已核对标的 %s',
    (symbol) => {
      expect(
        marketReferenceInputSchema.safeParse({ dataset: 'etf-option-contracts', symbol }).success,
      ).toBe(true);
    },
  );
  it('期权清单拒绝其他 ETF；独立合约与股票代码不混用', () => {
    expect(
      marketReferenceInputSchema.safeParse({ dataset: 'etf-option-contracts', symbol: '159915.SZ' })
        .success,
    ).toBe(false);
    expect(
      marketReferenceInputSchema.safeParse({ dataset: 'etf-option-quote', symbol: '10012440' })
        .success,
    ).toBe(true);
    expect(
      marketReferenceInputSchema.safeParse({ dataset: 'etf-option-quote', symbol: '510050.SH' })
        .success,
    ).toBe(false);
    expect(
      marketReferenceInputSchema.safeParse({ dataset: 'financial-balance', symbol: '10012440' })
        .success,
    ).toBe(false);
  });
  it('官方日行情需要明确同一天，当前报价不接收历史日期', () => {
    expect(marketReferenceInputSchema.safeParse({ dataset: 'futures-daily-shfe' }).success).toBe(
      false,
    );
    expect(
      marketReferenceInputSchema.safeParse({
        dataset: 'futures-daily-shfe',
        start: '2026-11-03',
        end: '2026-11-03',
      }).success,
    ).toBe(true);
    expect(
      marketReferenceInputSchema.safeParse({
        dataset: 'futures-quote',
        symbol: 'RB0',
        start: '2026-11-03',
      }).success,
    ).toBe(false);
  });
  it('三类资产使用独立 Data 身份并保留中文输入标签', () => {
    expect(marketReferenceAssetType('futures-quote')).toBe('FUTURE');
    expect(marketReferenceAssetType('etf-option-contracts')).toBe('OPTION');
    expect(marketReferenceAssetType('convertible-bond-reference')).toBe('CONVERTIBLE_BOND');
    expect(marketReferenceAssetType('etf-shares-sh')).toBe('ETF');
    expect(marketReferenceCodeInput('futures-quote')?.label).toBe('期货代码');
    expect(marketReferenceCodeInput('etf-option-greeks')?.label).toBe('期权合约代码');
  });
  it.each(['FUTURE', 'OPTION'])('仅扩展 %s 的 Data Route，普通 Bar 仍拒绝', (assetType) => {
    expect(
      marketRouteKeyV3Schema.safeParse({
        kind: 'data',
        market: 'CN',
        assetType,
        capability: 'REFERENCE_TEST',
      }).success,
    ).toBe(true);
    expect(
      marketRouteKeyV3Schema.safeParse({
        kind: 'bar',
        market: 'CN',
        assetType,
        capability: 'DAILY_BAR',
        timeframe: '1d',
        adjustment: 'none',
      }).success,
    ).toBe(false);
  });
});
