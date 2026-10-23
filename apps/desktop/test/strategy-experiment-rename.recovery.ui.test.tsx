// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategyExperimentListPage } from '../src/features/strategy/StrategyExperimentListPage.js';
import type { OptimizationExperimentSummary } from '../src/features/strategy/strategy-optimization.api.js';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  rename: vi.fn(),
  toast: vi.fn(),
  closeToast: vi.fn(),
}));

vi.mock('../src/features/strategy/strategy-optimization.api.js', async (original) => ({
  ...(await original<object>()),
  fetchOptimizationExperiments: api.list,
  renameOptimizationExperiment: api.rename,
}));

vi.mock('../src/components/ui/toast', () => ({
  useToastManager: () => ({ add: api.toast, close: api.closeToast }),
}));

const initialEntry =
  '/strategy/experiments?search=Alpha&sourceMode=discovery&status=succeeded&cursor=page-cursor&trail=previous-cursor';
const expectedFilters = {
  limit: 25,
  cursor: 'page-cursor',
  search: 'Alpha',
  sourceMode: 'discovery',
  status: 'succeeded',
};
const betaFilters = {
  limit: 25,
  search: 'Beta',
  sourceMode: 'discovery',
  status: 'succeeded',
};
const experiment = (name: string, id = 'experiment-1') =>
  ({
    id,
    name,
    nameSource: 'stored',
    sourceMode: 'discovery',
    baselineStrategyVersionId: 'baseline-1',
    status: 'running',
    stage: 'running',
    objective: {},
    split: {},
    modelConfig: [],
    aiCallsUsed: 0,
    backtestRunsUsed: 0,
    inputTokensUsed: 0,
    outputTokensUsed: 0,
    costUsed: null,
    costSummary: {},
    tradingCost: {},
    createdAt: '2026-10-18T00:00:00.000Z',
    updatedAt: '2026-10-18T00:00:00.000Z',
  }) as unknown as OptimizationExperimentSummary;
const page = (item: OptimizationExperimentSummary) => ({
  items: [item],
  totalCount: 1,
  pageInfo: { hasNextPage: false, nextCursor: null },
});
const emptyPage = () => ({
  items: [],
  totalCount: 0,
  pageInfo: { hasNextPage: false, nextCursor: null },
});

function CacheProbe({
  queryKey,
  queryFn,
}: {
  queryKey: readonly unknown[];
  queryFn: () => Promise<string>;
}) {
  useQuery({ queryKey, queryFn, staleTime: Infinity });
  return null;
}

const cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  api.toast.mockReturnValue('controlled-toast');
  api.list.mockResolvedValue(page(experiment('旧名称')));
});

afterEach(async () => {
  await act(async () => cleanups.splice(0).forEach((cleanup) => cleanup()));
  vi.unstubAllGlobals();
});

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="路由筛选范围">{location.search}</output>;
}

async function mount(
  cacheProbes: Array<{
    queryKey: readonly unknown[];
    queryFn: () => Promise<string>;
  }> = [],
) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  cleanups.push(() => {
    root.unmount();
    client.clear();
    host.remove();
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <LocationProbe />
          {cacheProbes.map((probe) => (
            <CacheProbe key={probe.queryKey.join(':')} {...probe} />
          ))}
          <StrategyExperimentListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  return client;
}

async function waitFor(check: () => void) {
  await vi.waitFor(async () => {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    check();
  });
}

function renameInput() {
  return document.querySelector<HTMLInputElement>('input[aria-label="新的实验名称"]');
}

function button(label: string) {
  const control = [...document.querySelectorAll('button,[role="menuitem"]')].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!control) throw new Error(`缺少操作：${label}`);
  return control as HTMLButtonElement;
}

async function click(label: string) {
  await act(async () => button(label).click());
}

