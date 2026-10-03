import {
  marketRouteKeyIdV3,
  type MarketRouteCapabilityV3,
  type MarketRouteKeyV3,
} from '@thesis-ledger/schemas';
import type {
  MarketPolicyDraftV3,
  MarketRouteCatalogReadV3,
  ProviderManifest,
  RouteTarget,
} from './market-data.types.js';
import { dataSourceDisplay, routeTargetKey, sameRouteTarget } from './market-data.types.js';

export type MarketPolicyRouteRowV3 = {
  id: string;
  key: MarketRouteKeyV3;
  label: string;
};

export type MarketPolicyTargetOptionV3 = {
  key: string;
  target: RouteTarget;
  label: string;
};

const adjustments = ['none', 'qfq', 'hfq'] as const;
const adjustmentOrder = { none: 0, qfq: 1, hfq: 2 } as const;
const marketOrder = { CN: 0, HK: 1, US: 2 } as const;
const assetTypeOrder = {
  STOCK: 0,
  ETF: 1,
  MUTUAL_FUND: 2,
  LOF: 3,
  INDEX: 4,
  BOND: 5,
  CONVERTIBLE_BOND: 6,
} as const;
const capabilityOrder = { DAILY_BAR: 0, MINUTE_BAR: 1 } as const;

const marketLabel: Record<string, string> = {
  CN: '中国内地',
  HK: '香港',
  US: '美国',
};

const assetTypeLabel: Record<string, string> = {
  STOCK: '股票',
  ETF: 'ETF',
  MUTUAL_FUND: '公募基金',
  LOF: '上市开放式基金',
  INDEX: '指数',
  BOND: '债券',
  CONVERTIBLE_BOND: '可转债',
};

const capabilityLabel: Record<string, string> = {
  DAILY_BAR: '日线行情',
  MINUTE_BAR: '分钟行情',
  REALTIME_QUOTE: '实时行情',
  FUND_NAV: '基金净值',
  FUND_NAV_HISTORY: '基金净值历史',
  FUND_HOLDINGS: '基金持仓',
  CHIP_SUMMARY: '筹码摘要',
  DIVIDEND: '现金分红',
  CASH_DISTRIBUTION: '现金分红',
  SPLIT: '份额拆分',
  SPLIT_EVENT: '份额拆分',
};

const adjustmentLabel = {
  none: '不复权',
  qfq: '前复权',
  hfq: '后复权',
} as const;

export const marketCapabilityLabel = (capability: string) =>
  capabilityLabel[capability] ?? '数据能力';

const targetId = (target: RouteTarget) => routeTargetKey(target);

export const routeKeyIdV3 = (key: MarketRouteKeyV3) => marketRouteKeyIdV3(key);

export const routeKeyLabelV3 = (key: MarketRouteKeyV3) => {
  const scope = `${marketLabel[key.market] ?? key.market}${assetTypeLabel[key.assetType] ?? key.assetType}`;
  if (key.kind === 'data') {
    return `${scope} · ${marketCapabilityLabel(key.capability)}`;
  }
  const period = key.timeframe === '1d' ? '日线' : '分钟线';
  return `${scope} · ${capabilityLabel[key.capability] ?? key.capability}（${period}／${adjustmentLabel[key.adjustment]}）`;
};

const routeKeySort = (left: MarketRouteKeyV3, right: MarketRouteKeyV3) => {
  if (left.market !== right.market) return marketOrder[left.market] - marketOrder[right.market];
  if (left.assetType !== right.assetType) {
    return assetTypeOrder[left.assetType] - assetTypeOrder[right.assetType];
  }
  if (left.kind !== right.kind) return left.kind === 'bar' ? -1 : 1;
  if (left.kind === 'bar' && right.kind === 'bar') {
    return (
      capabilityOrder[left.capability] - capabilityOrder[right.capability] ||
      left.timeframe.localeCompare(right.timeframe) ||
      adjustmentOrder[left.adjustment] - adjustmentOrder[right.adjustment]
    );
  }
  return left.capability.localeCompare(right.capability);
};

/** Build rows from catalog keys; any stored key remains visible even when no longer ready. */
export const marketPolicyRouteRowsV3 = (
  catalog: MarketRouteCatalogReadV3 | undefined,
  policy: MarketPolicyDraftV3 | null,
): MarketPolicyRouteRowV3[] => {
  const keys = new Map<string, MarketRouteKeyV3>();
  const add = (key: MarketRouteKeyV3) => keys.set(routeKeyIdV3(key), key);

  if (catalog?.status === 'complete') {
    const dataKeys = new Map<string, Extract<MarketRouteKeyV3, { kind: 'data' }>>();
    const barFamilies = new Map<
      string,
      Omit<Extract<MarketRouteKeyV3, { kind: 'bar' }>, 'adjustment'>
    >();
    for (const entry of catalog.entries) {
      if (entry.key.kind === 'data') {
        dataKeys.set(routeKeyIdV3(entry.key), entry.key);
      } else {
        const { market, assetType, capability, timeframe } = entry.key;
        const familyId = JSON.stringify([market, assetType, capability, timeframe]);
        barFamilies.set(familyId, { kind: 'bar', market, assetType, capability, timeframe });
      }
    }
    for (const key of dataKeys.values()) add(key);
    for (const family of barFamilies.values()) {
      for (const adjustment of adjustments) add({ ...family, adjustment });
    }
  }

  for (const route of policy?.routes ?? []) add(route.key);

  return [...keys.values()]
    .sort(routeKeySort)
    .map((key) => ({ id: routeKeyIdV3(key), key, label: routeKeyLabelV3(key) }));
};

