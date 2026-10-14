import { describe, expect, it, vi } from 'vitest';
import { MarketDetailService } from '../../src/market/market-detail.service.js';

const policy = () => ({
  revision: 37,
  dsaRevision: 37,
  syncState: 'applied',
  enabled: true,
  effectiveProjection: {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: 'quote-policy',
    revision: 37,
    sourceDesiredRevision: 37,
    enabled: true,
    appliedAt: '2026-10-06T10:00:00.000Z',
    routes: [
      {
        key: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'REALTIME_QUOTE' },
        targets: [
          {
            providerId: 'tencent',
            upstreamSource: 'tencent',
            routeIndex: 0,
            eligible: true,
            reason: null as string | null,
          },
        ],
        reason: null as string | null,
      },
    ],
  },
});

const quote = {
  version: 3,
  symbol: '159516.SZ',
  open: 0.674,
  high: 0.679,
  low: 0.649,
  price: 0.651,
  previousClose: 0.671,
  volume: null,
  amount: null,
  provider: 'tencent',
  stale: true,
  freshness: 'stale',
  marketTime: '2026-09-30T08:14:45.000Z',
  fetchedAt: '2026-10-06T10:00:00.000Z',
};

const serviceFor = (raw: unknown) => {
  const market = { getQuote: vi.fn(async () => quote) };
  const service = new MarketDetailService(
    market as never,
    { getPolicy: vi.fn(async () => raw) } as never,
    {
      asset: { findUnique: vi.fn(async () => ({ assetType: 'etf', identityStatus: 'confirmed' })) },
    } as never,
  );
  return { service, market };
};

describe('行情详情 V3 生效报价策略', () => {
  it.each([['HK', '02800.HK'], ['US', 'SPY.US']])('按 %s 的 ETF 路由消费已解析身份', async (marketCode, symbol) => {
    const p = policy();
    p.effectiveProjection.routes[0]!.key.market = marketCode;
    const market = { getQuote: vi.fn(async () => ({ ...quote, symbol, provider: 'futu' })) };
    const service = new MarketDetailService(market as never, { getPolicy: vi.fn(async () => p) } as never,
      { asset: { findUnique: vi.fn(async () => ({ assetType: 'etf', identityStatus: 'confirmed' })) } } as never);
    const result = await service.getDetail(symbol, { include: 'quote' });
    expect(result.sections.quote).toMatchObject({ status: 'stale', data: { symbol, provider: 'futu' } });
    expect(market.getQuote).toHaveBeenCalledWith(symbol, { allowStale: true, assetType: 'ETF' });
  });

  it('内地报价路由不能授予港股读取资格', async () => {
    const { service, market } = serviceFor(policy());
    const result = await service.getDetail('02800.HK', { include: 'quote' });
    expect(result.sections.quote).toMatchObject({ status: 'unavailable', error: { code: 'capability_not_enabled' } });
    expect(market.getQuote).not.toHaveBeenCalled();
  });

  it('精确 ETF 路由读取真实形状的陈旧报价并保留双时钟与可空量额', async () => {
    const { service, market } = serviceFor(policy());
    const result = await service.getDetail('159516.SZ', { include: 'quote', refresh: true });
    expect(result.sections.quote).toEqual({ capability: 'quote', status: 'stale', data: quote });
    expect(market.getQuote).toHaveBeenCalledWith('159516.SZ', { allowStale: true, refresh: true, assetType: 'ETF' });
  });

  it.each([
    [
      '同步未应用',
      (p: ReturnType<typeof policy>) => {
        p.syncState = 'pending';
      },
    ],
    [
      'DSA修订不一致',
      (p: ReturnType<typeof policy>) => {
        p.dsaRevision = 36;
      },
    ],
    [
      '生效修订不一致',
      (p: ReturnType<typeof policy>) => {
        p.effectiveProjection.revision = 36;
      },
    ],
    [
      '期望修订不一致',
      (p: ReturnType<typeof policy>) => {
        p.effectiveProjection.sourceDesiredRevision = 36;
      },
    ],
    [
      '启用状态不一致',
      (p: ReturnType<typeof policy>) => {
        p.enabled = false;
      },
    ],
    [
      '协议非法',
      (p: ReturnType<typeof policy>) => {
        p.effectiveProjection.contractVersion = 2;
      },
    ],
    [
      '可用目标携带失败原因',
      (p: ReturnType<typeof policy>) => {
        p.effectiveProjection.routes[0]!.targets[0]!.reason = 'not_admitted';
      },
    ],
  ])('%s 时拒绝投影且不调用来源', async (_, change) => {
    const p = policy();
    change(p);
    const { service, market } = serviceFor(p);
    const result = await service.getDetail('159516.SZ', { include: 'quote' });
    expect(result.sections.quote).toMatchObject({
      status: 'unavailable',
      error: { code: 'provider_policy_unavailable' },
    });
    expect(market.getQuote).not.toHaveBeenCalled();
  });

  it.each([
    [
      '另一市场',
      (p: ReturnType<typeof policy>) => {
        p.effectiveProjection.routes[0]!.key.market = 'HK';
      },
    ],
    [
      '另一资产',
      (p: ReturnType<typeof policy>) => {
        p.effectiveProjection.routes[0]!.key.assetType = 'STOCK';
      },
    ],
    [
      '另一能力',
      (p: ReturnType<typeof policy>) => {
        p.effectiveProjection.routes[0]!.key.capability = 'CHIP_SUMMARY';
      },
    ],
    [
      '目标不可用',
      (p: ReturnType<typeof policy>) => {
        const route = p.effectiveProjection.routes[0]!;
        route.targets[0]!.eligible = false;
        route.targets[0]!.reason = 'not_admitted';
        route.reason = 'not_admitted';
      },
    ],
    [
      '策略禁用',
      (p: ReturnType<typeof policy>) => {
        p.enabled = false;
        p.effectiveProjection.enabled = false;
        const route = p.effectiveProjection.routes[0]!;
        route.targets[0]!.eligible = false;
        route.targets[0]!.reason = 'disabled';
        route.reason = 'disabled';
      },
    ],
  ])('%s 不授予 ETF Quote 调用能力', async (_, change) => {
    const p = policy();
    change(p);
    const { service, market } = serviceFor(p);
    const result = await service.getDetail('159516.SZ', { include: 'quote' });
    expect(result.sections.quote).toMatchObject({
      status: 'unavailable',
      error: { code: 'capability_not_enabled' },
    });
    expect(market.getQuote).not.toHaveBeenCalled();
  });

  it('旧对象策略不得作为已应用 V3 投影放行', async () => {
    const { service, market } = serviceFor({
      enabled: true,
      syncState: 'applied',
      routes: { REALTIME_QUOTE: { ETF: [{ providerId: 'tencent', upstreamSource: 'tencent' }] } },
    });
    const result = await service.getDetail('159516.SZ', { include: 'quote' });
    expect(result.sections.quote).toMatchObject({
      status: 'unavailable',
      error: { code: 'provider_policy_unavailable' },
    });
    expect(market.getQuote).not.toHaveBeenCalled();
  });
});
