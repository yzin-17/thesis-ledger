import { describe, expect, it, vi } from 'vitest';
import { ThesisLedgerApiClient } from '../src/index.js';

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

  it('将非 2xx 响应转换为可追踪错误', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.request('/health')).rejects.toThrow('ThesisLedger API 503');
  });
});
