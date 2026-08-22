import { describe, expect, it, vi } from 'vitest';
import { DsaError } from '../../src/integration/dsa/dsa.client.js';
import {
  MARKET_DETAIL_CAPABILITY_MATRIX,
  MarketDetailService,
} from '../../src/market/market-detail.service.js';

const time = '2026-08-21T00:00:00.000Z';

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

const bars = [
  {
    version: 1 as const,
    symbol: '600519.SH',
    timeframe: '1d' as const,
    timestamp: time,
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    volume: 100,
    amount: 1100,
    provider: 'fixture',
    fetchedAt: time,
    freshness: 'live' as const,
    fallbackUsed: false,
    servedFromCache: false,
  },
];

const indicator = (name: 'MA' | 'MACD' | 'RSI') => ({
  version: 1 as const,
  symbol: '600519.SH',
  name,
  parameters: {},
  timeframe: '1d' as const,
  marketTime: time,
  calculatedAt: time,
  values: { value: 1 },
  provider: 'fixture',
  engineVersion: 'fixture',
});

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

const fundNav = {
  version: 1,
  symbol: '000001.OF',
  unitNav: 1.2,
  navDate: time,
  provider: 'fixture',
  fetchedAt: time,
  freshness: 'delayed' as const,
};

const makePrisma = (asset: unknown, association: unknown = null, instrument: unknown = null) => ({
  asset: { findUnique: vi.fn(async () => asset) },
  instrumentAssetAssociation: { findUnique: vi.fn(async () => association) },
  instrument: { findFirst: vi.fn(async () => instrument) },
});

const makeControl = () => ({
  getPolicy: vi.fn(async () => ({
    enabled: true,
    syncState: 'applied',
    routes: {
      REALTIME_QUOTE: { STOCK: ['fixture'], ETF: ['fixture'] },
      DAILY_BAR: { STOCK: ['fixture'], ETF: ['fixture'] },
      FUND_NAV: { MUTUAL_FUND: ['fixture'] },
      FUND_NAV_HISTORY: { MUTUAL_FUND: ['fixture'] },
      CHIP_SUMMARY: { STOCK: ['fixture'] },
    },
  })),
});

