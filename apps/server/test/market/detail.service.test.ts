import { describe, expect, it, vi } from 'vitest';
import { MarketDetailService } from '../../src/market/market-detail.service.js';

const time = '2026-08-21T00:00:00.000Z';
const route = [{ providerId: 'fixture', upstreamSource: 'fixture' }];
const quote = {
  version: 1,
  symbol: '600519.SH',
  open: 10,
  high: 12,
  low: 9,
  price: 11,
  previousClose: 10,
  volume: 100,
  amount: 1100,
  stale: false,
  provider: 'fixture',
  marketTime: time,
  fetchedAt: time,
  freshness: 'live' as const,
};
const chip = {
  version: 1,
  symbol: '600519.SH',
  averageCost: 10,
  profitRatio: 0.5,
  range70: [9, 11] as [number, number],
  range90: [8, 12] as [number, number],
  concentration: 0.4,
  provider: 'fixture',
  engineVersion: 'fixture',
  calculatedAt: time,
};

const makePrisma = (asset: unknown) => ({
  asset: { findUnique: vi.fn(async () => asset) },
  instrumentAssetAssociation: { findUnique: vi.fn(async () => null) },
  instrument: { findFirst: vi.fn(async () => null) },
});

const makeControl = () => ({
  getPolicy: vi.fn(async () => ({
    enabled: true,
    syncState: 'applied',
    routes: {
      REALTIME_QUOTE: { STOCK: route, ETF: route },
      CHIP_SUMMARY: { STOCK: route },
      FUND_NAV: { MUTUAL_FUND: route },
      FUND_NAV_HISTORY: { MUTUAL_FUND: route },
    },
  })),
});

describe('MarketDetailService（非 bars/indicator helper）', () => {
  it('默认只编排非 bars/indicator 能力', async () => {
    const market = {
      getQuote: vi.fn(async () => quote),
      getChip: vi.fn(async () => chip),
      getBars: vi.fn(),
      getIndicator: vi.fn(),
    };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      makePrisma({ assetType: 'stock', identityStatus: 'confirmed' }) as never,
    );

    const result = await service.getDetail('600519');

    expect(result.requested).toEqual(['quote', 'chip']);
    expect(result.sections.quote).toMatchObject({ status: 'ready', data: { price: 11 } });
    expect(result.sections.chip).toMatchObject({ status: 'ready' });
    expect(result.sections.bars).toBeUndefined();
    expect(market.getBars).not.toHaveBeenCalled();
    expect(market.getIndicator).not.toHaveBeenCalled();
  });

  it('拒绝由旧 helper 直接请求 bars 或 indicator', async () => {
    const service = new MarketDetailService(
      { getQuote: vi.fn() } as never,
      makeControl() as never,
      makePrisma({ assetType: 'stock' }) as never,
    );

    await expect(service.getDetail('600519', { include: 'bars' })).rejects.toThrow(
      '不支持的行情详情能力',
    );
    await expect(service.getDetail('600519', { include: 'indicator:MA' })).rejects.toThrow(
      '不支持的行情详情能力',
    );
  });

  it('资产不支持的非 bars 能力仍显式返回 unsupported', async () => {
    const market = { getQuote: vi.fn(async () => quote), getChip: vi.fn() };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      makePrisma({ assetType: 'etf' }) as never,
    );

    const result = await service.getDetail('510300.SH', { include: ['quote', 'chip'] });

    expect(result.sections.chip).toMatchObject({
      status: 'unsupported',
      error: { code: 'capability_unsupported' },
    });
    expect(market.getChip).not.toHaveBeenCalled();
  });

  it('策略不可用时不调用非 bars Provider', async () => {
    const market = { getQuote: vi.fn(), getChip: vi.fn() };
    const service = new MarketDetailService(
      market as never,
      { getPolicy: vi.fn(async () => { throw new Error('offline'); }) } as never,
      makePrisma({ assetType: 'stock' }) as never,
    );

    const result = await service.getDetail('600519.SH', { include: ['quote', 'chip'] });

    expect(result.sections.quote).toMatchObject({ status: 'unavailable' });
    expect(result.sections.chip).toMatchObject({ status: 'unavailable' });
    expect(market.getQuote).not.toHaveBeenCalled();
    expect(market.getChip).not.toHaveBeenCalled();
  });
});
