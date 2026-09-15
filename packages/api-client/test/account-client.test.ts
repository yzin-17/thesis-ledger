import { describe, expect, it, vi } from 'vitest';
import {
  ThesisLedgerApiClient,
  ThesisLedgerApiError,
  ThesisLedgerContractError,
} from '../src/index.js';

const account = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '证券账户',
  institution: null,
  type: 'securities',
  mode: 'shadow',
  currency: 'CNY',
  active: false,
};

describe('ThesisLedgerApiClient 账户契约', () => {
  it('按 includeInactive 和 mode 查询账户列表并校验响应', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify([account]), { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.accounts.list({ includeInactive: true, mode: 'shadow' })).resolves.toEqual([
      account,
    ]);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      '/accounts?includeInactive=true&mode=shadow',
    );
  });

  it('永久删除使用独立 DELETE 路径并接受 204 空响应', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.accounts.permanentDelete(account.id)).resolves.toBeUndefined();
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      `https://thesis-ledger.test/api/v1/accounts/${account.id}/permanent`,
    );
    expect(fetcher.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('拒绝永久删除返回的非 204 成功状态', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.accounts.permanentDelete(account.id)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });

  it('保留账户关联冲突的共享错误 payload', async () => {
    const payload = {
      error: 'ACCOUNT_IN_USE',
      message: '账户存在持仓记录，无法永久删除',
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 409 }));
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.accounts.permanentDelete(account.id)).rejects.toMatchObject({
      constructor: ThesisLedgerApiError,
      status: 409,
      payload,
    });
  });

  it('拒绝不符合账户响应契约的成功响应', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify([{ ...account, id: 'invalid' }]), { status: 200 }),
      );
    const client = new ThesisLedgerApiClient('https://thesis-ledger.test/api/v1', fetcher);

    await expect(client.accounts.list()).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
});
