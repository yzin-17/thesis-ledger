// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi, view } from './mobile-view-harness';
import { CashEditor } from '../../src/features/cash-observations/CashEditor';
import {
  buildCashDeposit,
  buildCashObservation,
  initialCashForm,
} from '../../src/features/cash-observations/cash-command';
import { emptyLedger, ledgerAccount, ledgerAccountId, ledgerWriteResult } from './ledger-fixture';

const account = {
  ...ledgerAccount,
  type: 'cash' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
};
const time = '2026-10-23T01:00:00Z';
const form = { ...initialCashForm('CNY'), amount: '100.25', occurredAt: time };

describe('M08a 现金观察与手工入账', () => {
  it('快照允许零余额，拒绝未来时间与负值；入账拒绝模拟范围和异币种', () => {
    expect(
      buildCashObservation({ ...form, amount: '0' }, account.id, Date.parse(time)).amount,
    ).toBe('0');
    expect(() => buildCashObservation(form, account.id, Date.parse(time) - 1)).toThrow('晚于');
    expect(() =>
      buildCashObservation({ ...form, amount: '-1' }, account.id, Date.parse(time)),
    ).toThrow();
    expect(() =>
      buildCashDeposit(form, { ...account, mode: 'shadow' }, crypto.randomUUID()),
    ).toThrow('实际');
    expect(() =>
      buildCashDeposit({ ...form, currency: 'USD' }, account, crypto.randomUUID()),
    ).toThrow('币种');
  });

  it('读取失败禁写，输入不会因刷新失败被清空', async () => {
    view.params = { accountId: account.id, kind: 'observation' };
    setApi(vi.fn().mockResolvedValue(Response.json({ message: '离线' }, { status: 503 })));
    await mount(<CashEditor />);
    expect(button('保存现金记录').disabled).toBe(true);
  });

  it('同一入账网络重试使用稳定命令 ID，成功后刷新失败不再次提交', async () => {
    view.params = { accountId: account.id, kind: 'deposit' };
    view.runtime.mode = 'actual';
    view.runtime.scope = ['mobile-v2', 'https://ledger.test/api/v1', 'actual', 'all'];
    const commands: Array<Record<string, unknown>> = [];
    let written = false;
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (init?.method === 'POST') {
        commands.push(JSON.parse(String(init.body)));
        if (commands.length === 1) throw new TypeError('network failure');
        written = true;
        return Response.json(ledgerWriteResult);
      }
      if (written) return Response.json({ message: '刷新失败' }, { status: 503 });
      if (path.includes('/accounts')) return Response.json([account]);
      return Response.json(emptyLedger);
    });
    setApi(fetcher);
    await mount(<CashEditor />);
    await input(field('入账金额'), form.amount);
    await input(field('入账 ISO 时间'), time);
    await click(button('保存现金记录'));
    expect(field('入账金额').value).toBe('100.25');
    await click(button('保存现金记录'));
    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual(commands[1]);
    expect(document.body.textContent).toContain('请勿重复提交');
    expect(button('保存现金记录').disabled).toBe(true);
    expect(commands[0]?.accountId).toBe(ledgerAccountId);
  });
});
