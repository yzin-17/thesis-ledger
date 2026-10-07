import type { ArtifactRow } from './backtest-artifact-store.js';
import { canonicalizeManifest } from './backtest-snapshot.js';

type Range = { startDate: string; endDate: string };
const inRange = (date: string, range: Range) => date >= range.startDate && date <= range.endDate;

const factDate = (row: ArtifactRow): string => {
  if (typeof row.occurredAt !== 'string' || !Number.isFinite(Date.parse(row.occurredAt))) {
    throw new Error('Snapshot V3 comparable fact has no valid occurredAt');
  }
  return row.occurredAt.slice(0, 10);
};

const calendarProjection = (row: ArtifactRow, range: Range): ArtifactRow => {
  const result = { ...row };
  delete result.range;
  for (const field of ['holidays', 'sessionOverrides']) {
    const encoded = row[field];
    if (typeof encoded !== 'string') throw new Error(`Snapshot V3 Calendar 缺少 ${field}`);
    const values: unknown = JSON.parse(encoded);
    if (!Array.isArray(values)) throw new Error(`Snapshot V3 Calendar ${field} 无效`);
    result[field] = canonicalizeManifest(
      values.filter((value: unknown) => {
        if (typeof value === 'string') return inRange(value, range);
        if (
          value &&
          typeof value === 'object' &&
          'date' in value &&
          typeof value.date === 'string'
        ) {
          return inRange(value.date, range);
        }
        throw new Error(`Snapshot V3 Calendar ${field} 日期无效`);
      }),
    );
  }
  return result;
};

/** Common-range inputs include effective context, while excluding prewarm-only prices. */
export const comparableSnapshotRowsV3 = (
  key: string,
  storedRows: readonly ArtifactRow[],
  range: Range,
): ArtifactRow[] => {
  const facts = storedRows.filter((row) => row.kind !== 'empty-dataset');
  let rows: readonly ArtifactRow[];
  if (key.startsWith('calendar/')) {
    rows = facts.map((row) => calendarProjection(row, range));
  } else if (key.startsWith('instrumentFacts/')) {
    const ordered = [...facts].sort((left, right) =>
      String(left.occurredAt).localeCompare(String(right.occurredAt)),
    );
    const preceding = ordered.filter((row) => factDate(row) < range.startDate).at(-1);
    rows = [
      ...(preceding ? [preceding] : []),
      ...ordered.filter((row) => inRange(factDate(row), range)),
    ];
  } else {
    rows = facts.filter((row) => {
      const date = typeof row.effectiveDate === 'string' ? row.effectiveDate : factDate(row);
      return inRange(date, range);
    });
  }
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).filter(([field]) => field !== 'inputFingerprint')),
  );
};
