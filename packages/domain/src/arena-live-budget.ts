import { DecimalValue } from './decimal.js';
import { formatDecimalNumber } from './decimal-number-display.js';

type BudgetDimension = 'requests' | 'tokens' | 'costMicros';
type ArenaBudget = Record<BudgetDimension, number>;
type ArenaLiveBudget = Record<BudgetDimension, number | null>;

export function arenaAdjustLiveBudget(remaining: ArenaLiveBudget, reserved: ArenaBudget, used: ArenaBudget | null, refund: boolean) {
  const next = { ...remaining };
  for (const key of ['requests', 'tokens', 'costMicros'] as const) {
    const value = next[key];
    if (value === null) continue;
    if (!refund && value < reserved[key]) throw new Error('participant_budget');
    next[key] = refund ? Math.max(0, value + reserved[key] - (used?.[key] ?? reserved[key])) : value - reserved[key];
  }
  return next;
}
export function arenaBudgetCountLabel(value: number | null, unit = '') {
  return value === null ? '不限额' : formatDecimalNumber(String(value)) + unit;
}
export function arenaBudgetCostLabel(value: number | null, currency: string) {
  if (value === null) return '不限额';
  return formatDecimalNumber(DecimalValue.from(String(value)).dividedBy('1000000').toString()) + ' ' + currency;
}
