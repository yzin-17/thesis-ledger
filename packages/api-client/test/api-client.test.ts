import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../src/index.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const positionId = '00000000-0000-4000-8000-000000000002';

const valuation = {
  positions: [
    {
      id: positionId,
      accountId,
      symbol: '600519.SH',
      quantity: 1,
      costPrice: 10,
      marketPrice: 11,
      marketValue: 11,
      costValue: 10,
      pnl: 1,
      pnlRatio: 0.1,
      stale: false,
    },
  ],
  cashValue: 5,
  cashByAccount: [{ accountId, amount: 5 }],
  totalCost: 10,
  totalMarketValue: 16,
  totalPnl: 1,
  partial: false,
  mode: 'actual',
  valuedAt: '2026-08-20T00:00:00.000Z',
};

describe('ThesisLedgerApiClient', () => {
  it('保留带路径的 API 基址并清理请求路径前导斜杠', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await client.request('/portfolio/valuation?t=1');

    const [request, init] = fetcher.mock.calls[0] ?? [];
    expect(String(request)).toBe('https://thesis-ledger.test/api/v1/portfolio/valuation?t=1');
    expect(init).toEqual(
      expect.objectContaining({ headers: { 'content-type': 'application/json' } }),
    );
  });

  it('默认 fetch 保留全局上下文', async () => {
    const fetcher = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new Error('fetch receiver mismatch');
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetcher);

    try {
      const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1');

      await expect(client.request('/health')).resolves.toEqual({ ok: true });
      expect(fetcher).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('typed portfolio endpoint validates the shared response schema', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(valuation), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.portfolio.getValuation({ mode: 'actual' })).resolves.toMatchObject({
      cashValue: 5,
      totalMarketValue: 16,
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/portfolio/valuation?mode=actual');
  });

  it('typed endpoint rejects malformed successful responses instead of normalizing them', async () => {
    const malformed = { ...valuation } as Record<string, unknown>;
    delete malformed.cashValue;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.portfolio.getValuation()).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });

  it('将非 2xx 响应转换为共享错误模型', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'offline', message: '服务不可用' }), { status: 503 }),
      );
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.request('/health')).rejects.toThrow('ThesisLedger API 503: 服务不可用');
  });
});
