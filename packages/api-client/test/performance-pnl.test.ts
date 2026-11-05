import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '../src/index.js';

const response = {
  mode: 'actual',
  accountId: null,
  currency: 'CNY',
  range: '1M',
  basis: 'REALIZED_PLUS_UNREALIZED',
  historyStart: null,
  truncated: false,
  points: [],
};
describe('累计盈亏客户端', () => {
  it('校验完整标的代码与截止时点，拒绝混入组合或其他标的结果', async () => {
    const asOf = '2026-11-04T01:00:00Z';
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...response, symbol: '000001.OF', asOf, currentRealizedPnl: 0 }));
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await expect(client.performance.getPnlSeries({ symbol: '000001.OF', asOf })).resolves.toMatchObject({ symbol: '000001.OF', currentRealizedPnl: 0 });
    expect(String(fetcher.mock.calls[0]![0])).toContain('symbol=000001.OF');
    await expect(client.performance.getPnlSeries({ symbol: '000001.SH', asOf })).rejects.toThrow();
    await expect(client.performance.getPnlSeries({ symbol: '000001.OF', asOf: '2026-11-03T01:00:00Z' })).rejects.toThrow();
    fetcher.mockResolvedValue(Response.json(response));
    await expect(client.performance.getPnlSeries({ symbol: '000001.OF' })).rejects.toThrow();
  });
  it('传递账户模式与取消信号，并拒绝其他范围的响应', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(response));
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    await expect(
      client.performance.getPnlSeries({ mode: 'actual' }, signal),
    ).resolves.toMatchObject(response);
    expect(String(fetcher.mock.calls[0]![0])).toContain('/performance/pnl-series?mode=actual');
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ cache: 'no-store', signal });
    fetcher.mockResolvedValue(Response.json(response));
    await expect(client.performance.getPnlSeries({ mode: 'shadow' })).rejects.toThrow();
  });
});
