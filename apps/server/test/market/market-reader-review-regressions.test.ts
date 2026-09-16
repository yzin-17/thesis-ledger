import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BarSeriesV2, BarPointV2 } from '@thesis-ledger/schemas';
import {
  MarketBarReader, PrismaMarketBarFactStore, barSeriesInputFingerprint, sliceBarSeries,
  type BarReadInput,
} from '../../src/market/market-bar-reader.js';
import { normalizeMarketBarWindow } from '../../src/market/market-bar-window.js';

const identity = { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' } as const;
const point = (day: string, completionStatus: BarPointV2['completionStatus'] = 'complete'): BarPointV2 => ({
  timestamp: `${day}T07:00:00.000Z`, availableAt: `${day}T08:00:00.000Z`,
  open: 1, high: 2, low: 1, close: 2, volume: 100, amount: 200, completionStatus,
});
const series = (points = [point('2025-01-02'), point('2025-01-03'), point('2025-01-06')]): BarSeriesV2 => ({
  contractVersion: 2, identity, points,
  inputFingerprint: barSeriesInputFingerprint(identity, points),
  coverage: {
    actualStart: points[0]?.timestamp ?? null, actualEnd: points.at(-1)?.timestamp ?? null,
    hasMoreBefore: false, latestCompleteTradingDate: '2025-01-06',
  },
  provenance: {
    providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0, effectivePolicyRevision: 7,
    providerRevision: 'tencent-1', fetchedAt: '2025-01-06T08:00:00.000Z',
    freshUntil: '2099-01-01T00:00:00.000Z', servedFromCache: false, cacheStatus: 'miss',
  },
});
const input = (): BarReadInput => ({ identity, window: {}, acceptance: 'interactive' });
const policy = () => ({ read: vi.fn(async () => ({
  revision: 7, targets: [{ providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0 }],
})) });
const facts = () => ({ read: vi.fn(async () => null), write: vi.fn(async () => undefined) });

afterEach(() => vi.useRealTimers());

describe('MarketBarReader review regressions', () => {
  it.each(['interactive', 'complete'] as const)('共享获取后按每个调用者验收，首个请求为 %s', async (first) => {
    let release!: (value: BarSeriesV2) => void;
    const pending = new Promise<BarSeriesV2>((resolve) => { release = resolve; });
    const remote = { read: vi.fn(() => pending) };
    const reader = new MarketBarReader(policy() as never, remote as never, facts() as never);
    const acceptances = first === 'interactive' ? ['interactive', 'complete'] as const : ['complete', 'interactive'] as const;
    const requests = acceptances.map((acceptance) => reader.read({ ...input(), acceptance }));
    const settled = Promise.allSettled(requests);
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    expect(remote.read).toHaveBeenCalledTimes(1);
    release(series([point('2025-01-06', 'incomplete')]));
    const results = await settled;
    results.forEach((result, index) => expect(result.status).toBe(
      acceptances[index] === 'interactive' ? 'fulfilled' : 'rejected',
    ));
  });

  it('不同 asOf 共享获取，但不能共享 point-in-time 验收结果', async () => {
    let release!: (value: BarSeriesV2) => void;
    const pending = new Promise<BarSeriesV2>((resolve) => { release = resolve; });
    const remote = { read: vi.fn(() => pending) };
    const reader = new MarketBarReader(policy() as never, remote as never, facts() as never);
    const settled = Promise.allSettled([
      reader.read({ ...input(), acceptance: 'point-in-time', asOf: '2025-01-06T08:30:00.000Z' }),
      reader.read({ ...input(), acceptance: 'point-in-time', asOf: '2025-01-06T07:30:00.000Z' }),
    ]);
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    expect(remote.read).toHaveBeenCalledTimes(1);
    release(series([point('2025-01-06')]));
    expect((await settled).map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
  });

  it('仅验收实际返回窗口，不被窗口之外的未完成点误拒绝', async () => {
    const reader = new MarketBarReader(policy() as never, {
      read: vi.fn(async () => series([point('2025-01-02', 'unknown'), point('2025-01-03')])),
    } as never, facts() as never);
    const result = await reader.read({ ...input(), acceptance: 'complete', window: { limit: 1 } });
    expect(result.points).toEqual([point('2025-01-03')]);
    expect(result).not.toHaveProperty('policyRevision');
  });

  it('单日查询包含结束日，数据库读和远端获取使用同一规范化边界', async () => {
    const remote = { read: vi.fn(async () => series()) };
    const store = facts();
    const reader = new MarketBarReader(policy() as never, remote as never, store as never);
    const result = await reader.read({ ...input(), window: { start: '2025-01-03', end: '2025-01-03' } });
    expect(result.points).toEqual([point('2025-01-03')]);
    const window = { start: '2025-01-02T16:00:00.000Z', end: '2025-01-03T15:59:59.999Z' };
    expect(remote.read).toHaveBeenCalledWith(expect.objectContaining({ window }), expect.any(Array));
    expect(store.read).toHaveBeenCalledWith(expect.objectContaining({ window }), expect.any(Object));
  });

  it('港股和美股日期边界使用市场时区，完整时间戳不扩大为整日', () => {
    expect(normalizeMarketBarWindow('00700.HK', { end: '2025-01-03' }).end).toBe('2025-01-03T15:59:59.999Z');
    expect(normalizeMarketBarWindow('AAPL.US', { start: '2025-03-09', end: '2025-03-09' })).toEqual({
      start: '2025-03-09T05:00:00.000Z', end: '2025-03-10T03:59:59.999Z',
    });
    expect(normalizeMarketBarWindow('AAPL.US', { start: '2025-11-02', end: '2025-11-02' })).toEqual({
      start: '2025-11-02T04:00:00.000Z', end: '2025-11-03T04:59:59.999Z',
    });
    const precise = '2025-01-03T06:59:59.999Z';
    expect(normalizeMarketBarWindow(identity.symbol, { end: precise }).end).toBe(precise);
    expect(sliceBarSeries(series(), { end: precise }).points).toEqual([point('2025-01-02')]);
  });

  it('局部历史刷新不延长未复核尾部有效期，完整刷新才可更新整段 TTL', async () => {
    let stored: Record<string, unknown> | null = null;
    const base = series();
    const oldExpiry = '2025-03-03T00:00:00.000Z';
    const oldFetch = '2025-03-02T23:55:00.000Z';
    const client = {
      marketBarSeriesFact: {
        upsert: vi.fn(async () => undefined),
        findMany: vi.fn(async () => [...base.points].reverse().map((row) => ({
          ...row, timestamp: new Date(row.timestamp), availableAt: new Date(row.availableAt),
        }))),
      },
      $transaction: vi.fn(async (writes: Promise<unknown>[]) => Promise.all(writes)),
      marketBarSeriesCoverage: {
        findUnique: vi.fn(async () => stored),
        upsert: vi.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          stored = stored ? { ...stored, ...args.update } : args.create;
          return stored;
        }),
      },
    };
    const store = new PrismaMarketBarFactStore(client as never);
    await store.write({ ...base, provenance: { ...base.provenance, fetchedAt: oldFetch, freshUntil: oldExpiry } });
    const partial = series([point('2025-01-03')]);
    await store.write({ ...partial, provenance: { ...partial.provenance,
      fetchedAt: '2025-03-03T01:00:00.000Z', freshUntil: '2025-03-10T01:00:00.000Z' } });
    expect(stored).toMatchObject({
      actualStart: new Date(base.coverage.actualStart!), actualEnd: new Date(base.coverage.actualEnd!),
      freshUntil: new Date(oldExpiry), fetchedAt: new Date(oldFetch),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-03T01:00:00.000Z'));
    const remote = { read: vi.fn(async () => base) };
    const reader = new MarketBarReader(policy() as never, remote as never, store);
    await reader.read({ ...input(), acceptance: 'complete' });
    expect(remote.read).toHaveBeenCalledTimes(1);
    expect(stored).toMatchObject({ freshUntil: new Date('2025-03-10T01:00:00.000Z') });
  });
});