async function setInputValue(value: string) {
  const input = renameInput();
  if (!input) throw new Error('缺少实验名称输入框');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function pressKey(key: string) {
  const input = renameInput();
  if (!input) throw new Error('缺少实验名称输入框');
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}

async function beginRename(name = '旧名称') {
  await waitFor(() => expect(document.querySelector(`[aria-label="管理 ${name}"]`)).not.toBeNull());
  await act(async () => {
    document.querySelector<HTMLButtonElement>(`[aria-label="管理 ${name}"]`)!.click();
  });
  await waitFor(() =>
    expect(document.querySelector('[role="menuitem"]')?.textContent).toContain('修改名称'),
  );
  await click('修改名称');
  await waitFor(() => expect(renameInput()).not.toBeNull());
}

async function setSearchValue(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="搜索实验"]');
  if (!input) throw new Error('缺少实验搜索框');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function expectListContextPreserved() {
  const query = new URLSearchParams(
    document.querySelector('[aria-label="路由筛选范围"]')?.textContent ?? '',
  );
  expect(query.get('search')).toBe('Alpha');
  expect(query.get('sourceMode')).toBe('discovery');
  expect(query.get('status')).toBe('succeeded');
  expect(query.get('cursor')).toBe('page-cursor');
  expect(query.get('trail')).toBe('previous-cursor');
  for (const [filters] of api.list.mock.calls) expect(filters).toEqual(expectedFilters);
}

describe('策略实验列表行内更名恢复', () => {
  it.each([
    ['按钮', false], ['按钮', true], ['Escape', false], ['Escape', true],
  ] as const)('%s 取消未保存改名，已修改=%s', async (action, dirty) => {
    await mount();
    await beginRename();
    if (dirty) await setInputValue('尚未保存的名称');
    if (action === '按钮') await click('取消'); else await pressKey('Escape');
    expect(renameInput()).toBeNull();
    expect(document.querySelector('[aria-label="管理 旧名称"]')).not.toBeNull();
    expect(api.rename).not.toHaveBeenCalled();
  });

  it('保存失败后可通过可见按钮取消草稿，再次编辑仍为原名', async () => {
    api.rename.mockRejectedValueOnce(new Error('503 Service Unavailable'));
    await mount(); await beginRename(); await setInputValue('失败的名称'); await click('保存');
    await waitFor(() => expect(api.toast).toHaveBeenCalled());
    await click('取消');
    expect(renameInput()).toBeNull();
    await beginRename(); expect(renameInput()?.value).toBe('旧名称');
    expect(api.rename).toHaveBeenCalledTimes(1);
  });

  it('首次列表 GET 503 不显示空列表或零条；GET 重试恢复为真实空态', async () => {
    let rejectInitialRead!: (reason?: unknown) => void;
    api.list
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectInitialRead = reject;
          }),
      )
      .mockResolvedValueOnce(emptyPage());

    await mount();
    expect(document.querySelector('.data-state-banner.loading')).not.toBeNull();
    expect(document.body.textContent).not.toContain('没有匹配的实验');
    expect(document.body.textContent).not.toContain('共 0 条');

    await act(async () => rejectInitialRead(new Error('503 Service Unavailable')));
    await waitFor(() => expect(document.querySelector('.data-state-banner.error')).not.toBeNull());

    expect(document.body.textContent).toContain('数据读取失败');
    expect(document.body.textContent).not.toContain('没有匹配的实验');
    expect(document.body.textContent).not.toContain('共 0 条');
    expect((button('重新加载') as HTMLButtonElement).disabled).toBe(false);
    expect(api.rename).not.toHaveBeenCalled();
    expectListContextPreserved();

    await click('重新加载');
    await waitFor(() => expect(document.body.textContent).toContain('没有匹配的实验'));

    expect(document.body.textContent).toContain('共 0 条');
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.rename).not.toHaveBeenCalled();
    expectListContextPreserved();
  });

  it('同一轮双 Enter 只提交一次；提交期间输入与 Escape 都不能改变意图', async () => {
    const updated = experiment('新名称');
    let finishRename!: (result: OptimizationExperimentSummary) => void;
    api.list.mockResolvedValueOnce(page(experiment('旧名称'))).mockResolvedValueOnce(page(updated));
    api.rename.mockImplementationOnce(
      () =>
        new Promise<OptimizationExperimentSummary>((resolve) => {
          finishRename = resolve;
        }),
    );

    await mount();
    await beginRename();
    await setInputValue('新名称');
    await act(async () => {
      await pressKey('Enter');
      await pressKey('Enter');
    });

    expect(api.rename).toHaveBeenCalledTimes(1);
    expect(api.rename).toHaveBeenCalledWith('experiment-1', '新名称');
    await waitFor(() => expect(renameInput()?.disabled).toBe(true));
    expect(button('取消').disabled).toBe(true);
    await pressKey('Escape');
    expect(renameInput()).not.toBeNull();
    expect(renameInput()?.value).toBe('新名称');

    await act(async () => finishRename(updated));
    await waitFor(() => expect(renameInput()).toBeNull());
    expect(document.body.textContent).toContain('新名称');
    expect(api.list).toHaveBeenCalledTimes(2);
    expectListContextPreserved();
  });

  it('PATCH 503 保留草稿，用户重试后完成读取', async () => {
    const updated = experiment('重试后的名称');
    api.list.mockResolvedValueOnce(page(experiment('旧名称'))).mockResolvedValueOnce(page(updated));
    api.rename
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockResolvedValueOnce(updated);

    await mount();
    await beginRename();
    await setInputValue('重试后的名称');
    await pressKey('Enter');
    await waitFor(() =>
      expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })),
    );

    expect(renameInput()?.value).toBe('重试后的名称');
    expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: '改名失败', description: '服务暂时无法完成本次操作，请稍后重试。',
    }));
    expect(renameInput()?.disabled).toBe(false);
    expect(api.list).toHaveBeenCalledTimes(1);
    await click('保存');
    await waitFor(() => expect(renameInput()).toBeNull());

    expect(api.rename).toHaveBeenCalledTimes(2);
    expect(api.rename).toHaveBeenNthCalledWith(2, 'experiment-1', '重试后的名称');
    expect(api.list).toHaveBeenCalledTimes(2);
    expectListContextPreserved();
  });

  it('PATCH 成功后列表 GET 503 保留已保存名称，恢复只重读且不重复写', async () => {
    const updated = experiment('已保存的新名称');
    const detailKey = [
      'desktop',
      'strategy',
      'optimization',
      'experiment',
      'experiment-1',
    ] as const;
    const compareKey = ['desktop', 'strategy', 'optimization', 'compare', 'experiment-1'] as const;
    const readDetail = vi.fn().mockResolvedValue('detail-cache');
    const readCompare = vi.fn().mockResolvedValue('compare-cache');
    api.list
      .mockResolvedValueOnce(page(experiment('旧名称')))
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockResolvedValueOnce(page(updated));
    api.rename.mockResolvedValueOnce(updated);

    const client = await mount([
      { queryKey: detailKey, queryFn: readDetail },
      { queryKey: compareKey, queryFn: readCompare },
    ]);
    await waitFor(() => {
      expect(readDetail).toHaveBeenCalledTimes(1);
      expect(readCompare).toHaveBeenCalledTimes(1);
    });
    await beginRename();
    await setInputValue('已保存的新名称');
    await pressKey('Enter');
    await waitFor(() =>
      expect(document.querySelector('[role="status"]')?.textContent).toContain('列表确认读取失败'),
    );

    expect(renameInput()?.value).toBe('已保存的新名称');
    expect(renameInput()?.disabled).toBe(true);
    expect(button('取消').disabled).toBe(true);
    expect(api.rename).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(readDetail).toHaveBeenCalledTimes(1);
    expect(readCompare).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(compareKey)?.isInvalidated).toBe(true);
    expectListContextPreserved();

    await click('重新加载');
    await waitFor(() => expect(renameInput()).toBeNull());
    expect(document.body.textContent).toContain('已保存的新名称');
    expect(api.rename).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledTimes(3);
    expect(readDetail).toHaveBeenCalledTimes(1);
    expect(readCompare).toHaveBeenCalledTimes(1);
    expectListContextPreserved();
  });

  it('改筛选排除原行后仍可看见已保存名称并 GET 恢复，恢复后其他行可改名', async () => {
    const updated = experiment('已保存的新名称');
    const other = experiment('Beta 同行', 'experiment-2');
    api.list
      .mockResolvedValueOnce(page(experiment('旧名称')))
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockResolvedValueOnce(page(other))
      .mockResolvedValueOnce(page(other));
    api.rename.mockResolvedValueOnce(updated);

    await mount();
    await beginRename();
    await setInputValue('已保存的新名称');
    await pressKey('Enter');
    await waitFor(() =>
      expect(document.querySelector('[role="status"]')?.textContent).toContain('列表确认读取失败'),
    );
    expect(renameInput()?.value).toBe('已保存的新名称');
    expect(renameInput()?.disabled).toBe(true);
    expect(api.rename).toHaveBeenCalledTimes(1);

    await setSearchValue('Beta');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
    await waitFor(() => {
      const query = new URLSearchParams(
        document.querySelector('[aria-label="路由筛选范围"]')?.textContent ?? '',
      );
      expect(query.get('search')).toBe('Beta');
      expect(api.list).toHaveBeenCalledTimes(3);
    });
    expect(api.list).toHaveBeenNthCalledWith(3, betaFilters);
    await waitFor(() =>
      expect(document.querySelector('[aria-label="管理 Beta 同行"]')).not.toBeNull(),
    );

    expect(document.querySelector('[aria-label="管理 旧名称"]')).toBeNull();
    expect(document.body.textContent).toContain('已保存的新名称');
    expect(document.body.textContent).toContain('列表确认读取失败');
    expect((button('重新加载') as HTMLButtonElement).disabled).toBe(false);
    expect(api.rename).toHaveBeenCalledTimes(1);
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="管理 Beta 同行"]')!.click();
    });
    await waitFor(() => expect(document.querySelector('[role="menuitem"]')).not.toBeNull());
    expect(document.querySelector('[role="menuitem"]')?.getAttribute('aria-disabled')).toBe('true');
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="管理 Beta 同行"]')!.click();
    });

    await click('重新加载');
    await waitFor(() => {
      expect(api.list).toHaveBeenCalledTimes(4);
      expect(api.list).toHaveBeenNthCalledWith(4, betaFilters);
      expect(document.body.textContent).not.toContain('实验「已保存的新名称」已保存');
      expect(document.querySelector('[aria-label="管理 Beta 同行"]')).not.toBeNull();
    });
    expect(api.list).toHaveBeenCalledTimes(4);
    expect(api.rename).toHaveBeenCalledTimes(1);

    await beginRename('Beta 同行');
    expect(renameInput()?.value).toBe('Beta 同行');
    expect(api.rename).toHaveBeenCalledTimes(1);
  });
});
