import { describe, expect, it, vi } from 'vitest';
import type { MarketDetailResponse } from '@thesis-ledger/api-client';
import {
  MarketDetailRequestCoordinator,
  type MarketDetailFetcher,
  type MarketDetailRequest,
} from './market-detail.coordinator.js';

const request: MarketDetailRequest = { symbol: '600519.SH', include: ['quote'] };
const response = { symbol: '600519.SH' } as MarketDetailResponse;

describe('MarketDetailRequestCoordinator', () => {
  it('相同请求共享一个 in-flight fetch', async () => {
    let resolveFetch!: (value: MarketDetailResponse) => void;
    const fetcher: MarketDetailFetcher = vi.fn(
      () => new Promise<MarketDetailResponse>((resolve) => (resolveFetch = resolve)),
    );
    const coordinator = new MarketDetailRequestCoordinator();

    const first = coordinator.request(request, fetcher);
    const second = coordinator.request(request, fetcher);

    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledOnce();
    resolveFetch(response);
    await expect(Promise.all([first, second])).resolves.toEqual([response, response]);
    expect(coordinator.size).toBe(0);
  });

  it('单个消费者取消不会中断仍在使用的共享请求', async () => {
    let resolveFetch!: (value: MarketDetailResponse) => void;
    let fetchSignal!: AbortSignal;
    const fetcherImpl: MarketDetailFetcher = (_request, signal) =>
      new Promise<MarketDetailResponse>((resolve) => {
        fetchSignal = signal;
        resolveFetch = resolve;
      });
    const fetcher = vi.fn(fetcherImpl);
    const coordinator = new MarketDetailRequestCoordinator();
    const firstController = new AbortController();
    const first = coordinator.request(request, fetcher, firstController.signal);
    const second = coordinator.request(request, fetcher);

    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSignal.aborted).toBe(false);

    resolveFetch(response);
    await expect(second).resolves.toBe(response);
  });

  it('最后一个消费者取消时中断底层请求', async () => {
    let resolveFetch!: (value: MarketDetailResponse) => void;
    let fetchSignal!: AbortSignal;
    const fetcherImpl: MarketDetailFetcher = (_request, signal) =>
      new Promise<MarketDetailResponse>((resolve) => {
        fetchSignal = signal;
        resolveFetch = resolve;
      });
    const fetcher = vi.fn(fetcherImpl);
    const coordinator = new MarketDetailRequestCoordinator();
    const controller = new AbortController();
    const pending = coordinator.request(request, fetcher, controller.signal);

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSignal.aborted).toBe(true);

    resolveFetch(response);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(coordinator.size).toBe(0);
  });

  it('取消后的请求不会复用已经 aborted 的 in-flight', async () => {
    const resolvers: Array<(value: MarketDetailResponse) => void> = [];
    const signals: AbortSignal[] = [];
    const fetcher: MarketDetailFetcher = vi.fn(
      (_request: MarketDetailRequest, signal: AbortSignal) =>
        new Promise<MarketDetailResponse>((resolve) => {
          signals.push(signal);
          resolvers.push(resolve);
        }),
    );
    const coordinator = new MarketDetailRequestCoordinator();
    const controller = new AbortController();
    const cancelled = coordinator.request(request, fetcher, controller.signal);

    await Promise.resolve();
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });

    const replacement = coordinator.request(request, fetcher);
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    resolvers[0]!(response);
    resolvers[1]!(response);
    await expect(replacement).resolves.toBe(response);
  });
});
