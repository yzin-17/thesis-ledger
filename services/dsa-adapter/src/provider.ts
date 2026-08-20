import { barSchemaV1, type BarInputV1, type BarV1, type QuoteV1 } from '@thesis-ledger/schemas';

export type MarketCapability =
  'quote' | 'bars-1d' | 'bars-1m' | 'indicator' | 'chip' | 'financials' | 'news' | 'announcements';

export interface ProviderPluginConfig {
  id: string;
  enabled: boolean;
  priority: number;
  capabilities: MarketCapability[];
  credentialsRef?: string;
  settings: Record<string, unknown>;
  quota?: { limit?: number; used?: number; resetsAt?: string };
  cost?: { currency: string; amount: number; period: 'request' | 'month' | 'year' };
  resilience?: {
    timeoutMs?: number;
    attempts?: number;
    maxRequests?: number;
    windowMs?: number;
    circuitThreshold?: number;
    circuitResetAfterMs?: number;
  };
}

export interface ProviderResult<T> {
  data: T;
  provider: string;
  complete: boolean;
  warnings: string[];
}

export interface BatchProviderResult<T> extends ProviderResult<T> {
  requested: string[];
  missing: string[];
  fallbackChain: string[];
}

export interface MarketDataProvider {
  readonly id: string;
  readonly capabilities: ReadonlySet<MarketCapability>;
  readonly priority: number;
  readonly resilience?: {
    timeoutMs?: number;
    attempts?: number;
    limiter?: RateLimiter;
    circuitBreaker?: CircuitBreaker;
  };
  quote?(symbol: string, signal?: AbortSignal): Promise<QuoteV1>;
  bars?(symbol: string, timeframe: '1m' | '1d', signal?: AbortSignal): Promise<BarInputV1[]>;
  health(signal?: AbortSignal): Promise<boolean>;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, MarketDataProvider>();
  register(provider: MarketDataProvider) {
    if (this.providers.has(provider.id)) throw new Error(`Provider 已注册: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }
  for(capability: MarketCapability) {
    return [...this.providers.values()]
      .filter((provider) => provider.capabilities.has(capability))
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  }
  get(id: string) {
    return this.providers.get(id);
  }
}

export const registerConfiguredProvider = (
  registry: ProviderRegistry,
  config: ProviderPluginConfig,
  factory: (config: ProviderPluginConfig) => MarketDataProvider,
) => {
  if (!config.enabled) return null;
  const provider = factory(config);
  const configured = new Set(config.capabilities);
  if ([...provider.capabilities].some((capability) => !configured.has(capability)))
    throw new Error(`Provider ${config.id} 声明了未配置的能力`);
  registry.register(provider);
  return provider;
};

export interface ProviderHealthRecord {
  provider: string;
  state: 'healthy' | 'degraded' | 'down';
  consecutiveFailures: number;
  latencyMs: number | null;
  checkedAt: string;
}

export class ProviderHealthTracker {
  private readonly records = new Map<string, ProviderHealthRecord>();
  record(id: string, success: boolean, latencyMs: number) {
    const previous = this.records.get(id);
    const failures = success ? 0 : (previous?.consecutiveFailures ?? 0) + 1;
    const state = success
      ? latencyMs > 3000
        ? 'degraded'
        : 'healthy'
      : failures >= 3
        ? 'down'
        : 'degraded';
    const record: ProviderHealthRecord = {
      provider: id,
      state,
      consecutiveFailures: failures,
      latencyMs,
      checkedAt: new Date().toISOString(),
    };
    this.records.set(id, record);
    return record;
  }
  get(id: string) {
    return (
      this.records.get(id) ?? {
        provider: id,
        state: 'degraded' as const,
        consecutiveFailures: 0,
        latencyMs: null,
        checkedAt: new Date(0).toISOString(),
      }
    );
  }
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  constructor(
    private readonly threshold = 3,
    private readonly resetAfterMs = 30_000,
  ) {}
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.failures >= this.threshold && Date.now() - this.openedAt < this.resetAfterMs)
      throw new Error('熔断器已打开');
    try {
      const result = await operation();
      this.failures = 0;
      return result;
    } catch (error) {
      this.failures += 1;
      if (this.failures >= this.threshold) this.openedAt = Date.now();
      throw error;
    }
  }
}

export class RateLimiter {
  private readonly requests: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {
    if (maxRequests <= 0 || windowMs <= 0) throw new Error('限流参数必须为正数');
  }

  tryAcquire(now = Date.now()) {
    while (this.requests[0] !== undefined && now - this.requests[0] >= this.windowMs)
      this.requests.shift();
    if (this.requests.length >= this.maxRequests) return false;
    this.requests.push(now);
    return true;
  }

  retryAfterMs(now = Date.now()) {
    while (this.requests[0] !== undefined && now - this.requests[0] >= this.windowMs)
      this.requests.shift();
    return this.requests[0] === undefined
      ? 0
      : Math.max(0, this.windowMs - (now - this.requests[0]));
  }
}

export const withRetry = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: { attempts: number; timeoutMs: number },
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation(AbortSignal.timeout(options.timeoutMs));
    } catch (error) {
      lastError = error;
      if (attempt < options.attempts)
        await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
};

export const routeQuote = async (
  registry: ProviderRegistry,
  health: ProviderHealthTracker,
  symbol: string,
  options: {
    limiter?: RateLimiter;
    circuitBreakers?: Map<string, CircuitBreaker>;
  } = {},
): Promise<ProviderResult<QuoteV1>> => {
  const warnings: string[] = [];
  for (const provider of registry.for('quote')) {
    if (!provider.quote || health.get(provider.id).state === 'down') continue;
    const limiter = options.limiter ?? provider.resilience?.limiter;
    if (limiter && !limiter.tryAcquire()) {
      warnings.push(`${provider.id}: rate_limited`);
      continue;
    }
    const started = Date.now();
    try {
      const operation = () =>
        withRetry((signal) => provider.quote!(symbol, signal), {
          attempts: provider.resilience?.attempts ?? 2,
          timeoutMs: provider.resilience?.timeoutMs ?? 5000,
        });
      const circuitBreaker =
        options.circuitBreakers?.get(provider.id) ?? provider.resilience?.circuitBreaker;
      const data = await (circuitBreaker?.execute(operation) ?? operation());
      health.record(provider.id, true, Date.now() - started);
      return { data, provider: provider.id, complete: true, warnings };
    } catch (error) {
      health.record(provider.id, false, Date.now() - started);
      warnings.push(`${provider.id}: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
  throw new AggregateError(warnings, `没有可用的 Quote Provider: ${symbol}`);
};

export const routeQuotes = async (
  registry: ProviderRegistry,
  health: ProviderHealthTracker,
  symbols: readonly string[],
): Promise<BatchProviderResult<QuoteV1[]>> => {
  const pending = new Set(symbols);
  const quotes = new Map<string, QuoteV1>();
  const warnings: string[] = [];
  const fallbackChain: string[] = [];
  for (const provider of registry.for('quote')) {
    if (!provider.quote || health.get(provider.id).state === 'down' || pending.size === 0) continue;
    fallbackChain.push(provider.id);
    for (const symbol of [...pending]) {
      const started = Date.now();
      try {
        const quote = await withRetry((signal) => provider.quote!(symbol, signal), {
          attempts: 2,
          timeoutMs: 5000,
        });
        if (quote.symbol !== symbol) throw new Error(`返回标的不匹配: ${quote.symbol}`);
        quotes.set(symbol, quote);
        pending.delete(symbol);
        health.record(provider.id, true, Date.now() - started);
      } catch (error) {
        health.record(provider.id, false, Date.now() - started);
        warnings.push(
          `${provider.id}/${symbol}: ${error instanceof Error ? error.message : '未知错误'}`,
        );
      }
    }
  }
  return {
    data: symbols.flatMap((symbol) => {
      const quote = quotes.get(symbol);
      return quote ? [quote] : [];
    }),
    provider: fallbackChain.join('+'),
    complete: pending.size === 0,
    requested: [...symbols],
    missing: [...pending],
    warnings,
    fallbackChain,
  };
};

export const evaluateFreshness = (
  marketTime: string,
  fetchedAt: string,
  expectedFreshnessMs: number,
) => {
  const ageMs = new Date(fetchedAt).getTime() - new Date(marketTime).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0)
    return { stale: true, ageMs, staleReason: '行情时间无效' };
  if (ageMs > expectedFreshnessMs)
    return { stale: true, ageMs, staleReason: `数据年龄超过 ${expectedFreshnessMs}ms` };
  return { stale: false, ageMs, staleReason: null };
};

export class ProviderHealthMonitor {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly tracker: ProviderHealthTracker,
  ) {}

