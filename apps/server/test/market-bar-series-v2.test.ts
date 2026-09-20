import { describe, expect, it, vi } from 'vitest';
import type { BarReadInput } from '../src/market/market-bar-reader.js';
import {
  DsaMarketBarPolicyPort,
  DsaMarketBarRemotePort,
  MarketBarReader,
  PrismaMarketBarFactStore,
  barSeriesInputFingerprint,
} from '../src/market/market-bar-reader.js';
import { resolveBarFreshUntil } from '../src/market/market-bar-series-calendar.js';
import { MarketIndicatorCache, MarketV2Controller } from '../src/market/market-v2.controller.js';
import type { BarSeriesV2 } from '@thesis-ledger/schemas';

const point = (day: string, status: 'complete' | 'incomplete' = 'complete') => ({
  timestamp: `${day}T07:00:00.000Z`,
  open: 1,
  high: 1.1,
  low: 0.9,
  close: 1,
  volume: 100,
  amount: 1000,
  completionStatus: status,
  availableAt: `${day}T08:00:00.000Z`,
});

const input = (limit?: number): BarReadInput => ({
  identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'qfq' },
  window: limit ? { limit } : {},
  acceptance: 'interactive',
});

const series = (): BarSeriesV2 => ({
  contractVersion: 2,
  identity: input().identity,
  points: [point('2025-01-02'), point('2025-01-03')],
  coverage: {
    actualStart: '2025-01-02T07:00:00.000Z',
    actualEnd: '2025-01-03T07:00:00.000Z',
    hasMoreBefore: false,
    latestCompleteTradingDate: '2025-01-03',
  },
  provenance: {
    providerId: 'tencent',
    upstreamSource: 'tencent',
    routeIndex: 0,
    effectivePolicyRevision: 7,
    providerRevision: 'tencent:manifest:1:config:0',
    fetchedAt: '2025-01-03T08:00:00.000Z',
    freshUntil: '2099-01-01T00:00:00.000Z',
    servedFromCache: false,
    cacheStatus: 'miss',
  },
  inputFingerprint: 'remote-fingerprint',
});

