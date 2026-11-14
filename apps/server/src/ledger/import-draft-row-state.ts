import { importDraftConflict as conflict } from './baseline-import-support.js';
import type { ImportDraftRow } from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';
import { isEqual } from 'es-toolkit';

export const ORPHAN_SELL = 'ORPHAN_SELL';

export const withoutComputedIssues = (rows: ImportDraftRow[]) =>
  rows.map((row) => ({ ...row, issues: row.issues.filter((issue) => issue !== ORPHAN_SELL) }));

export const normalizeScope = (value?: string | null): 'FULL' | 'PARTIAL' =>
  value === 'PARTIAL' ? 'PARTIAL' : 'FULL';

export const isGeneratedBaselineRow = (row: ImportDraftRow) =>
  row.kind === 'POSITION_BASELINE' && row.rowId.startsWith('baseline-zero:');

export const readDraftRows = (value: Prisma.JsonValue | null | undefined): ImportDraftRow[] =>
  Array.isArray(value) ? (value as unknown as ImportDraftRow[]) : [];

export const readSubmittedRowIds = (value: Prisma.JsonValue | null | undefined): string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value.map(String) : [];

export const readStoredRowIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is { rowId: string; symbol?: string; rawSymbol?: string } =>
    Boolean(
      row &&
      typeof row === 'object' &&
      !Array.isArray(row) &&
      typeof (row as { rowId?: unknown }).rowId === 'string',
    ),
  );
};

export const assignStableRowId = (
  row: { rowId?: string | undefined; symbol?: string | undefined; rawSymbol: string },
  index: number,
  storedRows: Array<{ rowId: string; symbol?: string; rawSymbol?: string }>,
  usedRowIds: Set<string>,
  draftId: string,
) => {
  if (row.rowId) return row.rowId;
  const candidate = storedRows.find(
    (stored) =>
      !usedRowIds.has(stored.rowId) &&
      ((row.symbol !== undefined && stored.symbol === row.symbol) ||
        (row.symbol === undefined && stored.rawSymbol === row.rawSymbol)),
  );
  if (candidate) return candidate.rowId;
  return `screenshot:${draftId}:${String(index).padStart(6, '0')}`;
};

export const mergeDraftRows = (
  existingRows: ImportDraftRow[],
  incomingRows: ImportDraftRow[],
  frozenRowIds: Set<string>,
) => {
  const incomingById = new Map(incomingRows.map((row) => [row.rowId, row]));
  const existingIds = new Set(existingRows.map((row) => row.rowId));
  const mergedRows = existingRows.map((row) => {
    const incoming = incomingById.get(row.rowId);
    if (frozenRowIds.has(row.rowId)) {
      if (incoming && !isEqual(incoming, row))
        throw conflict('IMPORT_DRAFT_FROZEN', '已提交 Revision 的行不能修改');
      return row;
    }
    return incoming ?? row;
  });
  for (const row of incomingRows) {
    if (!existingIds.has(row.rowId)) mergedRows.push(row);
  }
  return mergedRows;
};