  async checkAll(): Promise<ProviderHealthRecord[]> {
    const providers = new Map<MarketDataProvider, true>();
    for (const capability of [
      'quote',
      'bars-1d',
      'bars-1m',
      'indicator',
      'chip',
      'financials',
      'news',
      'announcements',
    ] as const)
      for (const provider of this.registry.for(capability)) providers.set(provider, true);
    return Promise.all(
      [...providers.keys()].map(async (provider) => {
        const started = Date.now();
        try {
          const healthy = await provider.health(AbortSignal.timeout(3000));
          return this.tracker.record(provider.id, healthy, Date.now() - started);
        } catch {
          return this.tracker.record(provider.id, false, Date.now() - started);
        }
      }),
    );
  }
}

export const mergeBars = (
  results: readonly ProviderResult<BarInputV1[]>[],
): ProviderResult<BarV1[]> => {
  const byTimestamp = new Map<string, BarV1>();
  results.forEach((result, providerIndex) => {
    const fetchedAt = new Date().toISOString();
    for (const raw of result.data) {
      const bar = barSchemaV1.parse({
        ...raw,
        fetchedAt: raw.fetchedAt ?? fetchedAt,
        freshness: raw.freshness ?? 'unknown',
        fallbackUsed: raw.fallbackUsed ?? providerIndex > 0,
        servedFromCache: false,
      });
      if (!byTimestamp.has(bar.timestamp)) byTimestamp.set(bar.timestamp, bar);
    }
  });
  const data = [...byTimestamp.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return {
    data,
    provider: results.map((result) => result.provider).join('+'),
    complete: results.some((result) => result.complete),
    warnings: results.flatMap((result) => result.warnings),
  };
};

export const quoteDifference = (left: QuoteV1, right: QuoteV1) => ({
  priceRatio: left.price === 0 ? null : Math.abs(left.price - right.price) / left.price,
  marketTimeDeltaMs: Math.abs(
    new Date(left.marketTime).getTime() - new Date(right.marketTime).getTime(),
  ),
  consistent:
    left.price === 0 ? right.price === 0 : Math.abs(left.price - right.price) / left.price <= 0.01,
});
