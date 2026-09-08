import { normalizeAllocationCategory } from '@thesis-ledger/domain';

export type TargetRow = { id: string; category: string; percent: number | null };

export function validateTargetDraft(draftRows: TargetRow[]) {
  const categories = draftRows.map((row) => normalizeAllocationCategory(row.category));
  const duplicate = categories.some(
    (category, index) => category !== null && categories.indexOf(category) !== index,
  );
  const unknown = categories.some((category) => category === null);
  const invalidNumber = draftRows.some(
    (row) => row.percent === null || !Number.isFinite(row.percent) || row.percent < 0,
  );
  const total = draftRows.reduce(
    (sum, row) => sum + (row.percent !== null && Number.isFinite(row.percent) ? row.percent : 0),
    0,
  );
  const totalValid = Math.abs(total - 100) < 0.001;
  return {
    duplicate,
    unknown,
    invalidNumber,
    total,
    totalValid,
    valid: draftRows.length > 0 && !duplicate && !unknown && !invalidNumber && totalValid,
  };
}
