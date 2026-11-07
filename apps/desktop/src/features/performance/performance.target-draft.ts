import {
  allocationWeightFromPercent,
  allocationWeightToPercent,
  normalizeAllocationCategory,
  normalizeAllocationTargets,
} from '@thesis-ledger/domain';

import type { AllocationCategory } from './performance.types.js';

export const CATEGORY_ORDER: AllocationCategory[] = ['stock', 'etf', 'fund', 'index', 'cash'];
export const CATEGORY_LABELS: Record<AllocationCategory, string> = {
  stock: '股票',
  etf: 'ETF',
  fund: '基金',
  index: '指数',
  cash: '现金',
};

export type TargetRow = { id: string; category: string; percent: string | null };

export function validateTargetDraft(draftRows: TargetRow[]) {
  const categories = draftRows.map((row) => normalizeAllocationCategory(row.category));
  const duplicate = categories.some(
    (category, index) => category !== null && categories.indexOf(category) !== index,
  );
  const unknown = categories.some((category) => category === null);
  const weights = draftRows.map((row) =>
    row.percent === null ? null : allocationWeightFromPercent(row.percent),
  );
  const invalidValue = weights.some(
    (weight, index) =>
      draftRows[index]!.percent !== null && (weight === null || weight < 0 || weight > 1),
  );
  const invalidNumber = invalidValue || draftRows.some((row) => row.percent === null);
  const totalWeight = weights.reduce<number>((sum, weight) => sum + (weight ?? 0), 0);
  const total = totalWeight * 100;
  const totalValid = Math.abs(totalWeight - 1) <= 1e-8;
  return {
    duplicate,
    unknown,
    invalidNumber,
    invalidValue,
    total,
    totalValid,
    valid: draftRows.length > 0 && !duplicate && !unknown && !invalidNumber && totalValid,
  };
}

export const rowsFromTargets = (targets: Record<string, number> | undefined): TargetRow[] => {
  const known = normalizeAllocationTargets(targets).targets;
  const unknown: TargetRow[] = [];
  for (const [index, [rawCategory, value]] of Object.entries(targets ?? {}).entries()) {
    const category = normalizeAllocationCategory(rawCategory);
    if (!category) {
      unknown.push({
        id: `${rawCategory}-${index}`,
        category: rawCategory,
        percent: allocationWeightToPercent(value),
      });
      continue;
    }
  }
  return [
    ...CATEGORY_ORDER.filter((category) => category in known).map((category) => ({
      id: category,
      category,
      percent: allocationWeightToPercent(known[category] ?? 0),
    })),
    ...unknown,
  ];
};
