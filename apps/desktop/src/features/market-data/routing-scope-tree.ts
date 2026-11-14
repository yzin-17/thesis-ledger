import {
  marketPolicyCategories,
  routingScopeId,
  type RoutingAuthoring,
  type RoutingScope,
} from '@thesis-ledger/schemas';
import { marketLabel, assetTypeLabel, marketCapabilityLabel } from './market-data-routes-v3.js';
import { routingScopeMatchesKey } from './routing-config-draft.js';

export type RoutingScopeNode = { scope: RoutingScope; label: string };
const adjustments = { none: '不复权', qfq: '前复权', hfq: '后复权' };
const fields = ['market', 'assetType', 'capability', 'timeframe', 'adjustment'] as const;

export function routingScopeName(scope: RoutingScope): string {
  if (scope.adjustment) return adjustments[scope.adjustment];
  if (scope.timeframe)
    return scope.timeframe === '1d' ? '日线' : `${parseInt(scope.timeframe)} 分钟`;
  if (scope.capability) return marketCapabilityLabel(scope.capability);
  if (scope.assetType) return assetTypeLabel[scope.assetType] ?? scope.assetType;
  if (scope.market) return marketLabel[scope.market] ?? scope.market;
  return '全部市场默认';
}

export function routingScopePath(scope: RoutingScope): string {
  const result: string[] = [
    marketPolicyCategories.find((item) => item.id === scope.category)!.label,
  ];
  if (scope.market) result.push(marketLabel[scope.market] ?? scope.market);
  if (scope.assetType) result.push(assetTypeLabel[scope.assetType] ?? scope.assetType);
  if (scope.capability) result.push(marketCapabilityLabel(scope.capability));
  if (scope.timeframe)
    result.push(scope.timeframe === '1d' ? '日线' : `${parseInt(scope.timeframe)} 分钟`);
  if (scope.adjustment) result.push(adjustments[scope.adjustment]);
  return result.join(' · ');
}

/** 每个节点都是可编辑的真实继承范围，展开不创建规则。 */
export function routingScopeChildren(
  config: RoutingAuthoring,
  scope: RoutingScope,
): RoutingScopeNode[] {
  const field = fields.find((name) => !scope[name]);
  if (!field) return [];
  const values = new Set<string>();
  for (const key of config.keys.filter((key) => routingScopeMatchesKey(scope, key))) {
    if (field in key) values.add(String(key[field as keyof typeof key]));
  }
  const order: Partial<Record<(typeof fields)[number], string[]>> = {
    market: ['CN', 'HK', 'US'],
    assetType: ['STOCK', 'ETF', 'INDEX', 'MUTUAL_FUND', 'FUTURE', 'OPTION'],
    capability: ['REALTIME_QUOTE', 'DAILY_BAR', 'MINUTE_BAR', 'FUND_NAV', 'FUND_NAV_HISTORY'],
    timeframe: ['1m', '5m', '15m', '30m', '60m', '1d'],
    adjustment: ['none', 'qfq', 'hfq'],
  };
  const sequence = order[field] ?? [];
  return [...values]
    .sort((left, right) => {
      const a = sequence.indexOf(left),
        b = sequence.indexOf(right);
      if (a >= 0 && b >= 0) return a - b;
      if (a >= 0) return -1;
      if (b >= 0) return 1;
      return left.localeCompare(right);
    })
    .map((value) => {
      const child = { ...scope, [field]: value };
      return { scope: child, label: routingScopeName(child) };
    });
}

export function routingScopeOverrides(config: RoutingAuthoring, scope: RoutingScope): number {
  return config.rules.filter(
    (rule) =>
      routingScopeId(rule.scope) !== routingScopeId(scope) &&
      Object.entries(scope).every(
        ([field, value]) => rule.scope[field as keyof RoutingScope] === value,
      ),
  ).length;
}
