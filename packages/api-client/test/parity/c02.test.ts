import { describe, it, expect, vi } from 'vitest';
import { ThesisLedgerApiClient, ThesisLedgerContractError } from '../../src/index.js';
const id = '00000000-0000-4000-8000-000000000001';
const draft = {
  id,
  accountId: id,
  source: 'broker',
  status: 'pending',
  createdAt: '2026-10-22T00:00:00Z',
  review: null,
};
describe('跨端导入与持仓命令', () => {
  it('审核响应不可混入其他账户', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json([{ ...draft, accountId: '00000000-0000-4000-8000-000000000002' }]),
      );
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await expect(api.imports.getReviews(id)).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('保留审核取消信号；multipart 不手工指定 Content-Type', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([draft]))
      .mockResolvedValueOnce(
        Response.json({
          ...draft,
          sourceConfidence: 1,
          scope: 'PARTIAL',
          idempotencyKey: 'screenshot-import-id',
          rows: [],
        }),
      );
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    await api.imports.getReviews(id, signal);
    expect(fetcher.mock.calls[0]![1].signal).toBe(signal);
    const body = new FormData();
    body.append('accountId', id);
    await api.imports.uploadScreenshot(body, id);
    expect(fetcher.mock.calls[1]![1].body).toBe(body);
    expect(fetcher.mock.calls[1]![1].headers).toBeUndefined();
  });
  it('移除和清空保留现行路由，不把确认写入隐藏在读取里', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await api.positionManagement.remove(id);
    await api.positionManagement.clear(id);
    expect(fetcher.mock.calls.map(([url, init]) => [String(url), init.method])).toEqual([
      [`https://ledger.test/api/v1/portfolio/positions/${id}`, 'DELETE'],
      ['https://ledger.test/api/v1/portfolio/positions/clear', 'POST'],
    ]);
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ accountId: id });
  });
});
