import { roundMoney } from '@thesis-ledger/shared';
export { ttwror, type ValuationPoint } from './performance-time-weighted.js';
export { xirr, type CashFlow } from './performance-money-weighted.js';

export const allocationCategories = ['stock', 'etf', 'fund', 'index', 'cash'] as const;
export type AllocationCategory = (typeof allocationCategories)[number];

const allocationCategoryAliases: Readonly<Record<string, AllocationCategory>> = {
  stock: 'stock',
  股票: 'stock',
  etf: 'etf',
  ETF: 'etf',
  fund: 'fund',
  基金: 'fund',
  FUND: 'fund',
  index: 'index',
  指数: 'index',
  INDEX: 'index',
  cash: 'cash',
  现金: 'cash',
  CASH: 'cash',
};

export const normalizeAllocationCategory = (value: string): AllocationCategory | null => {
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  return (
    allocationCategoryAliases[normalized] ??
    allocationCategoryAliases[normalized.toLowerCase()] ??
    null
  );
};

export interface NormalizedAllocationTargets {
  targets: Record<string, number>;
  unknown: string[];
}

export const normalizeAllocationTargets = (
  targets: Readonly<Record<string, number>> | undefined,
): NormalizedAllocationTargets => {
  if (!targets) return { targets: {}, unknown: [] };
  const normalized: Partial<Record<AllocationCategory, number>> = {};
  const unknown: string[] = [];
  for (const [rawCategory, value] of Object.entries(targets)) {
    const category = normalizeAllocationCategory(rawCategory);
    if (!category) {
      unknown.push(rawCategory);
      continue;
    }
    normalized[category] = (normalized[category] ?? 0) + value;
  }
  const entries: Array<[string, number]> = allocationCategories
    .filter((category) => normalized[category] !== undefined)
    .map((category) => [category, normalized[category]!]);
  return {
    targets: Object.fromEntries(entries),
    unknown,
  };
};

export const allocation = (positions: readonly { category: string; marketValue: number }[]) => {
  const total = positions.reduce((sum, item) => sum + item.marketValue, 0);
  return Object.entries(
    positions.reduce<Record<string, number>>((result, item) => {
      result[item.category] = (result[item.category] ?? 0) + item.marketValue;
      return result;
    }, {}),
  ).map(([category, value]) => ({ category, value, weight: total === 0 ? 0 : value / total }));
};

export interface RebalanceGap {
  category: string;
  currentWeight: number;
  targetWeight: number;
  weightGap: number;
  amountGap: number;
  roundingAdjustment?: number;
  direction: 'increase' | 'decrease' | 'balanced';
}

export const rebalanceGap = (
  current: readonly { category: string; marketValue: number }[],
  targets: Readonly<Record<string, number>>,
): RebalanceGap[] => {
  const normalized = normalizeAllocationTargets(targets);
  if (normalized.unknown.length > 0) throw new Error('无法识别配置类别');
  if (Object.values(normalized.targets).some((value) => !Number.isFinite(value) || value < 0))
    throw new Error('目标权重必须是非负有限数字');
  const targetTotal = Object.values(normalized.targets).reduce((sum, value) => sum + value, 0);
  if (Math.abs(targetTotal - 1) > 1e-8) throw new Error('目标权重之和必须为 100%');
  if (current.some((item) => !Number.isFinite(item.marketValue) || item.marketValue < 0))
    throw new Error('资产市值必须是非负有限数字');
  const totalValue = current.reduce((sum, item) => sum + item.marketValue, 0);
  if (!Number.isFinite(totalValue) || totalValue <= 0) throw new Error('配置市值分母不为正数');
  const currentValues = current.reduce<Record<string, number>>((result, item) => {
    const category = normalizeAllocationCategory(item.category);
    if (!category) throw new Error('无法识别配置类别');
    result[category] = (result[category] ?? 0) + item.marketValue;
    return result;
  }, {});
  const categories = allocationCategories.filter((category) => category in currentValues || category in normalized.targets);
  const rows: RebalanceGap[] = categories.map((category) => {
    const targetWeight = (normalized.targets[category] ?? 0) / targetTotal;
    const currentWeight = totalValue === 0 ? 0 : (currentValues[category] ?? 0) / totalValue;
    const weightGap = targetWeight - currentWeight;
    return {
      category,
      currentWeight,
      targetWeight,
      weightGap,
      amountGap: roundMoney(weightGap * totalValue),
      direction: 'balanced',
    };
  });
  if (rows.some((row) => !Number.isFinite(row.amountGap))) throw new Error('再平衡金额超出有限数值范围');
  const remainder = roundMoney(-rows.reduce((total, row) => total + row.amountGap, 0));
  const largest = [...rows].sort((left, right) => Math.abs(right.amountGap) - Math.abs(left.amountGap))[0];
  if (remainder !== 0 && largest) {
    largest.amountGap = roundMoney(largest.amountGap + remainder);
    largest.roundingAdjustment = remainder;
  }
  for (const row of rows) {
    if (row.amountGap > 0) row.direction = 'increase';
    else if (row.amountGap < 0) row.direction = 'decrease';
  }
  return rows;
};
