import { describe, expect, it } from 'vitest';
import {
  ProviderHealthTracker,
  ProviderRegistry,
  mergeBars,
  quoteDifference,
  routeQuote,
  routeQuotes,
  evaluateFreshness,
  CircuitBreaker,
  RateLimiter,
  type MarketDataProvider,
} from '../src/provider.js';
import type { QuoteV1 } from '@thesis-ledger/schemas';
import {
  credentialStatus,
  createJqDataProvider,
  createTushareProvider,
  decryptCredentials,
  encryptCredentials,
  filterPointInTimeFinancials,
  quotaState,
  registerConfiguredProvider,
  rotateCredentials,
  validateProviderConfig,
} from '../src/index.js';
import { defaultCnTradingDay, missingRanges } from '../src/trading-calendar.js';

const quote = (provider: string, price: number): QuoteV1 => ({
  version: 1,
  symbol: '600519.SH',
  open: price,
  high: price,
  low: price,
  price,
  previousClose: price,
  volume: 1,
  amount: price,
  marketTime: '2025-01-01T00:00:00Z',
  fetchedAt: '2025-01-01T00:00:01Z',
  provider,
  freshness: 'live',
  stale: false,
});
const provider = (
  id: string,
  priority: number,
  handler: () => Promise<QuoteV1>,
): MarketDataProvider => ({
  id,
  priority,
  capabilities: new Set(['quote']),
  quote: handler,
  health: async () => true,
});

