import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '../src/index.js';

const unavailable = {
  version: 1, symbol: '000001.OF', marketState: 'closed', quality: 'unavailable',
  estimatedNav: null, changePercent: null, anchor: null, estimatedAt: null, oldestPriceAt: null,
  disclosureCoverage: 0, pricedCoverage: 0, reasons: ['market_closed'], method: 'disclosed-holdings-qfq-v1',
};

describe('基金估值公共客户端', () => {
  it('校验完整代码和响应身份，并传递取消信号', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(unavailable)));
    const client = new ThesisLedgerApiClient('http://fixture.invalid', fetcher);
    const signal = new AbortController().signal;
    expect(await client.market.getFundValuation('000001.OF', signal)).toEqual(unavailable);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/api/market/000001.OF/fund-valuation');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ signal, cache: 'no-store' });
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...unavailable, symbol: '161725.OF' })));
    await expect(client.market.getFundValuation('000001.OF')).rejects.toThrow();
    expect(() => client.market.getFundValuation('000001')).toThrow();
  });
  it('不可用不能伪装成零估值或省略原因', async () => {
    const client = new ThesisLedgerApiClient('http://fixture.invalid', async () =>
      new Response(JSON.stringify({ ...unavailable, estimatedNav: 0, reasons: [] })));
    await expect(client.market.getFundValuation('000001.OF')).rejects.toThrow();
  });
  it('今日响应拒绝跨基金、跨日、未来或重复分钟', async () => {
    const row = { at: '2026-11-04T06:00:00Z', valuation: { ...unavailable, marketState: 'open', reasons: ['prices_unavailable'] } };
    const payload = { version: 1, symbol: '000001.OF', date: '2026-11-04', timezone: 'Asia/Shanghai', asOf: '2026-11-04T06:00:30Z', points: [row] };
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload)));
    const client = new ThesisLedgerApiClient('http://fixture.invalid', fetcher);
    expect((await client.market.getFundValuationToday(payload.symbol)).points).toHaveLength(1);
    for (const points of [
      [{ ...row, valuation: { ...row.valuation, symbol: '161725.OF' } }],
      [{ ...row, at: '2026-11-03T06:00:00Z' }],
      [{ ...row, at: '2026-11-04T06:01:00Z' }],
      [row, row],
    ]) {
      fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, points })));
      await expect(client.market.getFundValuationToday(payload.symbol)).rejects.toThrow();
    }
  });
});
