import { describe, expect, it, vi } from 'vitest';
import { fundValuationSchema } from '@thesis-ledger/schemas';
import { MarketFundValuationService } from '../../src/market/market-fund-valuation.service.js';
import type { MarketService } from '../../src/market/market.service.js';
import { at, fixture } from './fund-nav-estimator.fixture.js';

const currencyPrisma = {
  instrumentAssetAssociation: { findUnique: async () => ({
    instrumentId: 'controlled-fund', status: 'active', confirmedAt: at,
    asset: { identityStatus: 'confirmed', assetType: 'fund', currency: 'CNY', updatedAt: at },
  }) },
};

describe('单只基金当前估值', () => {
  it('未覆盖年份明确返回未知，不冒充休市也不生成分钟事实', async () => {
    const { input, getQuote } = fixture(); const record = vi.fn();
    const service = new MarketFundValuationService(input.market, input.bars as never, { record } as never, currencyPrisma as never);
    expect(await service.current(input.symbol, new Date('2027-01-04T02:00:00Z'))).toMatchObject({
      marketState: 'unknown', quality: 'unavailable', reasons: ['calendar_unavailable'], estimatedNav: null,
    });
    expect(getQuote).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'USD'])('币种或身份未确认时不请求估值价格 %s', async (currency) => {
    const { input, getQuote } = fixture();
    const prisma = { instrumentAssetAssociation: { findUnique: async () => currency === 'unknown' ? null : ({
      instrumentId: 'controlled-fund', status: 'active', confirmedAt: at,
      asset: { identityStatus: 'confirmed', assetType: 'fund', currency, updatedAt: at },
    }) } };
    const service = new MarketFundValuationService(input.market, input.bars as never, undefined, prisma as never);
    expect(await service.current(input.symbol, at)).toMatchObject({
      quality: 'unavailable', estimatedNav: null,
      reasons: [currency === 'unknown' ? 'currency_unverified' : 'currency_unsupported'],
    });
    expect(getQuote).not.toHaveBeenCalled();
  });
  it('完整计算返回锚点、估算值、涨跌百分数、真实价格时间与低覆盖', async () => {
    const { input } = fixture();
    const service = new MarketFundValuationService(input.market, input.bars as never, undefined, currencyPrisma as never);
    const result = fundValuationSchema.parse(await service.current(input.symbol, at));
    expect(result).toMatchObject({
      symbol: input.symbol, marketState: 'open', quality: 'low_coverage', reasons: ['low_coverage'],
      estimatedAt: at.toISOString(), oldestPriceAt: at.toISOString(), pricedCoverage: 0.25,
      anchor: { unitNav: 1, navDate: '2026-11-03T00:00:00Z' },
    });
    expect(result.estimatedNav).toBeCloseTo(1.025);
    expect(result.changePercent).toBeCloseTo(2.5);
  });
  it('同基金同分钟的并发调用合并计算', async () => {
    const { input, getQuote } = fixture();
    const service = new MarketFundValuationService(input.market, input.bars as never, undefined, currencyPrisma as never);
    const results = await Promise.all([service.current(input.symbol, at), service.current(input.symbol, at)]);
    expect(getQuote).toHaveBeenCalledTimes(1);
    expect(results[0]).toEqual(results[1]);
  });
  it('全部价格过旧返回缺失，不把锚点当作实时估值', async () => {
    const { input } = fixture({ quoteAt: '2026-11-04T05:54:00Z' });
    const service = new MarketFundValuationService(input.market, input.bars as never, undefined, currencyPrisma as never);
    expect(await service.current(input.symbol, at)).toMatchObject({
      quality: 'unavailable', estimatedNav: null, changePercent: null,
      pricedCoverage: 0, reasons: ['prices_unavailable'],
    });
  });
  it('后续读取重新复核来源，不复用已失效的成功估值', async () => {
    const { input } = fixture();
    const market = input.market as MarketService;
    const getFundNav = vi.fn(market.getFundNav.bind(market));
    const service = new MarketFundValuationService({ ...market, getFundNav } as never, input.bars as never, undefined, currencyPrisma as never);
    expect((await service.current(input.symbol, at)).estimatedNav).not.toBeNull();
    getFundNav.mockRejectedValueOnce(new Error('来源控制已关闭'));
    expect(await service.current(input.symbol, at)).toMatchObject({
      quality: 'unavailable', estimatedNav: null, reasons: ['source_unavailable'],
    });
  });
  it('休市不发起行情请求，无估值时不伪造时间；非法代码直接拒绝', async () => {
    const { input, getQuote } = fixture();
    const service = new MarketFundValuationService(input.market, input.bars as never, undefined, currencyPrisma as never);
    expect(await service.current(input.symbol, new Date('2026-11-04T13:00:00Z'))).toMatchObject({
      marketState: 'closed', quality: 'unavailable', reasons: ['market_closed'], estimatedAt: null,
    });
    expect(getQuote).not.toHaveBeenCalled();
    expect(() => service.current('000001', at)).toThrow('需要完整场外基金代码');
  });
  it('真实计算通过分钟仓储发布；休市沿用最后有效事实的原时间', async () => {
    const { input } = fixture();
    const record = vi.fn();
    const latest = vi.fn();
    const today = vi.fn(async () => []);
    const repository = { record, latest, today };
    const service = new MarketFundValuationService(input.market, input.bars as never, repository as never, currencyPrisma as never);
    const result = await service.current(input.symbol, at);
    expect(record).toHaveBeenCalledWith(result, at, expect.objectContaining({ pricedCoverage: 0.25 }));
    latest.mockResolvedValueOnce(result);
    const closed = await service.current(input.symbol, new Date('2026-11-04T13:00:00Z'));
    expect(closed).toMatchObject({ marketState: 'closed', estimatedAt: at.toISOString(), estimatedNav: result.estimatedNav });
    expect(record).toHaveBeenCalledTimes(1);
    const series = await service.today(input.symbol, new Date('2026-11-04T13:01:00Z'));
    expect(series).toMatchObject({ date: '2026-11-04', timezone: 'Asia/Shanghai', points: [] });
  });
});
