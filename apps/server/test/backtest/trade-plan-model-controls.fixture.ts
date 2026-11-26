import type { BacktestStrategy } from '@thesis-ledger/schemas';

/** 允许空壳元数据，所有实际控制项须来自该自然语言样本的明确范围。 */
export function planContainsOnlyControls(
  plan: BacktestStrategy['tradePlan'],
  allowed: readonly string[],
): boolean {
  if (!plan) return true;
  return Object.entries(plan).every(([key, value]) => {
    if (key === 'version' || key === 'evaluation' || value === undefined) return true;
    if (key === 'stages' && Array.isArray(value) && value.length === 0) return true;
    return allowed.includes(key);
  });
}
