import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ThesisLedgerApiClient,
  ThesisLedgerApiError,
  retryAfterMilliseconds,
} from '@thesis-ledger/api-client';
import { createRateLimitedFetch } from '../src/shared/api/rate-limited-fetch.js';
import { createBacktestStreamSource } from '../src/features/strategy/strategy-event-source.js';
import { jobStatusLabel } from '../src/features/strategy/backtest-status.js';
import { applyBacktestGroupEvent } from '../src/features/strategy/strategy-group-events.js';
import type { BacktestJobSummary } from '../src/features/strategy/strategy.types.js';

afterEach(() => vi.useRealTimers());

describe('回测实时消费与限流恢复', () => {
  it('取消请求只在 running 显示进行中，所有终态保留事实标签', () => {
    for (const [status, label] of [
      ['cancelled', '已取消'],
      ['succeeded', '已完成'],
      ['failed', '失败'],
    ])
      expect(jobStatusLabel(status!, '2026-10-06T00:00:00Z')).toBe(label);
    expect(jobStatusLabel('running', '2026-10-06T00:00:00Z')).toBe('正在取消');
  });

  it('秒数和 HTTP 日期冷却均可解析，并由 API 错误保留', async () => {
    expect(retryAfterMilliseconds('2', 0)).toBe(2000);
    expect(retryAfterMilliseconds('Thu, 01 Jan 1970 00:00:03 GMT', 1000)).toBe(2000);
    expect(retryAfterMilliseconds('invalid', 0)).toBeNull();
    expect(retryAfterMilliseconds('-1', 0)).toBeNull();
    const client = new ThesisLedgerApiClient(
      'http://localhost/api/v1/',
      async () => new Response('{}', { status: 429, headers: { 'retry-after': '2' } }),
    );
    await expect(client.request('/backtests/runs')).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 2000,
    });
  });

  it('实时摘要更新分组中的任务并保留分页、实验成员和结果元数据', () => {
    const current = {
      items: [
        {
          id: 'group',
          members: [{ jobId: 'run' }],
          jobs: [{ id: 'run', status: 'running', resultChecksum: 'kept' }],
        },
      ],
      totalCount: 1,
      pageInfo: { nextCursor: 'next', hasNextPage: true },
    };
    const incoming = {
      id: 'run',
      mode: 'V3',
      status: 'cancelled',
      cancelRequestedAt: '2026-10-06T00:00:00Z',
    } as BacktestJobSummary;
    expect(applyBacktestGroupEvent(current, incoming)).toEqual({
      ...current,
      items: [{ ...current.items[0], jobs: [{ ...current.items[0]!.jobs[0], ...incoming }] }],
    });
    expect(current.items[0]!.jobs[0]!.status).toBe('running');
  });

  it('同源 GET 共享冷却，等待期间不请求；取消等待不会发送请求', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '3' } }))
      .mockResolvedValue(new Response('{}'));
    const transport = createRateLimitedFetch(fetcher);
    await transport('http://localhost/api/v1/backtests/runs');
    const next = transport('http://localhost/api/v1/backtests/events');
    const controller = new AbortController();
    const cancelled = transport('http://localhost/api/v1/backtests/runs/1', {
      signal: controller.signal,
    });
    const rejected = expect(cancelled).rejects.toBeDefined();
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await next;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('SSE 429 重连遵守冷却，跨分片 CRLF 解析并在关闭时释放读取', async () => {
    vi.useFakeTimers();
    let enqueue!: (bytes: Uint8Array) => void;
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(c) {
        enqueue = (b) => c.enqueue(b);
      },
      cancel,
    });
    const request = vi
      .fn()
      .mockRejectedValueOnce(new ThesisLedgerApiError(429, null, 3000))
      .mockResolvedValue(
        new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
      );
    const source = createBacktestStreamSource(request);
    const update = vi.fn();
    source.addEventListener('backtest.job.updated', update);
    await vi.advanceTimersByTimeAsync(2999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    enqueue(new TextEncoder().encode('event: backtest.job.updated\r'));
    enqueue(new TextEncoder().encode('\ndata: {"status":"cancelled"}\r\n\r\n'));
    await vi.advanceTimersByTimeAsync(0);
    expect(update).toHaveBeenCalledOnce();
    source.close();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cancel).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(2);
  });
});
