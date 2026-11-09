// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategyVersionBacktests } from '../src/features/strategy/StrategyVersionBacktests.js';
import { StrategyVersionExperiments } from '../src/features/strategy/StrategyVersionExperiments.js';

const api = vi.hoisted(() => ({ groups: vi.fn(), experiments: vi.fn() }));
vi.mock('../src/features/strategy/strategy-optimization.api.js', () => ({
  fetchStrategyBacktestGroups: api.groups, fetchOptimizationExperiments: api.experiments,
}));
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const job = (strategyVersionId = first, id = 'failed-job') => ({ id, strategyVersionId,
  status: 'failed', createdAt: '2026-11-08T00:00:00Z', periodStart: '2026-10-07', periodEnd: '2026-11-07', errorSummary: `失败原因 ${id}` });
const groups = (jobs = [job()], nextCursor: string | null = null) => ({
  items: [{ id: 'group', jobs }], pageInfo: { hasNextPage: Boolean(nextCursor), nextCursor }, totalCount: 2,
});
const experiment = (baselineStrategyVersionId = first) => ({ id: 'experiment', baselineStrategyVersionId,
  name: `实验 ${baselineStrategyVersionId}`, status: 'failed', stage: 'failed', aiCallsUsed: 0,
  backtestRunsUsed: 0, createdAt: '2026-11-08T00:00:00Z' });
let root: Root | undefined;
let client: QueryClient;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const flush = () => act(async () => new Promise(done => setTimeout(done, 20)));
async function render(node: ReactNode) {
  if (!root) {
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  }
  await act(async () => root!.render(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>));
  await flush();
}
const button = (label: string) => [...document.querySelectorAll('button')].find(el => el.textContent === label)!;
beforeEach(() => { vi.resetAllMocks(); api.groups.mockResolvedValue(groups()); api.experiments.mockResolvedValue({ items: [experiment()], pageInfo: { nextCursor: null } }); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; client?.clear(); document.body.innerHTML = ''; });

describe('策略版本关联记录', () => {
  it('按精确版本读取失败任务并保留详情入口，拒绝展示其他版本', async () => {
    api.groups.mockResolvedValue(groups([job(), job(second, 'other-version')]));
    await render(<StrategyVersionBacktests strategyVersionId={first} />);
    expect(api.groups).toHaveBeenCalledWith({ strategyVersionId: first, limit: 20 }, undefined, expect.any(AbortSignal));
    expect(document.body.textContent).toContain('失败原因 failed-job');
    expect(document.body.textContent).not.toContain('other-version');
    expect(document.querySelector('a[href="/strategy/jobs/failed-job"]')).not.toBeNull();
  });

  it('分页和切换版本隔离，迟到响应不能回填上一版本', async () => {
    let finish!: (data: ReturnType<typeof groups>) => void;
    api.groups.mockResolvedValueOnce(groups([job()], 'next-page')).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue(groups([job(second, 'current-version')]));
    await render(<StrategyVersionBacktests key={first} strategyVersionId={first} />);
    await act(async () => button('下一页').click()); await flush();
    await render(<StrategyVersionBacktests key={second} strategyVersionId={second} />);
    expect(api.groups).toHaveBeenLastCalledWith({ strategyVersionId: second, limit: 20 }, undefined, expect.any(AbortSignal));
    await act(async () => finish(groups([job(first, 'late-version')]))); await flush();
    expect(document.body.textContent).toContain('current-version');
    expect(document.body.textContent).not.toContain('late-version');
    expect(button('上一页').disabled).toBe(true);
  });

  it('实验精确关联且创建入口锁定版本，禁用创建时仍显示历史记录', async () => {
    api.experiments.mockResolvedValue({ items: [experiment(), experiment(second)], pageInfo: { nextCursor: null } });
    await render(<StrategyVersionExperiments strategyVersionId={first} canCreate />);
    expect(api.experiments).toHaveBeenCalledWith({ strategyVersionId: first, sourceMode: 'existing', limit: 20 }, undefined, expect.any(AbortSignal));
    expect(document.body.textContent).toContain(`实验 ${first}`);
    expect(document.body.textContent).not.toContain(`实验 ${second}`);
    expect(document.querySelector(`a[href="/strategy/experiments/new?strategyVersionId=${first}"]`)).not.toBeNull();
    await render(<StrategyVersionExperiments strategyVersionId={first} canCreate={false} />);
    expect(document.body.textContent).toContain(`实验 ${first}`);
    expect(document.body.textContent).not.toContain('新建 AI 实验');
  });

  it('同范围刷新保留记录并显示单个加载圈，失败保留记录和重试入口', async () => {
    await render(<StrategyVersionBacktests strategyVersionId={first} />);
    let reject!: (error: Error) => void;
    api.groups.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    await act(async () => { void client.invalidateQueries({ queryKey: ['desktop', 'strategy', 'backtest-groups'] }); }); await flush();
    expect(document.body.textContent).toContain('失败原因 failed-job');
    expect(document.querySelectorAll('[data-slot="list-refresh"]')).toHaveLength(1);
    await act(async () => reject(new Error('读取暂不可用'))); await flush();
    expect(document.body.textContent).toContain('失败原因 failed-job');
    expect(document.body.textContent).toContain('读取暂不可用');
    expect(button('重新读取')).toBeTruthy();
  });
});
