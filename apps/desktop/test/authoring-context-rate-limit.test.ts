import { QueryClient, isCancelledError } from '@tanstack/react-query';
import { ThesisLedgerApiError } from '@thesis-ledger/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authoringContextQueryOptions } from '../src/features/strategy-authoring/use-authoring-identity.js';
import { requestDesktopJson } from '../src/features/shared/request.js';

vi.mock('../src/features/shared/request.js', () => ({ requestDesktopJson: vi.fn() }));
const request = vi.mocked(requestDesktopJson);
const context = { mode: 'account', principal: null };
let client: QueryClient;
beforeEach(() => { vi.useFakeTimers(); request.mockReset(); client = new QueryClient(); });
afterEach(() => { client.clear(); vi.useRealTimers(); });

describe('工作区身份读取限流恢复', () => {
  it('首次 429 等待服务端冷却后恢复，不提前发送或并发重复', async () => {
    request.mockRejectedValueOnce(new ThesisLedgerApiError(429, null, 2000)).mockResolvedValue(context);
    const options = authoringContextQueryOptions(undefined);
    const result = client.fetchQuery(options);
    const shared = client.fetchQuery(options);
    await vi.advanceTimersByTimeAsync(1999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual(context);
    expect(await shared).toEqual(context);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('持续 429 最多重试一次，失败不会进入无限重试', async () => {
    request.mockRejectedValue(new ThesisLedgerApiError(429, null, 1000));
    const result = client.fetchQuery(authoringContextQueryOptions(undefined));
    const rejected = expect(result).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 500])('状态 %s 不进行自动重试', async (status) => {
    request.mockRejectedValue(new ThesisLedgerApiError(status, null));
    await expect(client.fetchQuery(authoringContextQueryOptions(undefined))).rejects.toMatchObject({ status });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('没有 Retry-After 时等待 60 秒，不立即重试', async () => {
    request.mockRejectedValueOnce(new ThesisLedgerApiError(429, null)).mockResolvedValue(context);
    const result = client.fetchQuery(authoringContextQueryOptions(undefined));
    await vi.advanceTimersByTimeAsync(59_999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual(context);
  });
  it('取消冷却中的查询会中断信号并停止后续重试', async () => {
    request.mockRejectedValue(new ThesisLedgerApiError(429, null, 2000));
    const options = authoringContextQueryOptions(undefined);
    const outcome = client.fetchQuery(options).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1);
    const signal = request.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    await client.cancelQueries({ queryKey: options.queryKey });
    expect(isCancelledError(await outcome)).toBe(true);
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('成功缓存按会话隔离，同一会话不重复读取', async () => {
    request.mockResolvedValue(context);
    await client.fetchQuery(authoringContextQueryOptions('session-a'));
    await client.fetchQuery(authoringContextQueryOptions('session-a'));
    expect(request).toHaveBeenCalledTimes(1);
    await client.fetchQuery(authoringContextQueryOptions('session-b'));
    expect(request).toHaveBeenCalledTimes(2);
  });
});
