import { roundMoney } from '@thesis-ledger/shared';

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

export interface CashFlow {
  date: string;
  amount: number;
}
export interface ValuationPoint {
  date: string;
  value: number;
  externalFlow?: number;
}

export const ttwror = (points: readonly ValuationPoint[]): number => {
  if (points.length < 2) return 0;
  let factor = 1;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    if (previous.value === 0) continue;
    factor *= (current.value - (current.externalFlow ?? 0)) / previous.value;
  }
  return factor - 1;
};

export const xirr = (flows: readonly CashFlow[], guess = 0.1): number => {
  if (
    flows.length < 2 ||
    !flows.some((flow) => flow.amount < 0) ||
    !flows.some((flow) => flow.amount > 0)
  ) {
    throw new Error('资金加权收益率至少需要一笔流入和一笔流出');
  }
  const start = new Date(flows[0]!.date).getTime();
  let rate = guess;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    let value = 0;
    let derivative = 0;
    for (const flow of flows) {
      const years = (new Date(flow.date).getTime() - start) / 31_557_600_000;
      value += flow.amount / (1 + rate) ** years;
      derivative -= (years * flow.amount) / (1 + rate) ** (years + 1);
    }
    const next = rate - value / derivative;
    if (Math.abs(next - rate) < 1e-8) return next;
    rate = next;
  }
  throw new Error('资金加权收益率未收敛');
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
  direction: 'increase' | 'decrease' | 'balanced';
}

export const rebalanceGap = (
  current: readonly { category: string; marketValue: number }[],
  targets: Readonly<Record<string, number>>,
): RebalanceGap[] => {
  const targetTotal = Object.values(targets).reduce((sum, value) => sum + value, 0);
  if (Math.abs(targetTotal - 1) > 1e-8) throw new Error('目标权重之和必须为 100%');
  const totalValue = current.reduce((sum, item) => sum + item.marketValue, 0);
  const currentValues = current.reduce<Record<string, number>>((result, item) => {
    result[item.category] = (result[item.category] ?? 0) + item.marketValue;
    return result;
  }, {});
  return Object.entries(targets).map(([category, targetWeight]) => {
    const currentWeight = totalValue === 0 ? 0 : (currentValues[category] ?? 0) / totalValue;
    const weightGap = targetWeight - currentWeight;
    return {
      category,
      currentWeight,
      targetWeight,
      weightGap,
      amountGap: roundMoney(weightGap * totalValue),
      direction: Math.abs(weightGap) < 1e-8 ? 'balanced' : weightGap > 0 ? 'increase' : 'decrease',
    };
  });
};
