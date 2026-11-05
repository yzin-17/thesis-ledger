import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '../../src/index.js';
describe('跨端目录标的合同', () => {
  it('行情绝对路径不能被拼入 /api/v1，搜索不发确认请求', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    await api.market.searchInstruments({ q: '中证 300', limit: 10 }, signal);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]![0])).toBe(
      'https://ledger.test/api/market-data/instruments/search?q=%E4%B8%AD%E8%AF%81+300&limit=10',
    );
    expect(fetcher.mock.calls[0]![1].signal).toBe(signal);
    await api.market.confirmInstrument('a/b');
    expect(String(fetcher.mock.calls[1]![0])).toBe(
      'https://ledger.test/api/market-data/instruments/a%2Fb/confirm',
    );
  });
});
