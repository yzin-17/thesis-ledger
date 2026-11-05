import { describe, expect, it, vi } from 'vitest';
import { portfolioQuoteBatch } from '../../src/portfolio/portfolio-quote-batch.js';
import { valuePortfolioPosition } from '../../src/portfolio/portfolio-position-valuation.js';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';
import type { QuoteBatchResult } from '../../src/market/market-quote-batch.js';
import type { Quote, MarketQuoteIdentity } from '@thesis-ledger/schemas';

const position = (symbol = '600519.SH', assetType = 'stock') => ({
  symbol,
  quantity: '100',
  costPrice: '10',
  asset: { assetType },
});
const quote = (symbol: string) => ({ symbol, price: 11, previousClose: 10, stale: false }) as Quote;

describe('组合显式持仓批次', () => {
  it('重复跨账户持仓共享结果，基金仍走净值且不进入Quote批次', async () => {
    const positions = [position(), position(), position('000001.OF', 'fund')];
    const market = {
      getQuote: vi.fn(async (symbol: string) => quote(symbol)),
      getFundNav: vi.fn(async () => ({
        unitNav: 1.1,
        navDate: '2026-11-04',
        freshness: 'delayed',
      })),
      getQuotes: vi.fn(
        async (items: readonly MarketQuoteIdentity[]) =>
          items.map((identity) => ({
            identity,
            outcome: { status: 'fulfilled', value: quote(identity.symbol) },
          })) as QuoteBatchResult[],
      ),
    };
    const reader = portfolioQuoteBatch(positions, market);
    const values = await Promise.all(
      positions.map((row) => valuePortfolioPosition(row, 'CNY', reader)),
    );
    expect(market.getQuotes).toHaveBeenCalledWith([{ symbol: '600519.SH', assetType: 'STOCK' }]);
    expect(market.getQuote).not.toHaveBeenCalled();
    expect(market.getFundNav).toHaveBeenCalledOnce();
    expect(values.map((value) => value.marketValue)).toEqual([1100, 1100, 110]);
  });

  it('逐证券保留原控制拒绝，不把行情不可用改成零或stale', async () => {
    const error = new DsaError('controlled', 'control-rejected', 422, 'not_selected');
    const positions = [position()];
    const market = {
      getQuote: vi.fn(),
      getQuotes: vi.fn(
        async (items: readonly MarketQuoteIdentity[]) =>
          items.map((identity) => ({
            identity,
            outcome: { status: 'rejected', reason: error },
          })) as QuoteBatchResult[],
      ),
    };
    const value = await valuePortfolioPosition(
      positions[0]!,
      'CNY',
      portfolioQuoteBatch(positions, market),
    );
    expect(value).toMatchObject({
      marketPrice: null,
      marketValue: null,
      pnl: null,
      availabilityReason: 'not_selected',
      stale: false,
    });
  });

  it('清零及冲突身份不创建批次，已存在读取接口仍可消费', async () => {
    const market = { getQuote: vi.fn(async (symbol: string) => quote(symbol)), getQuotes: vi.fn() };
    expect(portfolioQuoteBatch([{ ...position(), quantity: '0' }], market)).toBe(market);
    expect(portfolioQuoteBatch([position(), position('600519.SH', 'etf')], market)).toBe(market);
    expect(market.getQuotes).not.toHaveBeenCalled();
  });
});
