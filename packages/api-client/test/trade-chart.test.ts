import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '../src/index.js';

const input = {
  accountId: '90000000-0000-4000-8000-000000000001',
  mode: 'actual' as const,
  symbol: 'SPY.US',
  start: '2026-11-04',
  end: '2026-11-04',
};
const response = {
  version: 'trade-chart-v1',
  ...input,
  status: 'ready',
  markers: [],
  ledgerRevision: '4',
  projectionGeneration: '2',
  generatedAt: '2026-11-04T15:00:00Z',
  omittedCount: 0,
  unplacedCount: 0,
  unplacedCountScope: 'symbol-all-dates',
};
describe('成交图表客户端', () => {
  it('账户、模式和可见窗口同请求且响应归属严格匹配', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(response));
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    await expect(client.portfolio.getTradeChart(input, signal)).resolves.toMatchObject(response);
    expect(String(fetcher.mock.calls[0]![0])).toContain('/portfolio/trades/chart?');
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ signal, cache: 'no-store' });
    await expect(client.portfolio.getTradeChart({ ...input, mode: 'shadow' })).rejects.toThrow();
  });
  it('倒序窗口零发送', async () => {
    const fetcher = vi.fn();
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    expect(() => client.portfolio.getTradeChart({ ...input, end: '2026-11-03' })).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
