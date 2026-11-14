import { groupBy } from 'es-toolkit';
import type { MarketPolicyRouteRowV3 } from './market-data-routes-v3.js';

export { marketPolicyCategories, marketPolicyCategoryV3 } from '@thesis-ledger/schemas';
import { marketPolicyCategories, marketPolicyCategoryV3 } from '@thesis-ledger/schemas';
export type { MarketPolicyCategory } from '@thesis-ledger/schemas';

export const marketPolicyRouteGroupsV3 = (rows: readonly MarketPolicyRouteRowV3[]) => {
  const grouped = groupBy(rows, (row) => marketPolicyCategoryV3(row.key));
  return marketPolicyCategories
    .filter((category) => category.id !== 'other' || grouped.other?.length)
    .map((category) => ({ ...category, rows: grouped[category.id] ?? [] }));
};

export type MarketPolicyFilter = { market: string; assetType: string; search: string };

export function filterMarketPolicyRowsV3(
  rows: readonly MarketPolicyRouteRowV3[],
  filter: MarketPolicyFilter,
) {
  const search = filter.search.trim().toLocaleLowerCase();
  return rows.filter(
    (row) =>
      (filter.market === 'all' || row.key.market === filter.market) &&
      (filter.assetType === 'all' || row.key.assetType === filter.assetType) &&
      (!search || row.label.toLocaleLowerCase().includes(search)),
  );
}

/** 周期和复权仍为独立路由，仅以能力身份组织可展开的显示行。 */
export function marketPolicyDisplayGroupsV3(rows: readonly MarketPolicyRouteRowV3[]) {
  return Object.entries(
    groupBy(rows, (row) => {
      if (row.key.kind === 'data') return row.id;
      return `${row.key.market}:${row.key.assetType}:${row.key.capability}`;
    }),
  ).map(([id, items]) => ({ id, rows: items }));
}
