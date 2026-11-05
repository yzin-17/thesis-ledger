// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi, view } from './mobile-view-harness';
import { AccountEditor } from '../../src/features/accounts/AccountEditor';
import { AccountsScreen } from '../../src/features/accounts/AccountsScreen';

const account = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '受控模拟账户',
  institution: null,
  type: 'securities',
  mode: 'shadow',
  currency: 'CNY',
  active: true,
};
describe('手机账户交互与写入保护', () => {
  it('保存失败保留输入与离开保护，成功重试使用当前模拟模式', async () => {
    const writes = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: 'CONFLICT', message: '账户名冲突' }, { status: 409 }),
      )
      .mockResolvedValueOnce(Response.json(account))
      .mockResolvedValueOnce(Response.json({ ...account, name: '更名后的账户' }));
    const fetcher = vi.fn((url: string, init?: RequestInit) =>
      init?.method ? writes(url, init) : Promise.resolve(Response.json([account])),
    );
    setApi(fetcher);
    await mount(<AccountEditor />);
    await input(field('账户名称'), account.name);
    await click(button('保存账户'));
    expect(field('账户名称').value).toBe(account.name);
    expect(document.body.textContent).toContain('账户名冲突');
    expect(view.dirty.mock.calls.at(-1)?.[0]).toBe(true);
    await click(button('保存账户'));
    expect(JSON.parse(writes.mock.calls[1]![1].body)).toMatchObject({
      name: account.name,
      mode: 'shadow',
    });
    expect(document.body.textContent).toContain('账户已保存。');
    expect(button('保存账户').disabled).toBe(true);
    await input(field('账户名称'), '更名后的账户');
    expect(document.body.textContent).not.toContain('账户已保存。');
    await click(button('保存账户'));
    expect(writes.mock.calls[2]![1].method).toBe('PATCH');
    expect(String(writes.mock.calls[2]![0]).endsWith(`/accounts/${account.id}`)).toBe(true);
  });
  it.each([false, true])(
    '账户列表读取失败时禁止保存（已有账户：%s），重读成功后恢复',
    async (editing) => {
      let readable = false;
      const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method) return Response.json({ ...account, name: '读取恢复后的账户' });
        if (!readable)
          return Response.json({ error: 'READ_FAILED', message: '列表读取失败' }, { status: 502 });
        return Response.json([account]);
      });
      setApi(fetcher);
      view.params = editing ? { account } : {};
      await mount(<AccountEditor />);
      await input(field('账户名称'), '读取恢复后的账户');
      expect(button('保存账户').disabled).toBe(true);
      await click(button('保存账户'));
      expect(fetcher.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
      readable = true;
      await click(button('重新读取'));
      expect(button('保存账户').disabled).toBe(false);
      await click(button('保存账户'));
      expect(fetcher.mock.calls.filter(([, init]) => init?.method)).toHaveLength(1);
    },
  );
  it('确认取消不删除，409 业务拒绝保留账户，列表失败不当作空列表', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([account]))
      .mockResolvedValueOnce(
        Response.json({ error: 'ACCOUNT_IN_USE', message: '账户存在历史记录' }, { status: 409 }),
      );
    setApi(fetcher);
    await mount(<AccountsScreen />);
    view.confirm.mockResolvedValueOnce(false);
    await click(button('永久删除'));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(view.notice).not.toHaveBeenCalled();
    await click(button('永久删除'));
    expect(document.body.textContent).toContain('账户存在历史记录');
    expect(document.body.textContent).toContain(account.name);
    expect(view.notice).toHaveBeenCalledOnce();
    expect(view.notice).toHaveBeenCalledWith('账户操作未完成', `${account.name}\n账户存在历史记录`);
  });
  it('名称或机构筛选不重发读取，操作绑定筛选后的账户', async () => {
    const second = {
      ...account,
      id: '00000000-0000-4000-8000-000000000002',
      name: '另一个模拟账户',
      institution: '验收机构',
    };
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method
        ? Response.json({ error: 'ACCOUNT_IN_USE', message: '账户存在历史记录' }, { status: 409 })
        : Response.json([account, second]),
    );
    setApi(fetcher);
    await mount(<AccountsScreen />);
    await vi.waitFor(() => expect(button('永久删除')).toBeDefined());
    await input(field('按名称或机构筛选'), '验收机构');
    expect(document.querySelectorAll('section')).toHaveLength(1);
    expect(document.querySelector('section')?.textContent).toContain(second.name);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await click(button('永久删除'));
    expect(String(fetcher.mock.calls[1]![0])).toContain(`/accounts/${second.id}/permanent`);
    await input(field('按名称或机构筛选'), '没有匹配');
    expect(document.body.textContent).toContain('没有匹配的账户');
    await click(button('清除筛选'));
    expect(document.querySelectorAll('section')).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('缓存列表重读失败时保留账户并禁止状态写入，恢复读取后再允许', async () => {
    let readable = true;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method) return Response.json(account);
      if (readable) return Response.json([account]);
      return Response.json({ error: 'READ_FAILED', message: '账户读取失败' }, { status: 502 });
    });
    setApi(fetcher);
    const client = await mount(<AccountsScreen />);
    await vi.waitFor(() => expect(button('停用账户')?.disabled).toBe(false));
    readable = false;
    await act(() =>
      client.invalidateQueries({ queryKey: [...(view.runtime.scope as string[]), 'accounts'] }),
    );
    await vi.waitFor(() => expect(button('重新读取')).toBeDefined());
    expect(document.body.textContent).toContain(account.name);
    expect(button('停用账户').disabled).toBe(true);
    expect(button('永久删除').disabled).toBe(true);
    await click(button('停用账户'));
    expect(view.confirm).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.some(([, init]) => init?.method)).toBe(false);
    readable = true;
    await click(button('重新读取'));
    expect(button('停用账户').disabled).toBe(false);
  });
  it('末尾账户更新成功但重读失败时显示具名原生提示，不重复写入', async () => {
    const last = { ...account, id: '00000000-0000-4000-8000-000000000002', name: '末尾账户' };
    let reads = 0;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method) return Response.json({ ...last, active: false });
      reads += 1;
      if (reads === 1) return Response.json([account, last]);
      throw new Error('列表读取失败');
    });
    setApi(fetcher);
    await mount(<AccountsScreen />);
    const section = [...document.querySelectorAll('section')].find((node) =>
      node.textContent?.includes(last.name),
    )!;
    const deactivate = [...section.querySelectorAll('button')].find(
      (node) => node.textContent === '停用账户',
    )!;
    await click(deactivate);
    expect(view.notice).toHaveBeenCalledWith(
      '账户操作已成功',
      `${last.name}\n列表尚未刷新，请重新读取。`,
    );
    expect(fetcher.mock.calls.filter(([, init]) => init?.method)).toHaveLength(1);
  });
  it('保存已成功但列表重读失败时只写一次，明确提示刷新失败', async () => {
    let reads = 0;
    const fetcher = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.method === 'PATCH') return Response.json({ ...account, name: '更名受控账户' });
      reads += 1;
      if (reads === 1) return Response.json([account]);
      throw new Error('列表暂不可用');
    });
    setApi(fetcher);
    view.params = { account };
    await mount(
      <>
        <AccountsScreen />
        <AccountEditor />
      </>,
    );
    await input(field('账户名称'), '更名受控账户');
    await click(button('保存账户'));
    expect(document.body.textContent).toContain('账户已保存');
    expect(document.body.textContent).toContain('列表尚未刷新');
    expect(button('保存账户').disabled).toBe(true);
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(writes).toHaveLength(1);
  });
});