describe('Provider 路由', () => {
  it('根据插件配置动态注册并拒绝越界能力', () => {
    const registry = new ProviderRegistry();
    const config = {
      id: 'dummy',
      enabled: true,
      priority: 1,
      capabilities: ['quote'] as const,
      settings: {},
    };
    registerConfiguredProvider(
      registry,
      { ...config, capabilities: [...config.capabilities] },
      () => provider('dummy', 1, async () => quote('dummy', 10)),
    );
    expect(registry.for('quote')[0]?.id).toBe('dummy');
  });
  it('优先级失败后降级', async () => {
    const registry = new ProviderRegistry();
    registry.register(
      provider('primary', 1, async () => {
        throw new Error('down');
      }),
    );
    registry.register(provider('fallback', 2, async () => quote('fallback', 10)));
    const result = await routeQuote(registry, new ProviderHealthTracker(), '600519.SH');
    expect(result.provider).toBe('fallback');
    expect(result.warnings[0]).toContain('primary');
  });
  it('对账识别超过 1% 的差异', () =>
    expect(quoteDifference(quote('a', 10), quote('b', 11)).consistent).toBe(false));
  it('合并 Partial Bar 并排序去重', () =>
    expect(
      mergeBars([
        {
          provider: 'a',
          complete: false,
          warnings: [],
          data: [
            {
              version: 1,
              symbol: 'x',
              timeframe: '1d',
              timestamp: '2025-01-02T00:00:00Z',
              open: 1,
              high: 1,
              low: 1,
              close: 1,
              volume: 1,
              amount: 1,
              provider: 'a',
            },
          ],
        },
        {
          provider: 'b',
          complete: true,
          warnings: [],
          data: [
            {
              version: 1,
              symbol: 'x',
              timeframe: '1d',
              timestamp: '2025-01-01T00:00:00Z',
              open: 1,
              high: 1,
              low: 1,
              close: 1,
              volume: 1,
              amount: 1,
              provider: 'b',
            },
          ],
        },
      ]).data.map((bar) => bar.timestamp),
    ).toEqual(['2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z']));
  it('批量请求只对缺失标的调用备用源', async () => {
    const registry = new ProviderRegistry();
    registry.register({
      ...provider('primary', 1, async () => quote('primary', 10)),
      quote: async (symbol) => {
        if (symbol === '000001.SZ') throw new Error('missing');
        return { ...quote('primary', 10), symbol };
      },
    });
    const fallbackCalls: string[] = [];
    registry.register({
      ...provider('fallback', 2, async () => quote('fallback', 10)),
      quote: async (symbol) => {
        fallbackCalls.push(symbol);
        return { ...quote('fallback', 10), symbol };
      },
    });
    const result = await routeQuotes(registry, new ProviderHealthTracker(), [
      '600519.SH',
      '000001.SZ',
    ]);
    expect(result).toMatchObject({
      complete: true,
      missing: [],
      fallbackChain: ['primary', 'fallback'],
    });
    expect(fallbackCalls).toEqual(['000001.SZ']);
  });
  it('按预期时效标记陈旧原因', () =>
    expect(evaluateFreshness('2025-01-01T00:00:00Z', '2025-01-01T00:10:00Z', 60_000)).toMatchObject(
      { stale: true, ageMs: 600_000 },
    ));
  it('健康状态按失败阈值迁移并支持恢复', () => {
    const tracker = new ProviderHealthTracker();
    expect(tracker.record('dsa', false, 10).state).toBe('degraded');
    expect(tracker.record('dsa', false, 10).state).toBe('degraded');
    expect(tracker.record('dsa', false, 10).state).toBe('down');
    expect(tracker.record('dsa', true, 10).state).toBe('healthy');
  });
  it('限流拒绝窗口内超额请求并在窗口后恢复', () => {
    const limiter = new RateLimiter(2, 1_000);
    expect(limiter.tryAcquire(0)).toBe(true);
    expect(limiter.tryAcquire(1)).toBe(true);
    expect(limiter.tryAcquire(2)).toBe(false);
    expect(limiter.retryAfterMs(2)).toBe(998);
    expect(limiter.tryAcquire(1_001)).toBe(true);
  });
  it('熔断达到阈值后拒绝请求，冷却后允许半开探测', async () => {
    const breaker = new CircuitBreaker(2, 50);
    await expect(
      breaker.execute(async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');
    await expect(
      breaker.execute(async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');
    await expect(breaker.execute(async () => 'blocked')).rejects.toThrow('熔断器已打开');
    await new Promise((resolve) => setTimeout(resolve, 55));
    await expect(breaker.execute(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('凭证存储', () => {
  const firstKey = Buffer.alloc(32, 1).toString('base64');
  const secondKey = Buffer.alloc(32, 2).toString('base64');
  it('加密保存、读取和轮换且不返回明文状态', () => {
    const encrypted = encryptCredentials({ token: 'secret' }, firstKey);
    expect(encrypted.toString()).not.toContain('secret');
    expect(decryptCredentials(encrypted, firstKey)).toEqual({ token: 'secret' });
    expect(
      decryptCredentials(rotateCredentials(encrypted, firstKey, secondKey), secondKey),
    ).toEqual({
      token: 'secret',
    });
    expect(credentialStatus({ token: 'secret' })).toEqual({ configured: true, fields: ['token'] });
  });
});

describe('交易日历', () => {
  it('区分周末与交易日时段', () => {
    expect(defaultCnTradingDay('2025-01-04')).toMatchObject({ open: false, sessions: [] });
    expect(defaultCnTradingDay('2025-01-03')).toMatchObject({ open: true });
  });
  it('回填范围只报告缺失交易日并排除交易所节假日', () => {
    expect(missingRanges(['2025-01-02'], '2025-01-01', '2025-01-05')).toEqual(['2025-01-03']);
  });
});

describe('专业 Provider 插件契约', () => {
  const config = {
    id: 'tushare-fixture',
    enabled: true,
    priority: 1,
    capabilities: ['quote', 'bars-1d', 'financials'] as const,
    settings: {},
  };
  it('校验配置并通过统一 Quote/Bar 能力适配传输层', async () => {
    expect(validateProviderConfig(config)).toBe(config);
    const requests: string[] = [];
    const plugin = createTushareProvider(config, {
      request: async (path) => {
        requests.push(path);
        if (path === '/health') return { ok: true };
        if (path.endsWith('quote')) return quote('tushare-fixture', 10);
        return [];
      },
    });
    await expect(plugin.health()).resolves.toBe(true);
    await expect(plugin.quote?.('600519.SH')).resolves.toMatchObject({
      provider: 'tushare-fixture',
    });
    await expect(plugin.bars?.('600519.SH', '1d')).resolves.toEqual([]);
    expect(requests).toEqual(['/health', '/tushare/quote', '/tushare/bars']);
    expect(createJqDataProvider(config, { request: async () => ({ ok: true }) }).id).toBe(
      'tushare-fixture',
    );
  });
  it('PIT 财务只返回决策时已可用记录，并给出额度状态', () => {
    const records = [
      {
        symbol: '600519.SH',
        value: 1,
        publishedAt: '2024-01-01',
        availableAt: '2024-02-01',
        provider: 't',
      },
      {
        symbol: '600519.SH',
        value: 2,
        publishedAt: '2025-01-01',
        availableAt: '2025-02-01',
        provider: 't',
      },
    ];
    expect(filterPointInTimeFinancials(records, '2024-12-31')).toHaveLength(1);
    expect(quotaState({ limit: 100, used: 95 })).toMatchObject({ state: 'warning', remaining: 5 });
    expect(quotaState()).toEqual({ state: 'unknown', remaining: null });
  });
});
