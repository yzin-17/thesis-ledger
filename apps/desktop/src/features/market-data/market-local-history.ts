import type { LocalHistorySource } from '@thesis-ledger/schemas';
import type { ProviderManifest } from './market-data.types.js';

const legacyPackageNames: Record<string, string> = {
  'official-rules': '公共收费历史资料包',
  'official-states': '停复牌与风险警示历史资料包',
  'official-dividends': '现金分红历史资料包',
  'official-hk-rules': '港股规则与交易状态资料包',
  'official-us-rules': '美股规则与交易状态资料包',
};

export const isLocalHistoryProvider = (provider: ProviderManifest) =>
  provider.sourceKind === 'local_history' ||
  (provider.sourceKind === undefined && Object.hasOwn(legacyPackageNames, provider.providerId));

export const localHistoryProviderLabel = (provider: ProviderManifest) =>
  legacyPackageNames[provider.providerId] ?? provider.displayName;

export const localHistoryScopeLabel = (data: LocalHistorySource | undefined) => {
  if (!data) return '覆盖范围未提供';
  if (data.symbols.length > 0) return data.symbols.join('、');
  const scope = data.scope;
  if (
    scope?.market === 'CN' &&
    scope.exchange === 'XSHG' &&
    scope.assetType === 'STOCK' &&
    scope.tradingMethod === 'auction'
  ) {
    return '上交所 A 股竞价交易';
  }
  return '指定交易范围（未提供显示说明）';
};

export const localHistoryDateLabel = (data: LocalHistorySource | undefined) =>
  data ? `${data.coverage.start}～${data.coverage.end}` : '覆盖日期未提供';

export const localHistoryRouteLabel = (
  provider: ProviderManifest,
  sourceId: string | null | undefined,
) => {
  const source = provider.upstreamSources?.find((item) => item.sourceId === sourceId);
  const title = source?.displayName ?? localHistoryProviderLabel(provider);
  return `本地资料 · ${title}`;
};
