// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { OptimizationModelResolutionRequest } from '@thesis-ledger/schemas';
import { useOptimizationExecutionModel } from '../src/features/strategy/use-optimization-execution-model.js';

const api = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@thesis-ledger/api-client', () => ({
  strategyClients: () => ({ optimization: { resolveExecutionModel: api.resolve } }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const input: OptimizationModelResolutionRequest = {
  target: { sourceMode: 'existing', strategyVersionId: '11111111-1111-4111-8111-111111111111' },
  startDate: '2024-01-02',
  endDate: '2024-03-29',
  currency: 'CNY',
  adjustment: 'hfq',
};
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((value) => {
    resolve = value;
  });
  return { promise, resolve };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('实验执行设置请求隔离', () => {
  it('区间切换清除旧设置并取消旧请求，晚到结果不能覆盖新设置', async () => {
    const previous = deferred(),
      current = deferred();
    api.resolve
      .mockReset()
      .mockReturnValueOnce(previous.promise)
      .mockReturnValueOnce(current.promise);
    const container = document.createElement('div');
    const root = createRoot(container);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Probe({ settings }: { settings: OptimizationModelResolutionRequest }) {
      const result = useOptimizationExecutionModel(settings);
      return <p>{result.model?.id ?? '未就绪'}</p>;
    }
    const render = (settings: OptimizationModelResolutionRequest) =>
      root.render(
        <QueryClientProvider client={client}>
          <Probe settings={settings} />
        </QueryClientProvider>,
      );
    try {
      await act(async () => {
        render(input);
        await flush();
      });
      const oldSignal = api.resolve.mock.calls[0]![1] as AbortSignal;
      await act(async () => {
        render({ ...input, startDate: '2024-02-01' });
        await flush();
      });
      expect(oldSignal.aborted).toBe(true);
      expect(container.textContent).toBe('未就绪');
      await act(async () => {
        current.resolve({ status: 'available', model: { id: '当前区间' }, notes: [] });
        await flush();
      });
      await act(flush);
      expect(container.textContent).toBe('当前区间');
      await act(async () => {
        previous.resolve({ status: 'available', model: { id: '旧区间' }, notes: [] });
        await flush();
      });
      expect(container.textContent).toBe('当前区间');
      expect(api.resolve).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => root.unmount());
      client.clear();
    }
  });
});
