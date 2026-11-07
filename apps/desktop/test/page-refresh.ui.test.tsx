// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePageRefresh } from '../src/features/shared/usePageRefresh.js';
import { RefreshIconButton } from '../src/features/shared/RefreshIconButton.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const first = vi.fn();
const second = vi.fn();
const disabled = vi.fn();
const other = vi.fn();
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

function Harness() {
  const one = useQuery({ queryKey: ['page', 'first', { mode: 'shadow', accountId: 'a', cursor: 'p2' }], queryFn: first, staleTime: Infinity });
  useQuery({ queryKey: ['page', 'second'], queryFn: second, staleTime: Infinity });
  useQuery({ queryKey: ['page', 'disabled'], queryFn: disabled, enabled: false });
  useQuery({ queryKey: ['other'], queryFn: other, staleTime: Infinity });
  const page = usePageRefresh([{ queryKey: ['page'] }, { queryKey: ['page', 'first'] }]);
  return <><RefreshIconButton label="刷新页面" refreshing={page.refreshing} onClick={() => void page.refresh()} /><span>{one.isError ? '查询失败' : one.data}</span></>;
}
const settle = async () => { await act(async () => new Promise((resolve) => setTimeout(resolve, 5))); };
const button = () => host.querySelector('button')!;
beforeEach(async () => {
  for (const fn of [first, second, disabled, other]) fn.mockReset().mockResolvedValue('原数据');
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryDefaults(['page', 'unmounted'], { queryFn: disabled });
  client.setQueryData(['page', 'unmounted'], '未展示缓存');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>));
  await settle();
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); });

describe('页面只读刷新调度', () => {
  it('范围重叠只执行一次，保留原查询参数，停用与未展示查询不启动', async () => {
    await act(async () => button().click()); await settle();
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
    expect(first.mock.calls.at(-1)![0].queryKey).toEqual(['page', 'first', { mode: 'shadow', accountId: 'a', cursor: 'p2' }]);
    expect(disabled).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['page', 'unmounted'])).toBe('未展示缓存');
  });
  it('等待全部子查询，较快查询结束后按钮仍禁用', async () => {
    let finishFirst!: (value: string) => void;
    let finishSecond!: (value: string) => void;
    first.mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }));
    second.mockReturnValueOnce(new Promise((resolve) => { finishSecond = resolve; }));
    await act(async () => button().click()); await settle();
    expect(button().disabled).toBe(true);
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(button().querySelector('[data-slot="spinner"]')).not.toBeNull();
    expect(host.textContent).toContain('原数据');
    await act(async () => finishFirst('较快查询完成')); await settle();
    expect(button().disabled).toBe(true);
    expect(button().querySelector('[data-slot="spinner"]')).not.toBeNull();
    await act(async () => finishSecond('较慢查询完成')); await settle();
    expect(button().disabled).toBe(false);
    expect(button().getAttribute('aria-busy')).toBe('false');
    expect(button().querySelector('[data-slot="spinner"]')).toBeNull();
  });
  it('错误后结束刷新状态，保留查询自己的失败信息并允许恢复', async () => {
    first.mockRejectedValueOnce(new Error('读取失败'));
    await act(async () => button().click()); await settle();
    expect(button().disabled).toBe(false); expect(host.textContent).toContain('查询失败');
    first.mockResolvedValueOnce('恢复结果');
    await act(async () => button().click()); await settle();
    expect(host.textContent).toContain('恢复结果');
  });
});
