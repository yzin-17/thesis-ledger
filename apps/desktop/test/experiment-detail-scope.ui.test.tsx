// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { StrategyExperimentDetailPage } from '../src/features/strategy/StrategyExperimentDetailPage.js';
import {
  createDefaultStrategySchema,
  setStrategyExecutionSymbol,
} from '../src/features/strategy/strategy.schema.js';
import type { OptimizationExperimentSummary } from '../src/features/strategy/strategy-optimization.api.js';
import fixture from './fixtures/experiment-risk-ui-recovery.json';

const api = vi.hoisted(() => ({
  detail: vi.fn(),
  compare: vi.fn(),
  adoption: vi.fn(),
  adopt: vi.fn(),
  clone: vi.fn(),
  cancel: vi.fn(),
  finalize: vi.fn(),
  retry: vi.fn(),
  toast: vi.fn(),
  close: vi.fn(),
}));
vi.mock('../src/features/strategy/strategy-optimization.api', async (original) => ({
  ...(await original<object>()),
  fetchOptimizationExperiment: api.detail,
  fetchOptimizationCompare: api.compare,
  fetchOptimizationAdoptionContext: api.adoption,
  adoptOptimizationCandidate: api.adopt,
  cloneOptimizationExperiment: api.clone,
  cancelOptimizationExperiment: api.cancel,
  completeOptimizationExperiment: api.finalize,
  retryOptimizationExperiment: api.retry,
}));
vi.mock('../src/components/ui/toast', () => ({
  useToastManager: () => ({ add: api.toast, close: api.close }),
}));

const a = fixture.experiment.id;
const b = '00000000-0000-4000-8000-000000000081';
const key = (id: string) => ['desktop', 'strategy', 'optimization', 'experiment', id];
const baseline = {
  id: fixture.experiment.baselineStrategyVersionId,
  version: 1,
  schemaVersion: 3,
  schema: setStrategyExecutionSymbol(createDefaultStrategySchema('隔离验收策略'), '600519.SH'),
};
const adopted = { id: 'formal-a', strategyId: 'strategy', version: 2 };
const strategy = {
  id: 'strategy',
  name: '隔离验收策略',
  versions: [baseline, { ...baseline, ...adopted }],
};
function detail(id: string) {
  return {
    experiment: {
      ...fixture.experiment,
      id,
      name: id === a ? '实验 A' : '实验 B',
      status: 'succeeded',
      stage: 'completed',
    } as OptimizationExperimentSummary,
    candidates: [
      {
        ...fixture.candidate,
        id: id === a ? fixture.candidate.id : 'candidate-b',
        experimentId: id,
      },
    ],
    attempts: [],
  };
}
const records = new Map<string, ReturnType<typeof detail>>();
const NativeRequest = globalThis.Request;
const cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.resetAllMocks();
  records.clear();
  records.set(a, detail(a));
  records.set(b, detail(b));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('禁止真实请求');
    }),
  );
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
  vi.stubGlobal(
    'Request',
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init ? { ...init, signal: undefined } : undefined);
      }
    },
  );
  api.toast.mockImplementation(({ title }: { title: string }) => title);
  api.detail.mockImplementation(async (id: string) => records.get(id));
  api.compare.mockImplementation(async (id: string) => ({
    ...records.get(id),
    baseline: { metrics: {}, runRefs: {} },
  }));
  api.adoption.mockResolvedValue({
    baseline,
    current: baseline,
    candidateVsBaseline: [],
    candidateVsCurrent: [],
    expectedStrategyVersion: 1,
  });
  api.adopt.mockResolvedValue({ strategyVersion: adopted });
  api.clone.mockResolvedValue(records.get(b)!.experiment);
});
afterEach(async () => {
  await act(async () => cleanups.splice(0).forEach((cleanup) => cleanup()));
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/strategy/experiments/:experimentId',
        element: <StrategyExperimentDetailPage strategies={[strategy]} />,
      },
    ],
    { initialEntries: ['/strategy/experiments/' + a] },
  );
  cleanups.push(() => {
    root.unmount();
    router.dispose();
    client.clear();
    host.remove();
  });
  await act(async () =>
    root.render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <ConfirmDialogProvider>
            <RouterProvider router={router} />
          </ConfirmDialogProvider>
        </QueryClientProvider>
      </StrictMode>,
    ),
  );
  await wait(() => expect(document.body.textContent).toContain('实验 A'));
  return {
    client,
    router,
    navigate: async (id: string, search = '') => {
      await act(async () => router.navigate('/strategy/experiments/' + id + search));
      await wait(() => expect(document.body.textContent).toContain(id === a ? '实验 A' : '实验 B'));
    },
  };
}
async function wait(check: () => void) {
  await vi.waitFor(async () => {
    await act(async () => new Promise((done) => setTimeout(done, 0)));
    check();
  });
}
function button(text: string) {
  const element = [
    ...document.querySelectorAll<HTMLButtonElement>('button,[role="menuitem"]'),
  ].find((item) => item.textContent?.trim() === text);
  if (!element) throw new Error('缺少操作：' + text);
  return element;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
async function review() {
  await click('审阅并采纳');
  await wait(() => expect(button('确认采纳').disabled).toBe(false));
}
async function menu(action: string) {
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="实验更多操作"]')!.click(),
  );
  await wait(() => expect(button(action)).toBeDefined());
  await click(action);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
