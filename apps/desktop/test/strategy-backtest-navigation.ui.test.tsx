// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import type { Location, NavigateFunction } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategyBacktestJobsPage } from '../src/features/strategy/StrategyBacktestJobsPage.js';
import { StrategyBacktestDetailPage } from '../src/features/strategy/StrategyBacktestDetailPage.js';

const api = vi.hoisted(() => ({ groups: vi.fn(), job: vi.fn() }));
vi.mock('../src/features/strategy/strategy-optimization.api.js', () => ({
  fetchStrategyBacktestGroups: api.groups,
}));
vi.mock('../src/features/strategy/strategy.api.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchBacktestJob: api.job,
}));
vi.mock('../src/features/strategy/StrategyBacktestDetailSections.js', () => ({
  StrategyBacktestResultTabs: () => <div>受控结果区域</div>,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanup: Array<() => Promise<void>> = [];
const job = { id: 'job-1', strategyVersionId: 'version-1', status: 'succeeded' };
const page = {
  items: [{ id: 'group-1', kind: 'user', name: '筛选任务', jobs: [job], members: [] }],
  totalCount: 1,
  pageInfo: { hasNextPage: false, nextCursor: null },
};

async function mount(initialEntry: string | { pathname: string; state: unknown }) {
  const router = {} as { location: Location; navigate: NavigateFunction };
  function RouteObserver() {
    router.location = useLocation();
    router.navigate = useNavigate();
    return null;
  }
  const content = (
    <MemoryRouter initialEntries={[initialEntry]}>
      <RouteObserver />
      <Routes>
        <Route path="/strategy/jobs" element={<StrategyBacktestJobsPage strategies={[]} />} />
        <Route
          path="/strategy/jobs/:jobId"
          element={
            <StrategyBacktestDetailPage
              strategies={[]}
              strategiesLoading={false}
              busyAction={null}
              onRun={vi.fn()}
              onCancel={vi.fn()}
              onRetry={vi.fn()}
              onRerun={vi.fn()}
            />
          }
        />
      </Routes>
    </MemoryRouter>
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
  });
  cleanup.push(async () => {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  });
  return router;
}

async function waitFor(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    assertion();
  });
}

async function clickLink(text: string) {
  const link = Array.from(document.querySelectorAll('a')).find((item) => item.textContent === text);
  expect(link, text).toBeDefined();
  await act(async () => link!.click());
}

describe('回测列表与详情往返', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.groups.mockResolvedValue(page);
    api.job.mockResolvedValue(job);
  });
  afterEach(async () => {
    for (const dispose of cleanup.splice(0)) await dispose();
  });

  it('首次读取未返回时显示加载而非零任务，成功空结果才显示零条', async () => {
    let resolve!: (value: unknown) => void;
    api.groups.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await mount('/strategy/jobs');
    expect(document.body.textContent).toContain('正在读取回测任务列表');
    expect(document.body.textContent?.replace(/\s/g, '')).not.toContain('共0项');
    await act(async () => resolve({ ...page, items: [], totalCount: 0 }));
    await waitFor(() => expect(document.body.textContent).toContain('没有匹配的回测任务'));
    expect(document.body.textContent?.replace(/\s/g, '')).toContain('共0项');
  });

  it.each(['筛选任务', '详情'])(
    '通过 %s 打开后保留搜索、状态、版本、分页和展开范围',
    async (entry) => {
      const query = new URLSearchParams({
        search: '筛选任务',
        status: 'succeeded',
        strategyVersionId: 'version-1',
        cursor: 'page-2',
        trail: '__first__',
        expanded: 'experiment-1',
      });
      const router = await mount(`/strategy/jobs?${query}`);
      await waitFor(() => expect(document.body.textContent).toContain('筛选任务'));
      await clickLink(entry);
      await waitFor(() => expect(document.body.textContent).toContain('受控结果区域'));
      await clickLink('返回回测任务');
      await waitFor(() => expect(router.location.pathname).toBe('/strategy/jobs'));
      expect(new URLSearchParams(router.location.search).toString()).toBe(query.toString());
      expect(
        document.querySelector<HTMLInputElement>('input[aria-label="搜索回测任务"]')?.value,
      ).toBe('筛选任务');
      expect(api.groups).toHaveBeenCalledWith(
        expect.objectContaining({
          search: '筛选任务',
          status: 'succeeded',
          strategyVersionId: 'version-1',
          cursor: 'page-2',
        }),
      );
    },
  );

  it('详情读取失败时返回同一筛选范围，直接打开的无效返回状态回退到列表', async () => {
    api.job.mockRejectedValueOnce(new Error('受控读取失败'));
    const router = await mount({
      pathname: '/strategy/jobs/job-1',
      state: { backtestJobsSearch: 'search=保留&status=failed' },
    });
    await waitFor(() => expect(document.body.textContent).toContain('暂时无法读取'));
    await clickLink('返回回测任务');
    expect(new URLSearchParams(router.location.search).get('search')).toBe('保留');
    expect(new URLSearchParams(router.location.search).get('status')).toBe('failed');
    await act(async () =>
      router.navigate('/strategy/jobs/job-1', {
        state: { backtestJobsSearch: { invalid: true } },
      }),
    );
    await waitFor(() => expect(document.body.textContent).toContain('受控结果区域'));
    await clickLink('返回回测任务');
    expect(router.location.pathname + router.location.search).toBe('/strategy/jobs');
  });
});
