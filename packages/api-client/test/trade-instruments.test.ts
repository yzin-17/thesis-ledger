import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '../src/index.js';
import { tradeInstrumentsQuerySchema } from '@thesis-ledger/schemas';

describe('交易标的客户端', () => {
  it('传递范围与取消信号，并校验响应归属', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          mode: 'actual',
          accountId: null,
          items: [{ symbol: '000001.OF', displayName: '华夏成长混合' }],
        }),
      );
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    expect((await client.portfolio.getTradeInstruments({}, signal)).items).toHaveLength(1);
    expect(String(fetcher.mock.calls[0]![0])).toContain(
      '/portfolio/trades/instruments?mode=actual',
    );
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ signal });
    fetcher.mockResolvedValue(Response.json({ mode: 'actual', accountId: null, items: [] }));
    await expect(client.portfolio.getTradeInstruments({ mode: 'shadow' })).rejects.toThrow();
  });
  it('仅接受账户和模式，拒绝无效账户', () => {
    expect(tradeInstrumentsQuerySchema.safeParse({ accountId: 'invalid' }).success).toBe(false);
    expect(tradeInstrumentsQuerySchema.safeParse({ symbol: '600' }).success).toBe(false);
  });
});
