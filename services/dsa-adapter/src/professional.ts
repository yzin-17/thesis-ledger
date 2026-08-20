import type { BarInputV1, QuoteV1 } from '@thesis-ledger/schemas';
import type { MarketDataProvider, MarketCapability, ProviderPluginConfig } from './provider.js';

export interface ProfessionalTransport {
  request(path: string, body: unknown, signal: AbortSignal): Promise<unknown>;
}

const configuredCapabilities = (config: ProviderPluginConfig) =>
  new Set<MarketCapability>(config.capabilities);

export const validateProviderConfig = (config: ProviderPluginConfig) => {
  if (!config.id.trim()) throw new Error('Provider id 不能为空');
  if (!Number.isInteger(config.priority) || config.priority < 0)
    throw new Error('Provider priority 必须为非负整数');
  if (config.capabilities.length === 0) throw new Error('Provider 至少声明一项能力');
  return config;
};

export const createTushareProvider = (
  config: ProviderPluginConfig,
  transport: ProfessionalTransport,
): MarketDataProvider => {
  validateProviderConfig(config);
  const capabilities = configuredCapabilities(config);
  return {
    id: config.id,
    priority: config.priority,
    capabilities,
    async health(signal) {
      await transport.request('/health', {}, signal ?? AbortSignal.timeout(3000));
      return true;
    },
    ...(capabilities.has('quote')
      ? {
          async quote(symbol: string, signal?: AbortSignal) {
            return (await transport.request(
              '/tushare/quote',
              { symbol },
              signal ?? AbortSignal.timeout(5000),
            )) as QuoteV1;
          },
        }
      : {}),
    ...(capabilities.has('bars-1d') || capabilities.has('bars-1m')
      ? {
          async bars(symbol: string, timeframe: '1m' | '1d', signal?: AbortSignal) {
            return (await transport.request(
              '/tushare/bars',
              { symbol, timeframe },
              signal ?? AbortSignal.timeout(5000),
            )) as BarInputV1[];
          },
        }
      : {}),
  };
};

export const createJqDataProvider = createTushareProvider;

export interface PointInTimeFinancial {
  symbol: string;
  value: number;
  publishedAt: string;
  availableAt: string;
  provider: string;
}

export const filterPointInTimeFinancials = (
  records: readonly PointInTimeFinancial[],
  decisionAt: string,
) => records.filter((record) => record.availableAt <= decisionAt);

export const quotaState = (quota?: ProviderPluginConfig['quota']) => {
  if (!quota?.limit) return { state: 'unknown' as const, remaining: null };
  const remaining = Math.max(0, quota.limit - (quota.used ?? 0));
  return {
    state:
      remaining === 0
        ? ('exhausted' as const)
        : remaining / quota.limit < 0.1
          ? ('warning' as const)
          : ('ok' as const),
    remaining,
  };
};