describe('MarketDetailService', () => {
  it('为股票返回六个已支持分段，并且不会创建 ATR 请求', async () => {
    const market = {
      getQuote: vi.fn(async () => quote),
      getBars: vi.fn(async () => bars),
      getIndicator: vi.fn(async (_symbol: string, name: 'MA' | 'MACD' | 'RSI') => indicator(name)),
      getChip: vi.fn(async () => chip),
    };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      makePrisma({ assetType: 'stock', identityStatus: 'confirmed' }) as never,
    );

    const result = await service.getDetail('600519');

    expect(result).toMatchObject({
      symbol: '600519.SH',
      assetType: 'STOCK',
      identity: { source: 'asset', status: 'confirmed' },
      requested: MARKET_DETAIL_CAPABILITY_MATRIX.STOCK,
      sections: {
        quote: { status: 'ready', data: { price: 11 } },
        bars: { status: 'ready', data: bars },
        'indicator:MA': { status: 'ready' },
        'indicator:MACD': { status: 'ready' },
        'indicator:RSI': { status: 'ready' },
        chip: { status: 'ready' },
      },
    });
    expect(market.getIndicator).toHaveBeenCalledTimes(3);
    expect(market).not.toHaveProperty('getAtr');
  });

  it('非法能力和超限历史参数在调用 Provider 前返回 400', async () => {
    const market = {
      getQuote: vi.fn(),
      getBars: vi.fn(),
    };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      makePrisma({ assetType: 'stock' }) as never,
    );

    await expect(service.getDetail('600519', { include: 'indicator:ATR' })).rejects.toThrow(
      '不支持的行情详情能力',
    );
    await expect(service.getDetail('600519', { barsLimit: 91 })).rejects.toThrow(
      'barsLimit 必须是 1 到 90 之间的整数',
    );
    expect(market.getQuote).not.toHaveBeenCalled();
    expect(market.getBars).not.toHaveBeenCalled();
  });

  it('单个股票分段失败时保留其他结果并隐藏 Provider 原始错误', async () => {
    const market = {
      getQuote: vi.fn(async () => quote),
      getBars: vi.fn(async () => bars),
      getIndicator: vi.fn(async (_symbol: string, name: 'MA' | 'MACD' | 'RSI') => indicator(name)),
      getChip: vi.fn(async () => {
        throw new DsaError('provider-secret', 'unavailable');
      }),
    };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      makePrisma({ assetType: 'stock' }) as never,
    );

    const result = await service.getDetail('600519', { include: ['quote', 'bars', 'chip'] });

    expect(result.sections.quote).toMatchObject({ status: 'ready' });
    expect(result.sections.bars).toMatchObject({ status: 'ready' });
    expect(result.sections.chip).toMatchObject({
      status: 'unavailable',
      error: { code: 'market_data_unavailable', message: '当前行情暂时不可用，请稍后重试。' },
    });
    expect(JSON.stringify(result)).not.toContain('provider-secret');
  });

  it('ETF 的 chip 显式返回 unsupported 且不触发 chip Provider 请求', async () => {
    const market = {
      getQuote: vi.fn(async () => ({ ...quote, symbol: '510300.SH' })),
      getBars: vi.fn(async () => []),
      getIndicator: vi.fn(async (_symbol: string, name: 'MA' | 'MACD' | 'RSI') => indicator(name)),
      getChip: vi.fn(),
    };
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

  it('空日线返回 empty 而不是伪装成 ready', async () => {
    const market = { getBars: vi.fn(async () => []) };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      makePrisma({ assetType: 'etf' }) as never,
    );

    const result = await service.getDetail('510300.SH', { include: ['bars'] });

    expect(result.sections.bars).toMatchObject({ status: 'empty', data: [] });
  });

  it('基金默认只读取 NAV 两个分段', async () => {
    const market = {
      getFundNav: vi.fn(async () => fundNav),
      getFundNavHistory: vi.fn(async () => [fundNav]),
      getQuote: vi.fn(),
      getBars: vi.fn(),
      getIndicator: vi.fn(),
      getChip: vi.fn(),
    };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      makePrisma({ assetType: 'fund' }) as never,
    );

    const result = await service.getDetail('000001.OF');

    expect(result.requested).toEqual(['fund-nav', 'fund-nav-history']);
    expect(result.sections).toMatchObject({
      'fund-nav': { status: 'ready' },
      'fund-nav-history': { status: 'ready' },
    });
    expect(market.getFundNavHistory).toHaveBeenCalledWith(
      '000001.OF',
      { limit: 30 },
      { persistIdentity: false },
    );
    expect(market.getQuote).not.toHaveBeenCalled();
    expect(market.getBars).not.toHaveBeenCalled();
    expect(market.getIndicator).not.toHaveBeenCalled();
    expect(market.getChip).not.toHaveBeenCalled();
  });

  it('无法确认资产类型时只返回能力矩阵，不写回身份或请求 Provider', async () => {
    const market = {
      getQuote: vi.fn(),
      getBars: vi.fn(),
      getIndicator: vi.fn(),
      getChip: vi.fn(),
      getFundNav: vi.fn(),
      getFundNavHistory: vi.fn(),
    };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      makePrisma(null) as never,
    );

    const result = await service.getDetail('600519.SH');

    expect(result).toMatchObject({
      assetType: 'UNKNOWN',
      identity: { source: 'unknown', status: 'unknown' },
      requested: [],
      sections: {},
    });
    expect(market.getQuote).not.toHaveBeenCalled();
    expect(market.getFundNav).not.toHaveBeenCalled();
  });

  it('无法确认 .OF 资产时不推断基金，也不读取或写入基金净值', async () => {
    const market = {
      getFundNav: vi.fn(),
      getFundNavHistory: vi.fn(),
    };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      makePrisma(null) as never,
    );

    const result = await service.getDetail('000001.OF', { include: ['fund-nav-history'] });

    expect(result.assetType).toBe('UNKNOWN');
    expect(result.sections['fund-nav-history']).toMatchObject({ status: 'unsupported' });
    expect(market.getFundNav).not.toHaveBeenCalled();
    expect(market.getFundNavHistory).not.toHaveBeenCalled();
  });

  it('忽略未确认或失效的 Instrument 关联，不据此确定资产类型', async () => {
    const market = { getQuote: vi.fn(), getBars: vi.fn() };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      makePrisma(null, {
        status: 'active',
        confirmedAt: null,
        instrument: { instrumentType: 'ETF', active: true },
      }) as never,
    );

    const result = await service.getDetail('510300.SH');

    expect(result.assetType).toBe('UNKNOWN');
    expect(result.identity).toMatchObject({ source: 'unknown', status: 'unknown' });
    expect(market.getQuote).not.toHaveBeenCalled();
    expect(market.getBars).not.toHaveBeenCalled();
  });

  it('有效策略未启用的能力返回 unavailable 且不触发 Provider 请求', async () => {
    const market = { getQuote: vi.fn(async () => quote), getChip: vi.fn() };
    const control = {
      getPolicy: vi.fn(async () => ({
        enabled: true,
        syncState: 'applied',
        routes: { REALTIME_QUOTE: { STOCK: ['fixture'] } },
      })),
    };
    const service = new MarketDetailService(
      market as never,
      control as never,
      makePrisma({ assetType: 'stock' }) as never,
    );

    const result = await service.getDetail('600519.SH', { include: ['quote', 'chip'] });

    expect(result.sections.quote).toMatchObject({ status: 'ready' });
    expect(result.sections.chip).toMatchObject({
      status: 'unavailable',
      error: { code: 'capability_not_enabled' },
    });
    expect(result.capabilities.supported).toContain('chip');
    expect(result.capabilities.unsupported).not.toContain('chip');
    expect(market.getChip).not.toHaveBeenCalled();
  });

  it('日线策略不可用时为指标返回共同 DAILY_BAR 依赖状态', async () => {
    const market = { getBars: vi.fn(), getIndicator: vi.fn() };
    const control = {
      getPolicy: vi.fn(async () => ({
        enabled: true,
        syncState: 'applied',
        routes: { REALTIME_QUOTE: { STOCK: ['fixture'] } },
      })),
    };
    const service = new MarketDetailService(
      market as never,
      control as never,
      makePrisma({ assetType: 'stock' }) as never,
    );

    const result = await service.getDetail('600519.SH', {
      include: ['indicator:MA', 'indicator:MACD', 'indicator:RSI'],
    });

    expect(result.dependencies.DAILY_BAR).toMatchObject({
      status: 'unavailable',
      error: { code: 'capability_not_enabled' },
    });
    expect(result.sections['indicator:MA']?.error?.diagnosticId).toBe(
      result.dependencies.DAILY_BAR?.error?.diagnosticId,
    );
    expect(result.sections['indicator:RSI']?.error?.diagnosticId).toBe(
      result.dependencies.DAILY_BAR?.error?.diagnosticId,
    );
    expect(market.getBars).not.toHaveBeenCalled();
    expect(market.getIndicator).not.toHaveBeenCalled();
  });

  it('无法读取有效策略时将请求分段标记 unavailable 且不调用 Provider', async () => {
    const market = { getQuote: vi.fn(), getBars: vi.fn(), getIndicator: vi.fn() };
    const control = {
      getPolicy: vi.fn(async () => {
        throw new Error('policy offline');
      }),
    };
    const service = new MarketDetailService(
      market as never,
      control as never,
      makePrisma({ assetType: 'stock' }) as never,
    );

    const result = await service.getDetail('600519.SH', {
      include: ['quote', 'bars', 'indicator:MA'],
    });

    expect(result.sections.quote).toMatchObject({
      status: 'unavailable',
      error: { code: 'provider_policy_unavailable' },
    });
    expect(result.sections.bars).toMatchObject({ status: 'unavailable' });
    expect(result.sections['indicator:MA']).toMatchObject({ status: 'unavailable' });
    expect(result.dependencies.DAILY_BAR).toMatchObject({ status: 'unavailable' });
    expect(result.dependencies.DAILY_BAR?.error?.diagnosticId).toBe(
      result.sections['indicator:MA']?.error?.diagnosticId,
    );
    expect(market.getQuote).not.toHaveBeenCalled();
    expect(market.getBars).not.toHaveBeenCalled();
    expect(market.getIndicator).not.toHaveBeenCalled();
  });

  it('资产身份存储读取失败时不伪装成 UNKNOWN 空详情', async () => {
    const market = { getQuote: vi.fn() };
    const prisma = {
      asset: {
        findUnique: vi.fn(async () => {
          throw new Error('database offline');
        }),
      },
      instrumentAssetAssociation: { findUnique: vi.fn() },
      instrument: { findFirst: vi.fn() },
    };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      prisma as never,
    );

    await expect(service.getDetail('600519.SH')).rejects.toThrow('资产身份暂时不可用');
    expect(market.getQuote).not.toHaveBeenCalled();
  });

  it('日线共同依赖失败时只产生一条依赖诊断且不继续请求三个指标', async () => {
    const market = {
      getBars: vi.fn(async () => {
        throw new DsaError('upstream detail', 'timeout');
      }),
      getIndicator: vi.fn(),
    };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      makePrisma({ assetType: 'etf' }) as never,
    );

    const result = await service.getDetail('510300.SH', {
      include: ['indicator:MA', 'indicator:MACD', 'indicator:RSI'],
    });

    expect(result.dependencies.DAILY_BAR).toMatchObject({
      status: 'unavailable',
      error: { code: 'market_data_timeout' },
    });
    expect(result.sections['indicator:MA']).toMatchObject({ status: 'unavailable' });
    expect(result.sections['indicator:MACD']).toMatchObject({ status: 'unavailable' });
    expect(result.sections['indicator:RSI']).toMatchObject({ status: 'unavailable' });
    expect(result.sections['indicator:MA']?.error?.diagnosticId).toBe(
      result.sections['indicator:RSI']?.error?.diagnosticId,
    );
    expect(market.getIndicator).not.toHaveBeenCalled();
  });

  it('stale fallback 保留陈旧状态，refresh 和限制参数传给底层能力', async () => {
    const staleQuote = { ...quote, stale: true, freshness: 'stale' as const };
    const staleBars = bars.map((bar) => ({ ...bar, freshness: 'stale' as const }));
    const market = {
      getQuote: vi.fn(async (_symbol: string, options: { refresh?: boolean }) => {
        expect(options.refresh).toBe(true);
        return staleQuote;
      }),
      getBars: vi.fn(
        async (
          _symbol: string,
          _timeframe: '1d',
          _range: unknown,
          options: { refresh?: boolean },
        ) => {
          expect(options.refresh).toBe(true);
          return [...staleBars, ...staleBars, ...staleBars];
        },
      ),
      getFundNav: vi.fn(),
      getFundNavHistory: vi.fn(),
      getIndicator: vi.fn(),
      getChip: vi.fn(),
    };
    const service = new MarketDetailService(
      market as never,
      makeControl() as never,
      makePrisma({ assetType: 'stock' }) as never,
    );

    const result = await service.getDetail('600519.SH', {
      include: ['quote', 'bars'],
      barsLimit: 1,
      refresh: true,
    });

    expect(result.sections.quote).toMatchObject({ status: 'stale' });
    expect(result.sections.bars).toMatchObject({ status: 'stale', data: [staleBars.at(-1)] });
    expect(result.limits.bars).toBe(1);
  });
});