type Operation = 'adopt' | 'clone' | 'cancel' | 'finalize' | 'retry';
function prepare(operation: Operation) {
  if (operation === 'retry')
    Object.assign(records.get(a)!.experiment, {
      status: 'failed',
      stage: 'failed',
      lockedCandidateIds: [],
      stopReason: 'worker_failed',
    });
  if (operation === 'cancel')
    Object.assign(records.get(a)!.experiment, { status: 'running', stage: 'evaluating' });
  if (operation === 'finalize')
    Object.assign(records.get(a)!.experiment, {
      status: 'awaiting_finalization',
      stage: 'awaiting_finalization',
      stopReason: 'final_test_retry_required:controlled',
    });
}
async function start(operation: Operation) {
  if (operation === 'retry') await click('失败重试');
  else if (operation === 'adopt') {
    await review();
    await click('确认采纳');
  } else if (operation === 'finalize') await click('重试未完成测试');
  else await menu(operation === 'clone' ? '克隆实验' : '取消实验');
  await wait(() => expect(api[operation]).toHaveBeenCalledOnce());
  expect(api[operation].mock.calls[0]![0]).toBe(a);
}

describe('实验详情身份与回执隔离', () => {
  it('采纳后直接切换不携带正式版本；返回从持久化事实恢复且不再次采纳', async () => {
    const page = await mount();
    await start('adopt');
    await wait(() => expect(document.body.textContent).toContain('已采纳为正式策略 v2'));
    const saved = { ...records.get(a)!.candidates[0]!, adoptedStrategyVersionId: adopted.id };
    records.get(a)!.candidates = [saved];
    await page.navigate(b);
    expect(document.body.textContent).not.toContain('已采纳为正式策略 v2');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => page.client.invalidateQueries({ queryKey: key(a) }));
    await act(async () => page.router.navigate(-1));
    await wait(() => expect(document.body.textContent).toContain('已采纳为正式策略 v2'));
    expect(api.adopt).toHaveBeenCalledOnce();
  });

  it('克隆跳转清除旧实验的克隆入口和审阅状态', async () => {
    await mount();
    await menu('克隆实验');
    await wait(() => expect(document.body.textContent).toContain('查看克隆实验'));
    await review();
    await click('取消');
    const link = [...document.querySelectorAll<HTMLAnchorElement>('a')].find(
      (item) => item.textContent === '查看克隆实验',
    )!;
    await act(async () => link.click());
    await wait(() => expect(document.body.textContent).toContain('实验 B'));
    expect(document.body.textContent).not.toContain('查看克隆实验');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('晚到的采纳上下文不重开旧审阅，也不替换新实验的上下文', async () => {
    const pending = deferred<unknown>();
    api.adoption.mockImplementationOnce(() => pending.promise);
    const page = await mount();
    await click('审阅并采纳');
    await page.navigate(b);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await review();
    await act(async () =>
      pending.resolve({
        baseline,
        current: baseline,
        candidateVsBaseline: [],
        candidateVsCurrent: [],
        expectedStrategyVersion: 77,
      }),
    );
    expect(api.adoption.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      [a, fixture.candidate.id],
      [b, 'candidate-b'],
    ]);
    await click('确认采纳');
    await wait(() => expect(api.adopt).toHaveBeenCalledOnce());
    expect(api.adopt).toHaveBeenCalledWith(
      b,
      expect.objectContaining({ candidateId: 'candidate-b', expectedStrategyVersion: 1 }),
    );
  });

  it.each<Operation>(['adopt', 'clone', 'cancel', 'finalize', 'retry'])(
    '%s 晚到成功不污染新实验、覆盖其缓存或关闭其审阅',
    async (operation) => {
      prepare(operation);
      const pending = deferred<unknown>();
      api[operation].mockImplementationOnce(() => pending.promise);
      const page = await mount();
      await start(operation);
      await page.navigate(b);
      await review();
      const before = api.toast.mock.calls.length;
      await act(async () =>
        pending.resolve(
          operation === 'adopt' ? { strategyVersion: adopted } : records.get(b)!.experiment,
        ),
      );
      await wait(() => expect(page.client.isMutating()).toBe(0));
      expect(api.toast).toHaveBeenCalledTimes(before);
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('审阅并采纳候选 1');
      expect(button('确认采纳').disabled).toBe(false);
      expect(page.client.getQueryData(key(b))).toMatchObject({
        candidates: [{ id: 'candidate-b' }],
      });
      expect(document.body.textContent).not.toContain('已采纳为正式策略 v2');
      expect(document.body.textContent).not.toContain('查看克隆实验');
    },
  );

  it.each<Operation>(['adopt', 'clone', 'cancel', 'finalize', 'retry'])(
    '%s 晚到失败不向新实验发送错误提示',
    async (operation) => {
      prepare(operation);
      const pending = deferred<unknown>();
      api[operation].mockImplementationOnce(() => pending.promise);
      const page = await mount();
      await start(operation);
      await page.navigate(b);
      await review();
      await act(async () => pending.reject(new Error('实验 A 晚到失败')));
      await wait(() => expect(page.client.isMutating()).toBe(0));
      expect(api.toast).not.toHaveBeenCalled();
      expect(button('确认采纳').disabled).toBe(false);
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    },
  );

  it('离开时关闭本实验错误提示，新实验读取失败不携带旧写回执', async () => {
    const page = await mount();
    api.clone.mockRejectedValueOnce(new Error('A 克隆失败'));
    await menu('克隆实验');
    await wait(() =>
      expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })),
    );
    await menu('克隆实验');
    await wait(() => expect(document.body.textContent).toContain('查看克隆实验'));
    await page.navigate(b);
    expect(api.close).toHaveBeenCalledWith('克隆失败');
    api.detail.mockRejectedValue(new Error('B 读取失败'));
    await act(async () => page.client.invalidateQueries({ queryKey: key(b) }));
    await wait(() => expect(document.body.textContent).toContain('实验详情或对比读取失败'));
    expect(document.body.textContent).not.toContain('实验已确认克隆');
  });

  it('仍显示的旧错误提示在离开时关闭，晚到失败不会关闭新实验提示', async () => {
    const page = await mount();
    api.clone.mockRejectedValueOnce(new Error('A 克隆失败'));
    await menu('克隆实验');
    await wait(() =>
      expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '克隆失败' })),
    );
    expect(api.close).not.toHaveBeenCalled();
    await page.navigate(b);
    expect(api.close).toHaveBeenCalledExactlyOnceWith('克隆失败');
    api.clone.mockRejectedValueOnce(new Error('B 克隆失败'));
    await menu('克隆实验');
    await wait(() => expect(api.toast).toHaveBeenCalledTimes(2));
    expect(api.close).toHaveBeenCalledOnce();
  });

  it('采纳失败在等待事实回读期间离开，回读完成后不再提示旧结果', async () => {
    const page = await mount();
    const refresh = deferred<ReturnType<typeof detail>>();
    api.adopt.mockRejectedValueOnce(new Error('A 采纳回执丢失'));
    api.detail.mockImplementationOnce(() => refresh.promise);
    await start('adopt');
    await wait(() => expect(page.client.isFetching({ queryKey: key(a) })).toBe(1));
    await page.navigate(b);
    await review();
    const committed = detail(a);
    Object.assign(committed.candidates[0]!, { adoptedStrategyVersionId: adopted.id });
    await act(async () => refresh.resolve(committed));
    await wait(() => expect(page.client.isMutating()).toBe(0));
    expect(api.toast).not.toHaveBeenCalled();
    expect(button('确认采纳').disabled).toBe(false);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(api.adopt).toHaveBeenCalledOnce();
  });

  it('旧详情和对比读取晚到时保持新实验身份及候选', async () => {
    const pendingDetail = deferred<ReturnType<typeof detail>>();
    const pendingCompare = deferred<unknown>();
    const page = await mount();
    api.detail.mockImplementationOnce(() => pendingDetail.promise);
    api.compare.mockImplementationOnce(() => pendingCompare.promise);
    let refresh!: Promise<unknown>;
    await act(async () => {
      refresh = page.client.invalidateQueries({
        queryKey: ['desktop', 'strategy', 'optimization'],
      });
    });
    await page.navigate(b);
    await act(async () => {
      pendingDetail.resolve(detail(a));
      pendingCompare.resolve({ ...detail(a), baseline: { metrics: {}, runRefs: {} } });
      await refresh;
    });
    expect(document.body.textContent).toContain('实验 B');
    expect(document.body.textContent).not.toContain('实验 A');
    await review();
    await click('确认采纳');
    await wait(() => expect(api.adopt).toHaveBeenCalledOnce());
    expect(api.adopt).toHaveBeenCalledWith(
      b,
      expect.objectContaining({ candidateId: 'candidate-b' }),
    );
  });

  it('当前页面的克隆回执也不会覆盖已经读取的克隆详情', async () => {
    const page = await mount();
    page.client.setQueryData(key(b), detail(b));
    await menu('克隆实验');
    await wait(() => expect(document.body.textContent).toContain('查看克隆实验'));
    expect(page.client.getQueryData(key(b))).toMatchObject({ candidates: [{ id: 'candidate-b' }] });
  });

  it('离开后关闭已显示的成功提示，新实验不残留旧提示', async () => {
    const page = await mount();
    await menu('克隆实验');
    await wait(() => expect(api.toast).toHaveBeenCalledWith({ title: '实验已克隆' }));
    expect(api.close).not.toHaveBeenCalled();
    await page.navigate(b);
    expect(api.close).toHaveBeenCalledExactlyOnceWith('实验已克隆');
    expect(document.body.textContent).not.toContain('查看克隆实验');
  });

  it('同实验切换页签保留未确认采纳意图，切换实验创建独立意图', async () => {
    api.adopt.mockRejectedValue(
      new ThesisLedgerApiError(0, { error: 'ADOPTION_OUTCOME_UNCONFIRMED' }),
    );
    const page = await mount();
    await start('adopt');
    await wait(() =>
      expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '采纳结果待确认' })),
    );
    const original = api.adopt.mock.calls[0]![1];
    await page.navigate(a, '?view=runtime');
    await click('确认采纳');
    await wait(() => expect(api.adopt).toHaveBeenCalledTimes(2));
    expect(api.adopt.mock.calls[1]![1]).toEqual(original);
    await page.navigate(b);
    await review();
    await click('确认采纳');
    await wait(() => expect(api.adopt).toHaveBeenCalledTimes(3));
    expect(api.adopt.mock.calls[2]![0]).toBe(b);
    expect(api.adopt.mock.calls[2]![1].idempotencyKey).not.toBe(original.idempotencyKey);
  });
});
