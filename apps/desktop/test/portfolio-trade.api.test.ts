import { describe, expect, it, vi } from 'vitest';
import {
  fetchPortfolioTrade,
  fetchPortfolioTrades,
} from '../src/features/portfolio/portfolio-trade.api.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const tradeId = 'trade:trade-projection-v1:account:AAPL.US:buy-1';

describe('Portfolio Trade Desktop 数据访问契约', () => {
  it('读取列表时保留账户、模式、生命周期、标的和分页参数', async () => {
    const client = {
      getTrades: vi.fn(async () => ({
        accountId,
        mode: 'actual' as const,
        items: [],
        nextCursor: null,
        projectionGenerations: {},
      })),
    };

    await fetchPortfolioTrades(
      {
        accountId,
        mode: 'actual',
        symbol: 'AAPL.US',
        lifecycle: 'ENDED',
        cursor: 'cursor-1',
        limit: 50,
      },
      client,
    );

    expect(client.getTrades).toHaveBeenCalledWith({
      accountId,
      mode: 'actual',
      symbol: 'AAPL.US',
      lifecycle: 'ENDED',
      cursor: 'cursor-1',
      limit: 50,
    });
  });

  it('详情读取使用账户和模式作为隔离条件', async () => {
    const client = {
      getTrade: vi.fn(async () => ({ id: tradeId })),
    };

    await fetchPortfolioTrade(accountId, tradeId, 'shadow', client);

    expect(client.getTrade).toHaveBeenCalledWith(accountId, tradeId, 'shadow');
  });
});
