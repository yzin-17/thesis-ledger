import { describe, expect, it, vi } from 'vitest';
import {
  ThesisLedgerApiClient,
  type ThesisLedgerApiError,
  ThesisLedgerContractError,
} from '../../src/index.js';

const id = '00000000-0000-4000-8000-000000000001';
const account = {
  id,
  name: '手机验收账户',
  institution: null,
  type: 'securities',
  mode: 'shadow',
  currency: 'CNY',
  active: true,
};
const input = {
  name: account.name,
  type: 'securities' as const,
  mode: 'shadow' as const,
  currency: 'CNY' as const,
};

describe('跨端账户管理合同', () => {
  it('模式或编辑对象不符的成功响应不能污染当前范围，永久删除严格要求 204', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([{ ...account, mode: 'actual' }]))
      .mockResolvedValueOnce(
        Response.json({ ...account, id: '00000000-0000-4000-8000-000000000009' }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    await expect(client.accounts.list({ mode: 'shadow' })).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
    await expect(client.accounts.save(input, id)).rejects.toBeInstanceOf(ThesisLedgerContractError);
    await expect(client.accounts.permanentDelete(id)).rejects.toBeInstanceOf(
      ThesisLedgerContractError,
    );
  });
  it('创建/编辑经过现有 Schema，204 启停和删除不读取空 JSON', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    expect(await client.accounts.save(input)).toMatchObject(account);
    await client.accounts.save(input, id);
    await client.accounts.setActive(id, false);
    await client.accounts.setActive(id, true);
    await client.accounts.permanentDelete(id);
    expect(fetcher.mock.calls.map(([url, init]) => [String(url), init.method])).toEqual([
      ['https://ledger.test/api/v1/accounts', 'POST'],
      [`https://ledger.test/api/v1/accounts/${id}`, 'PATCH'],
      [`https://ledger.test/api/v1/accounts/${id}`, 'DELETE'],
      [`https://ledger.test/api/v1/accounts/${id}/reactivate`, 'POST'],
      [`https://ledger.test/api/v1/accounts/${id}/permanent`, 'DELETE'],
    ]);
  });
  it('无效输入不发请求，错误响应不当作成功', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id }));
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    expect(() => client.accounts.save({ ...input, name: '' })).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(client.accounts.save(input)).rejects.toBeInstanceOf(ThesisLedgerContractError);
  });
  it('保留 409 中文原因、信号与范围', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([account]))
      .mockResolvedValueOnce(
        Response.json({ error: 'ACCOUNT_IN_USE', message: '账户存在历史记录' }, { status: 409 }),
      );
    const client = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
    const signal = new AbortController().signal;
    await client.accounts.list({ includeInactive: true, mode: 'shadow' }, signal);
    expect(String(fetcher.mock.calls[0]![0])).toBe(
      'https://ledger.test/api/v1/accounts?includeInactive=true&mode=shadow',
    );
    expect(fetcher.mock.calls[0]![1].signal).toBe(signal);
    await expect(client.accounts.permanentDelete(id)).rejects.toMatchObject({
      status: 409,
      payload: { error: 'ACCOUNT_IN_USE', message: '账户存在历史记录' },
    } satisfies Partial<ThesisLedgerApiError>);
  });
});
