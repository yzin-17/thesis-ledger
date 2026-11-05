import { at, fixture } from './fund-nav-estimator.fixture.js';
import { describe, expect, it } from 'vitest';
import { readFundNavEstimate } from '../../src/market/fund-nav-estimator.js';
import { readFundAdjustedHoldingReturn } from '../../src/market/fund-valuation-adjusted-return.js';

describe('当前基金估值的价格时效', () => {
  it('开盘前报价即使距当前不足五分钟，也不能冒充当日盘中更新', async () => {
    const { input, readChartV3 } = fixture({ quoteAt: '2026-11-04T01:29:00Z' });
    const result = await readFundAdjustedHoldingReturn({
      symbol: '600519.SH', assetType: 'STOCK', navDate: '2026-11-03T00:00:00Z',
      at: new Date('2026-11-04T01:30:00Z'), market: input.market, bars: input.bars, maxPriceAgeMs: 5 * 60_000,
    });
    expect(result.evidence).toMatchObject({ status: 'unavailable', reasonCode: 'quote_before_current_session' });
    expect(readChartV3).not.toHaveBeenCalled();
  });
  it('缺少汇率证据的境外持仓不计入当前估值覆盖', async () => {
    const { input, getQuote } = fixture();
    const result = await readFundAdjustedHoldingReturn({
      symbol: '00700.HK', assetType: 'STOCK', navDate: '2026-11-03T00:00:00Z',
      at, market: input.market, bars: input.bars, maxPriceAgeMs: 5 * 60_000,
    });
    expect(result.evidence).toMatchObject({ status: 'unavailable', reasonCode: 'holding_currency_unverified' });
    expect(getQuote).not.toHaveBeenCalled();
  });
  it('使用同口径当日价格，保留披露权重和时间证据', async () => {
    const { input } = fixture();
    const result = await readFundNavEstimate(input);
    expect(result.estimate.estimatedNav).toBeCloseTo(1.025);
    expect(result.estimate).toMatchObject({ disclosureCoverage: 0.25, pricedCoverage: 0.25 });
    expect(result.evidence.holdingPrices[0]).toMatchObject({
      status: 'available', quoteMarketTime: at.toISOString(), currentCompletionStatus: 'incomplete',
    });
  });
  it.each([
    [{ quoteAt: '2026-11-04T05:54:59Z' }, 'quote_too_old'],
    [{ quoteAt: '2026-11-04T06:01:00Z' }, 'quote_after_valuation_minute'],
    [{ stale: true }, 'quote_too_old'],
    [{ basisAt: '2026-11-04T05:54:59Z' }, 'adjusted_basis_too_old'],
    [{ missingDay: true }, 'adjusted_price_date_missing'],
  ] as const)('不可用价格不贡献估算 %j', async (options, reasonCode) => {
    const result = await readFundNavEstimate(fixture(options).input);
    expect(result.estimate.pricedCoverage).toBe(0);
    expect(result.evidence.holdingPrices[0]).toMatchObject({ status: 'unavailable', reasonCode });
  });
  it.each([
    [{ disclosure: '2026-11-05T00:00:00Z' }, 'disclosure_unavailable'],
    [{ futureNav: true }, 'nav_unavailable'],
  ] as const)('未知时点不能使用将来资料 %j', async (options, reason) => {
    const { input, getQuote } = fixture(options);
    await expect(readFundNavEstimate(input)).rejects.toMatchObject({ reason });
    expect(getQuote).not.toHaveBeenCalled();
  });
});