describe('MarketBarReader V2', () => {
  const effectivePolicy = (sourceDesiredRevision: number, enabled = true) => ({
    projection: {
      effective: {
        revision: 12,
        sourceDesiredRevision,
        enabled,
        routeStatus: {
          DAILY_BAR: {
            ETF: {
              eligibleTargets: [
                { providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0 },
              ],
            },
          },
        },
      },
    },
  });

  it('读取前确认 Server Desired 已同步，并校验 DSA effective revision', async () => {
    const control = {
      getPolicy: vi.fn(async () => ({ revision: 9, enabled: true, syncState: 'applied' })),
    };
    const dsa = { effectiveControlPolicyV2: vi.fn(async () => effectivePolicy(9)) };
    const port = new DsaMarketBarPolicyPort(dsa as never, control as never);

    await expect(port.read(input().identity)).resolves.toEqual({
      revision: 12,
      targets: [{ providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0 }],
    });
    expect(control.getPolicy).toHaveBeenCalledOnce();
    expect(dsa.effectiveControlPolicyV2).toHaveBeenCalledOnce();
  });

  it('拒绝 DSA effective 与 Server Desired revision 漂移', async () => {
    const control = {
      getPolicy: vi.fn(async () => ({ revision: 9, enabled: true, syncState: 'applied' })),
    };
    const dsa = { effectiveControlPolicyV2: vi.fn(async () => effectivePolicy(8)) };
    const port = new DsaMarketBarPolicyPort(dsa as never, control as never);

    await expect(port.read(input().identity)).rejects.toThrow('revision 不一致');
  });

  it.each([
    { enabled: false, syncState: 'applied' },
    { enabled: true, syncState: 'pending' },
  ])('拒绝 Server Desired disabled/pending 状态 %#', async (state) => {
    const control = { getPolicy: vi.fn(async () => ({ revision: 9, ...state })) };
    const dsa = { effectiveControlPolicyV2: vi.fn(async () => effectivePolicy(9)) };
    const port = new DsaMarketBarPolicyPort(dsa as never, control as never);

    await expect(port.read(input().identity)).rejects.toThrow('尚未同步或未启用');
    expect(dsa.effectiveControlPolicyV2).not.toHaveBeenCalled();
  });

  it('v2 symbol 未显式提供 assetType 时使用已有 identity 推断边界', () => {
    const controller = new MarketV2Controller({} as never, {} as never);
    const input = (symbol: string) =>
      (
        controller as unknown as {
          input: (
            value: string,
            query: Record<string, string | undefined>,
          ) => { identity: { assetType: string } };
        }
      ).input(symbol, {});
    expect(input('510300.SH').identity.assetType).toBe('ETF');
    expect(input('000001.SZ').identity.assetType).toBe('STOCK');
    expect(input('161039.OF').identity.assetType).toBe('MUTUAL_FUND');
  });

  it('详情接口只读取一次 BarSeries 并返回公开 v2 契约', async () => {
    const reader = { read: vi.fn(async () => series()) };
    const detailService = {
      resolveIdentity: vi.fn(async () => ({
        symbol: '510300.SH',
        assetType: 'ETF',
        source: 'asset',
        status: 'confirmed',
      })),
    };
    const controller = new MarketV2Controller(
      reader as never,
      {} as never,
      undefined,
      detailService as never,
    );

    const result = await controller.detail(
      '510300.SH',
      'bars',
      '90',
      '90',
      'qfq',
      undefined,
      undefined,
      'interactive',
      undefined,
      undefined,
    );

    expect(result).toMatchObject({
      contractVersion: 2,
      symbol: '510300.SH',
      sections: { bars: { status: 'ready', data: { inputFingerprint: 'remote-fingerprint' } } },
    });
    expect(reader.read).toHaveBeenCalledOnce();
  });

  it('指标请求在发送给 DSA 前补齐并规范化默认参数', async () => {
    const reader = { read: vi.fn(async () => series()) };
    const calculateIndicatorsV2 = vi.fn(async (request) => ({
      contractVersion: 2 as const,
      engineVersion: 'dsa-indicator-v2',
      inputFingerprint: request.inputFingerprint,
      results: [
        {
          name: 'MA' as const,
          parameters: request.requests[0]!.parameters,
          inputFingerprint: request.inputFingerprint,
          points: [],
        },
      ],
    }));
    const controller = new MarketV2Controller(reader as never, { calculateIndicatorsV2 } as never);

    await expect(
      controller.indicator(
        '510300.SH',
        'MA',
        'ETF',
        '1d',
        'qfq',
        undefined,
        undefined,
        '90',
        'interactive',
        undefined,
      ),
    ).resolves.toMatchObject({ results: [{ parameters: { period: 5 } }] });
    expect(calculateIndicatorsV2).toHaveBeenCalledWith(
      expect.objectContaining({ requests: [{ name: 'MA', parameters: { period: 5 } }] }),
    );
  });

  it('limit 只切片，后续不同 limit 复用同一 source fact/view', async () => {
    const remote = { read: vi.fn(async () => series()) };
    const policy = {
      read: vi.fn(async () => ({
        revision: 7,
        targets: [{ providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0 }],
      })),
    };
    const reader = new MarketBarReader(
      policy as never,
      remote as never,
      { write: vi.fn(), read: vi.fn() } as never,
    );
    const first = await reader.read(input(1));
    const second = await reader.read(input(2));
    expect(first.points).toHaveLength(1);
    expect(first.provenance.cacheStatus).toBe('miss');
    expect(second.points).toHaveLength(2);
    expect(second.provenance.cacheStatus).toBe('memory');
    expect(remote.read).toHaveBeenCalledTimes(1);
  });

  it('refresh 绕过 memory、Redis 与 PostgreSQL 读缓存并采用远端新结果', async () => {
    const cached = {
      ...series(),
      provenance: {
        ...series().provenance,
        servedFromCache: true,
        cacheStatus: 'redis' as const,
      },
    };
    const refreshed = {
      ...series(),
      points: [{ ...point('2025-01-03'), open: 2, high: 2.1, low: 1.9, close: 2 }],
      coverage: {
        ...series().coverage,
        actualStart: '2025-01-03T07:00:00.000Z',
      },
    };
    const redisGet = vi.fn(async () => JSON.stringify(cached));
    const redisSet = vi.fn(async () => 'OK');
    const facts = {
      read: vi.fn(async () => cached),
      write: vi.fn(),
    };
    const remote = { read: vi.fn(async () => refreshed) };
    const policy = {
      read: vi.fn(async () => ({
        revision: 7,
        targets: [{ providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0 }],
      })),
    };
    const reader = new MarketBarReader(
      policy as never,
      remote as never,
      facts as never,
      {
        client: { get: redisGet, set: redisSet, eval: vi.fn(async () => 0) },
      } as never,
    );

    await expect(reader.read(input(2))).resolves.toMatchObject({
      provenance: { cacheStatus: 'redis' },
    });
    expect(remote.read).not.toHaveBeenCalled();

    redisGet.mockClear();
    facts.read.mockClear();
    remote.read.mockClear();
    redisGet.mockImplementation(async () => {
      throw new Error('Redis read must be bypassed for refresh');
    });
    facts.read.mockImplementation(async () => {
      throw new Error('PostgreSQL read must be bypassed for refresh');
    });

    await expect(reader.read({ ...input(2), refresh: true })).resolves.toMatchObject({
      points: [expect.objectContaining({ close: 2 })],
      provenance: { servedFromCache: false, cacheStatus: 'miss' },
    });
    expect(remote.read).toHaveBeenCalledOnce();
    expect(redisGet).not.toHaveBeenCalled();
    expect(facts.read).not.toHaveBeenCalled();
  });

  it('远端 acquisition 使用规范化上限，用户 limit 只在 Reader 切片', async () => {
    const dsa = { marketBarsV2: vi.fn(async () => series()) };
    const port = new DsaMarketBarRemotePort(dsa as never);
    await port.read(input(1));
    expect(dsa.marketBarsV2).toHaveBeenCalledWith(expect.objectContaining({ limit: 3650 }));
  });

  it('PostgreSQL read-through 按当前 RouteTarget 顺序命中备用来源并保留 provenance', async () => {
    const fallback = {
      ...series(),
      provenance: {
        ...series().provenance,
        providerId: 'akshare',
        upstreamSource: 'eastmoney',
        routeIndex: 1,
        cacheStatus: 'postgres' as const,
        servedFromCache: true,
      },
    };
    const facts = {
      read: vi.fn(async (_input: BarReadInput, provenance: BarSeriesV2['provenance']) =>
        provenance.routeIndex === 1 ? fallback : null,
      ),
      write: vi.fn(),
    };
    const policy = {
      read: vi.fn(async () => ({
        revision: 7,
        targets: [
          { providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0 },
          { providerId: 'akshare', upstreamSource: 'eastmoney', routeIndex: 1 },
        ],
      })),
    };
    const remote = {
      read: vi.fn(async () => {
        throw new Error('不应请求远端');
      }),
    };
    const reader = new MarketBarReader(policy as never, remote as never, facts as never);
    const result = await reader.read(input(2));
    expect(result.provenance.providerId).toBe('akshare');
    expect(result.provenance.upstreamSource).toBe('eastmoney');
    expect(result.provenance.routeIndex).toBe(1);
    expect(facts.read.mock.calls.map((call) => call[1].routeIndex)).toEqual([0, 1]);
    expect(remote.read).not.toHaveBeenCalled();
  });

  it('仅 limit 且 coverage.hasMoreBefore 时不足行数不能作为 PostgreSQL 命中', async () => {
    const store = new PrismaMarketBarFactStore({
      marketBarSeriesCoverage: {
        findUnique: vi.fn(async () => ({
          actualStart: new Date('2025-01-02T07:00:00.000Z'),
          actualEnd: new Date('2025-01-02T07:00:00.000Z'),
          hasMoreBefore: true,
          latestCompleteTradingDate: new Date('2025-01-02T00:00:00.000Z'),
          providerRevision: 'provider-revision',
          fetchedAt: new Date('2025-01-02T08:00:00.000Z'),
          freshUntil: new Date('2099-01-01T00:00:00.000Z'),
        })),
      },
      marketBarSeriesFact: {
        findMany: vi.fn(async () => [
          {
            timestamp: new Date('2025-01-02T07:00:00.000Z'),
            open: 1,
            high: 1.1,
            low: 0.9,
            close: 1,
            volume: 100,
            amount: 1000,
            completionStatus: 'complete',
            availableAt: new Date('2025-01-02T08:00:00.000Z'),
          },
        ]),
      },
    } as never);
    const result = await store.read(input(2), {
      providerId: 'tencent',
      upstreamSource: 'tencent',
      routeIndex: 0,
      effectivePolicyRevision: 7,
      providerRevision: 'source-coverage',
      fetchedAt: new Date(0).toISOString(),
      freshUntil: new Date(0).toISOString(),
      servedFromCache: true,
      cacheStatus: 'postgres',
    });
    expect(result).toBeNull();
  });

  it('指标结果集合必须与请求集合完全一致', async () => {
    const controller = new MarketV2Controller(
      {} as never,
      {
        calculateIndicatorsV2: vi.fn(async () => ({
          contractVersion: 2,
          engineVersion: 'dsa-indicator-v2',
          inputFingerprint: 'remote-fingerprint',
          results: [
            {
              name: 'MA',
              parameters: { period: 5 },
              inputFingerprint: 'remote-fingerprint',
              points: [],
            },
          ],
        })),
      } as never,
    );
    const calculate = (
      controller as unknown as {
        calculate: (
          value: BarSeriesV2,
          requests: Array<{ name: 'MA' | 'MACD' | 'RSI'; parameters: Record<string, number> }>,
        ) => Promise<unknown>;
      }
    ).calculate.bind(controller);
    await expect(
      calculate(series(), [
        { name: 'MA', parameters: { period: 5 } },
        { name: 'RSI', parameters: { short: 3, mid: 5, long: 8 } },
      ]),
    ).rejects.toThrow('请求集合');
  });

  it('指标缓存 Redis 失败时仍保留 memory 结果', async () => {
    const cache = new MarketIndicatorCache({
      client: {
        get: vi.fn(async () => {
          throw new Error('redis unavailable');
        }),
        set: vi.fn(async () => {
          throw new Error('redis unavailable');
        }),
      },
    } as never);
    const response = {
      contractVersion: 2 as const,
      engineVersion: 'dsa-indicator-v2',
      inputFingerprint: 'fingerprint',
      results: [],
    };
    await cache.set('key', response, Date.now() + 60_000);
    await expect(cache.get('key')).resolves.toEqual(response);
  });

  it('分布式锁竞争会等待后 recheck，TTL 覆盖完整回退窗口', async () => {
    const client = {
      set: vi.fn(async () => null),
      get: vi.fn(async () => null),
    };
    const reader = new MarketBarReader({} as never, {} as never, {} as never, { client } as never);
    const withLock = (
      reader as unknown as {
        withDistributedLock: (key: string, work: () => Promise<string>) => Promise<string>;
      }
    ).withDistributedLock.bind(reader);
    const work = vi.fn(async () => 'rechecked');
    await expect(withLock('key', work)).resolves.toBe('rechecked');
    expect(client.get).toHaveBeenCalled();
    const acquiredClient = { set: vi.fn(async () => 'OK'), eval: vi.fn(async () => 0) };
    const acquiredReader = new MarketBarReader(
      {} as never,
      {} as never,
      {} as never,
      { client: acquiredClient } as never,
    );
    const acquired = (
      acquiredReader as unknown as {
        withDistributedLock: (key: string, work: () => Promise<string>) => Promise<string>;
      }
    ).withDistributedLock.bind(acquiredReader);
    await acquired('key', async () => 'locked');
    expect(acquiredClient.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'PX',
      12000,
      'NX',
    );
  });

  it('complete acceptance 拒绝不完整尾 bar，fingerprint 由规范化 points 决定', async () => {
    const incomplete = { ...series(), points: [point('2025-01-03', 'incomplete')] };
    const remote = { read: vi.fn(async () => incomplete) };
    const policy = {
      read: vi.fn(async () => ({
        revision: 7,
        targets: [{ providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0 }],
      })),
    };
    const reader = new MarketBarReader(
      policy as never,
      remote as never,
      { write: vi.fn(), read: vi.fn() } as never,
    );
    await expect(reader.read({ ...input(), acceptance: 'complete' })).rejects.toThrow('complete');
    expect(barSeriesInputFingerprint(incomplete.identity, incomplete.points)).toHaveLength(64);
  });

  it('freshness 区分盘中、收盘后、周末和历史复核窗口', () => {
    const now = new Date('2025-03-03T00:00:00.000Z');
    expect(
      resolveBarFreshUntil(
        { ...series(), identity: { ...series().identity, adjustment: 'qfq' } },
        now,
        { windowEnd: '2025-01-03' },
      ).getTime(),
    ).toBe(now.getTime() + 7 * 86_400_000);
    expect(
      resolveBarFreshUntil(
        { ...series(), identity: { ...series().identity, adjustment: 'none' } },
        now,
        { windowEnd: '2025-01-03' },
      ).getTime(),
    ).toBe(now.getTime() + 30 * 86_400_000);
    expect(
      resolveBarFreshUntil(
        { ...series(), identity: { ...series().identity, adjustment: 'hfq' } },
        now,
        { windowEnd: '2025-01-03' },
      ).getTime(),
    ).toBe(now.getTime() + 7 * 86_400_000);
    const current = { ...series(), points: [point('2025-01-03')] };
    expect(resolveBarFreshUntil(current, new Date('2025-01-03T06:00:00.000Z')).toISOString()).toBe(
      '2025-01-06T01:30:00.000Z',
    );
    expect(
      resolveBarFreshUntil(
        { ...current, points: [point('2025-01-03', 'incomplete')] },
        new Date('2025-01-03T06:00:00.000Z'),
      ).getTime(),
    ).toBe(new Date('2025-01-03T06:00:00.000Z').getTime() + 5 * 60_000);
    expect(
      resolveBarFreshUntil(
        { ...current, points: [{ ...point('2025-01-03'), completionStatus: 'unknown' }] },
        new Date('2025-01-03T08:00:00.000Z'),
      ).getTime(),
    ).toBe(new Date('2025-01-03T08:00:00.000Z').getTime() + 15 * 60_000);
    const missingTail = {
      ...current,
      points: [{ ...point('2025-01-03'), completionStatus: 'unknown' as const }],
    };
    expect(resolveBarFreshUntil(missingTail, new Date('2025-01-06T03:00:00.000Z')).getTime()).toBe(
      new Date('2025-01-06T03:00:00.000Z').getTime() + 5 * 60_000,
    );
    expect(resolveBarFreshUntil(missingTail, new Date('2025-01-06T08:00:00.000Z')).getTime()).toBe(
      new Date('2025-01-06T08:00:00.000Z').getTime() + 15 * 60_000,
    );
    expect(
      resolveBarFreshUntil(missingTail, new Date('2025-01-06T03:00:00.000Z'), {
        windowEnd: '2025-01-03',
      }).getTime(),
    ).toBe(new Date('2025-01-06T03:00:00.000Z').getTime() + 5 * 60_000);
    expect(
      resolveBarFreshUntil(missingTail, new Date('2025-01-06T08:00:00.000Z'), {
        windowEnd: '2025-01-03',
      }).getTime(),
    ).toBe(new Date('2025-01-06T08:00:00.000Z').getTime() + 15 * 60_000);
    expect(
      resolveBarFreshUntil(
        { ...current, points: [point('2025-01-03', 'incomplete')] },
        new Date('2025-01-04T04:00:00.000Z'),
      ).getTime(),
    ).toBe(new Date('2025-01-04T04:00:00.000Z').getTime() + 15 * 60_000);
    // 国庆假期前最后一个交易日是 9 月 30 日；周末及整段休市期间都应保持到下一交易日开盘。
    expect(
      resolveBarFreshUntil(
        { ...current, points: [point('2026-09-30')] },
        new Date('2026-10-04T04:00:00.000Z'),
      ).toISOString(),
    ).toBe('2026-10-08T01:30:00.000Z');
    expect(
      resolveBarFreshUntil(
        { ...current, points: [point('2027-01-04')] },
        new Date('2027-01-04T04:00:00.000Z'),
      ).getTime(),
    ).toBe(new Date('2027-01-04T04:00:00.000Z').getTime() + 5 * 60_000);
  });

  it('point-in-time 要求 complete 且 availableAt 不晚于 asOf', async () => {
    const remote = { read: vi.fn(async () => series()) };
    const policy = {
      read: vi.fn(async () => ({
        revision: 7,
        targets: [{ providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0 }],
      })),
    };
    const reader = new MarketBarReader(
      policy as never,
      remote as never,
      { write: vi.fn(), read: vi.fn() } as never,
    );
    await expect(
      reader.read({ ...input(), acceptance: 'point-in-time', asOf: '2025-01-03T07:30:00.000Z' }),
    ).rejects.toThrow('point-in-time');
    await expect(
      reader.read({ ...input(), acceptance: 'point-in-time', asOf: '2025-01-03T08:30:00.000Z' }),
    ).resolves.toMatchObject({ provenance: { effectivePolicyRevision: 7 } });
  });

  it('source coverage 的 hasMoreBefore 决定较早起点是否需要读穿', async () => {
    const storedPoint = point('2025-01-03');
    const coverage = {
      actualStart: new Date(storedPoint.timestamp),
      actualEnd: new Date(storedPoint.timestamp),
      hasMoreBefore: false,
      latestCompleteTradingDate: new Date('2025-01-03T00:00:00.000Z'),
      providerRevision: 'provider-revision-1',
      fetchedAt: new Date('2025-01-03T08:00:00.000Z'),
      freshUntil: new Date('2099-01-01T00:00:00.000Z'),
    };
    const client = {
      marketBarSeriesCoverage: { findUnique: vi.fn(async () => coverage) },
      marketBarSeriesFact: {
        findMany: vi.fn(async () => [
          {
            timestamp: new Date(storedPoint.timestamp),
            open: storedPoint.open,
            high: storedPoint.high,
            low: storedPoint.low,
            close: storedPoint.close,
            volume: storedPoint.volume,
            amount: storedPoint.amount,
            completionStatus: storedPoint.completionStatus,
            availableAt: new Date(storedPoint.availableAt),
          },
        ]),
      },
    };
    const store = new PrismaMarketBarFactStore(client as never);
    const result = await store.read(
      { ...input(), window: { start: '2025-01-01T00:00:00.000Z' } },
      {
        providerId: 'tencent',
        upstreamSource: 'tencent',
        routeIndex: 0,
        effectivePolicyRevision: 7,
        providerRevision: 'unused',
        fetchedAt: '2025-01-03T08:00:00.000Z',
        freshUntil: '2099-01-01T00:00:00.000Z',
        servedFromCache: true,
        cacheStatus: 'postgres',
      },
    );
    expect(result?.points).toHaveLength(1);
    expect(client.marketBarSeriesFact.findMany).toHaveBeenCalledTimes(1);

    coverage.hasMoreBefore = true;
    await expect(
      store.read(
        { ...input(), window: { start: '2025-01-01T00:00:00.000Z' } },
        {
          providerId: 'tencent',
          upstreamSource: 'tencent',
          routeIndex: 0,
          effectivePolicyRevision: 7,
          providerRevision: 'unused',
          fetchedAt: '2025-01-03T08:00:00.000Z',
          freshUntil: '2099-01-01T00:00:00.000Z',
          servedFromCache: true,
          cacheStatus: 'postgres',
        },
      ),
    ).resolves.toBeNull();
  });

  it('来源 coverage 按连续窗口单调合并，不缩小既有覆盖范围', async () => {
    let storedCoverage: Record<string, unknown> | null = null;
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      marketBarSeriesFact: { upsert: vi.fn(async () => undefined) },
      $transaction: vi.fn(async (writes: Promise<unknown>[]) => Promise.all(writes)),
      marketBarSeriesCoverage: {
        findUnique: vi.fn(async () => storedCoverage),
        upsert: vi.fn(
          async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
            const next = storedCoverage ? args.update : args.create;
            storedCoverage = next;
            updates.push(next);
            return next;
          },
        ),
      },
    };
    const store = new PrismaMarketBarFactStore(client as never);
    const first = series();
    await store.write(first);
    const second = {
      ...first,
      points: [point('2025-01-03'), point('2025-01-04')],
      coverage: {
        ...first.coverage,
        actualStart: '2025-01-03T07:00:00.000Z',
        actualEnd: '2025-01-04T07:00:00.000Z',
        hasMoreBefore: true,
      },
    };
    await store.write(second);
    expect(updates).toHaveLength(2);
    expect(updates.at(-1)?.actualStart).toEqual(new Date('2025-01-02T07:00:00.000Z'));
    expect(updates.at(-1)?.actualEnd).toEqual(new Date('2025-01-04T07:00:00.000Z'));
    expect(updates.at(-1)?.hasMoreBefore).toBe(false);
    expect(client.$transaction).toHaveBeenCalledTimes(2);
  });
});
