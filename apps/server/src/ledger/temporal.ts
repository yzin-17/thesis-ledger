import { isDateOnly } from '@thesis-ledger/schemas';

export type TimePrecision = 'INSTANT' | 'DATE' | 'UNKNOWN';

export { isDateOnly };

export function inferTimePrecision(value: string): TimePrecision;
export function inferTimePrecision(value?: string): TimePrecision | undefined;
export function inferTimePrecision(value?: string): TimePrecision | undefined {
  if (!value) return undefined;
  return isDateOnly(value) ? 'DATE' : 'INSTANT';
}

export const formatStoredTime = (value: Date | null | undefined, precision?: string | null) => {
  if (!value) return undefined;
  if (precision === 'DATE') return value.toISOString().slice(0, 10);
  return value.toISOString();
};
