// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSavePerformanceTargetsMutation } from '../src/features/performance/performance.mutations.js';
import { performanceKeys } from '../src/features/performance/performance.queries.js';

const api = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('../src/features/performance/performance.api.js', async (original) => ({
  ...(await original<object>()),
  savePerformanceTargets: api.save,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const input = { scope: 'account' as const, accountId: 'owned-account', targets: { stock: 1 } };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let mutation: ReturnType<typeof useSavePerformanceTargetsMutation>;
const subscriptions: Array<() => void> = [];

function Probe() {
  mutation = useSavePerformanceTargetsMutation();
  return null;
}

async function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
}

function observe(key: readonly string[], read: () => Promise<string>) {
  const observer = new QueryObserver(client, {
    queryKey: [...key, 'owned-account'],
    queryFn: read,
    initialData: 'cached-before-save',
    staleTime: Infinity,
  });
  subscriptions.push(observer.subscribe(() => undefined));
}

afterEach(async () => {
  subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
  await act(async () => root?.unmount());
  host?.remove();
  client?.clear();
  vi.resetAllMocks();
});

describe('收益目标保存与读取恢复', () => {
  it('写入成功后等待两个活动读取；读取失败仍保留写入成功结果，不能诱导重复保存', async () => {
    const write = deferred<unknown>();
    const targets = deferred<string>();
    const allocation = deferred<string>();
    api.save.mockReturnValue(write.promise);
    await mount();
    const readTargets = vi.fn(() => targets.promise);
    const readAllocation = vi.fn(() => allocation.promise);
    observe(performanceKeys.targetsRoot, readTargets);
    observe(performanceKeys.allocationRoot, readAllocation);
    let result!: ReturnType<typeof mutation.mutateAsync>;
    await act(async () => {
      result = mutation.mutateAsync(input);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mutation.isPending).toBe(true);
    expect(readTargets).not.toHaveBeenCalled();
    await act(async () => {
      write.resolve({ version: 2 });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(readTargets).toHaveBeenCalledOnce();
    expect(mutation.isPending).toBe(true);
    await act(async () => {
      targets.reject(new Error('read unavailable'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mutation.isPending).toBe(true);
    await act(async () => {
      allocation.resolve('latest allocation');
      await expect(result).resolves.toEqual({ refreshed: false });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mutation.isSuccess).toBe(true);
    expect(api.save).toHaveBeenCalledExactlyOnceWith(input);
    expect(readAllocation).toHaveBeenCalledOnce();
  });

  it('目标和配置均刷新后才报告完整成功', async () => {
    api.save.mockResolvedValue({ version: 2 });
    await mount();
    observe(performanceKeys.targetsRoot, async () => 'new targets');
    observe(performanceKeys.allocationRoot, async () => 'new allocation');
    await act(async () => {
      await expect(mutation.mutateAsync(input)).resolves.toEqual({ refreshed: true });
    });
    expect(api.save).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('写入失败不触发读取，也不伪报为已保存', async () => {
    api.save.mockRejectedValue(new Error('write unavailable'));
    await mount();
    const read = vi.fn(async () => 'unexpected refresh');
    observe(performanceKeys.targetsRoot, read);
    await act(async () => {
      await expect(mutation.mutateAsync(input)).rejects.toThrow('write unavailable');
    });
    expect(read).not.toHaveBeenCalled();
    expect(api.save).toHaveBeenCalledOnce();
  });
});