const entryKeyMatches = (entry: MarketRouteCapabilityV3, key: MarketRouteKeyV3) =>
  routeKeyIdV3(entry.key) === routeKeyIdV3(key);

/** Readiness choices come only from exact, complete catalog rows marked ready. */
export const readyRouteTargetsV3 = (
  catalog: MarketRouteCatalogReadV3 | undefined,
  key: MarketRouteKeyV3,
  providers: readonly ProviderManifest[],
): MarketPolicyTargetOptionV3[] => {
  if (catalog?.status !== 'complete') return [];
  return catalog.entries
    .filter((entry) => entryKeyMatches(entry, key) && entry.state === 'ready')
    .map(({ target }) => ({
      key: targetId(target),
      target,
      label: dataSourceDisplay(target.providerId, target.upstreamSource, providers),
    }));
};

export const policyRouteTargetsV3 = (
  policy: MarketPolicyDraftV3,
  key: MarketRouteKeyV3,
): RouteTarget[] =>
  policy.routes.find((route) => routeKeyIdV3(route.key) === routeKeyIdV3(key))?.targets ?? [];

export const updatePolicyRouteTargetV3 = (
  policy: MarketPolicyDraftV3,
  key: MarketRouteKeyV3,
  role: 'primary' | 'fallback',
  target: RouteTarget | null,
): MarketPolicyDraftV3 => {
  const current = policyRouteTargetsV3(policy, key);
  let next: RouteTarget[] = [];
  if (role === 'primary' && target) {
    next = [target];
    if (current[1] && !sameRouteTarget(current[1], target)) next.push(current[1]);
  } else if (role === 'fallback' && current[0]) {
    next = [current[0]];
    if (target && !sameRouteTarget(current[0], target)) next.push(target);
  }

  const routes = policy.routes.filter((route) => routeKeyIdV3(route.key) !== routeKeyIdV3(key));
  if (next.length > 0) routes.push({ key, targets: next });
  return { ...policy, routes };
};

export const routeCatalogMessageV3 = (
  catalog: MarketRouteCatalogReadV3 | undefined,
  requestFailed = false,
) => {
  if (requestFailed) return '路由能力目录暂时不可用，刷新后再试。';
  if (!catalog || catalog.status === 'unavailable') {
    if (catalog?.reason === 'control_timeout') return '读取路由能力目录超时，请刷新后重试。';
    if (catalog?.reason === 'control_unauthorized') return '读取路由能力目录缺少访问权限。';
    if (catalog?.reason === 'unsupported_capability') return 'DSA 暂不支持路由能力目录。';
    if (catalog?.reason === 'invalid_response') return '路由能力目录响应无效，已停用路由选择。';
    return 'DSA 路由能力目录暂时不可用，已停用路由选择。';
  }
  if (catalog.status === 'partial') return '路由能力目录尚未完整，目录就绪前不能修改路由。';
  return null;
};

export const routeAvailabilityLabelV3 = (reason: string | null | undefined) => {
  if (!reason) return null;
  const labels: Record<string, string> = {
    not_adapted: '该来源尚未接入此能力',
    unsupported_adjustment: '该来源不支持此复权口径',
    credential_missing: '凭据缺失',
    not_admitted: '来源尚未准入',
    admission_invalid: '来源准入已失效',
    admission_not_yet_valid: '来源准入尚未生效',
    admission_expired: '来源准入已过期',
    quota_unavailable: '可用额度不足',
    insufficient_coverage: '覆盖范围不足',
    upstream_failure: '上游暂时不可用',
    basis_incompatible: '价格口径不兼容',
    policy_not_applied: '期望路由尚未生效',
    disabled: '路由策略已停用',
    catalog_partial: '精确路由目录尚未完整',
    catalog_unavailable: '精确路由目录不可用',
    route_not_ready: '所选数据源尚未就绪',
    route_catalog_partial: '精确路由目录尚未完整',
    route_catalog_unavailable: '精确路由目录不可用',
    control_timeout: 'DSA Control 响应超时',
    control_unavailable: 'DSA Control 暂时不可用',
    control_unauthorized: 'DSA Control 缺少访问权限',
    invalid_response: 'DSA Control 响应无效',
    unsupported_capability: 'DSA 暂不支持该能力',
  };
  return labels[reason] ?? '路由暂未生效';
};

export const routeAvailabilityMessageV3 = (
  catalog: MarketRouteCatalogReadV3 | undefined,
  key: MarketRouteKeyV3,
) => {
  if (catalog?.status !== 'complete') return routeCatalogMessageV3(catalog);
  const exact = catalog.entries.filter((entry) => entryKeyMatches(entry, key));
  const reasons = [
    ...new Set(exact.map((entry) => entry.state).filter((state) => state !== 'ready')),
  ];
  if (reasons.length > 0) return reasons.map(routeAvailabilityLabelV3).join('；');

  if (key.kind === 'bar') {
    const otherAdjustments = catalog.entries.some(
      (entry) =>
        entry.key.kind === 'bar' &&
        entry.key.market === key.market &&
        entry.key.assetType === key.assetType &&
        entry.key.capability === key.capability &&
        entry.key.timeframe === key.timeframe &&
        entry.key.adjustment !== key.adjustment,
    );
    if (otherAdjustments) return '当前没有就绪来源支持此复权口径。';
  }
  return '当前没有就绪的数据源提供此能力。';
};

export const routeTargetMatchesV3 = sameRouteTarget;
