// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StrategySubmissionInput, StrategySubmissionReceipt } from '@thesis-ledger/schemas';
import { useStrategySubmission } from './use-strategy-submission.js';

const api = vi.hoisted(() => ({ submit: vi.fn(), list: vi.fn(), confirm: vi.fn() }));
vi.mock('../../shared/api/client.js', () => ({ getDesktopApiClient: () => ({ strategySubmissions: api }) }));
const receipt = (state: StrategySubmissionReceipt['state']): StrategySubmissionReceipt => ({
  id: '11111111-1111-4111-8111-111111111111', kind: 'ordinary', state,
  createdAt: '2026-11-10T10:00:00.000Z', prepared: null,
  outcome: state === 'submitted' ? { id: '22222222-2222-4222-8222-222222222222' } : null,
});
const choice = { signature: 'same-setup', input: { kind: 'ordinary' } as StrategySubmissionInput };
let current: ReturnType<typeof useStrategySubmission>;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;
let onSubmitted: ReturnType<typeof vi.fn>;
function Harness() { current = useStrategySubmission(onSubmitted); return null; }
const advance = (milliseconds = 50) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  api.submit.mockResolvedValue(receipt('queued'));
  api.list.mockResolvedValue([receipt('preparing')]);
  onSubmitted = vi.fn();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => { root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>); });
});
afterEach(() => {
  act(() => root.unmount());
  client.clear(); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('回测提交等待', () => {
  it('登记与准备阶段持续等待，取得任务后只跳转一次并刷新列表', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    act(() => current.mutate(choice)); await advance();
    expect(current.isPending).toBe(true);
    expect(onSubmitted).not.toHaveBeenCalled();
    api.list.mockResolvedValue([receipt('submitted')]); await advance(2100);
    expect(current.isPending).toBe(false);
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['desktop', 'strategy', 'backtest-groups'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['desktop', 'strategy', 'jobs'] });
    await advance(2100);
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it('保留待确认状态，确认后继续等待创建回执', async () => {
    api.list.mockResolvedValue([receipt('awaiting_confirmation')]);
    act(() => current.mutate(choice)); await advance();
    expect(current.receipt?.state).toBe('awaiting_confirmation');
    expect(onSubmitted).not.toHaveBeenCalled();
    api.confirm.mockResolvedValue(receipt('ready'));
    act(() => current.confirm.mutate()); await advance();
    expect(api.confirm).toHaveBeenCalledWith(receipt('ready').id);
    expect(current.isPending).toBe(true);
    api.list.mockResolvedValue([receipt('submitted')]); await advance(2100);
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it('状态读取失败时显示错误，重读恢复原提交且不重复登记', async () => {
    api.list.mockRejectedValueOnce(new Error('状态读取失败'));
    act(() => current.mutate(choice)); await advance();
    expect(current.error?.message).toBe('状态读取失败');
    expect(onSubmitted).not.toHaveBeenCalled();
    api.list.mockResolvedValue([receipt('submitted')]);
    act(() => current.retry()); await advance();
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(api.submit).toHaveBeenCalledTimes(1);
  });

  it('登记响应失败后重试相同配置复用原请求标识与输入', async () => {
    api.submit.mockRejectedValueOnce(new Error('提交响应丢失'));
    act(() => current.mutate(choice)); await advance();
    expect(current.error?.message).toBe('提交响应丢失');
    act(() => current.mutate(choice)); await advance();
    expect(api.submit.mock.calls[1]).toEqual(api.submit.mock.calls[0]);
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('阻塞结果停止等待并保留在当前表单', async () => {
    api.list.mockResolvedValue([receipt('blocked')]);
    act(() => current.mutate(choice)); await advance();
    expect(current.isPending).toBe(false);
    expect(current.receipt?.state).toBe('blocked');
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});
