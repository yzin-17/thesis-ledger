import type { BacktestSnapshotManifestV3 } from '@thesis-ledger/schemas';
import type { ArtifactRow, ArtifactStore } from './backtest-artifact-store.js';
import { comparableTradabilityWindows } from './backtest-comparable-tradability.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';

export interface ComparableDataFingerprintRange {
  start: string;
  end: string;
}

const comparableDateFields = ['date', 'tradingDate', 'occurredAt', 'effectiveDate'] as const;
const comparableTimestampFields = new Set(['occurredAt', 'availableAt']);
const comparableNumberFields = new Set(['amount']);
const COMPARABLE_AMOUNT_DECIMAL_PLACES = 6;

const datePart = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match?.[1];
};

const rowDates = (row: ArtifactRow): string[] =>
  comparableDateFields.flatMap((field) => {
    const value = datePart(row[field]);
    return value ? [value] : [];
  });

const inRange = (date: string, range: ComparableDataFingerprintRange) =>
  date >= range.start && date <= range.end;

const parseJsonValue = (value: ArtifactRow['sessions']): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const stringifyJsonValue = (value: unknown): ArtifactRow['sessions'] =>
  typeof value === 'string' ? value : JSON.stringify(value);

type NormalizeTradabilityWindows = typeof comparableTradabilityWindows;

const normalizeComparableField = (
  key: string,
  value: ArtifactRow['sessions'],
  range: ComparableDataFingerprintRange,
  normalizeWindows: NormalizeTradabilityWindows,
): ArtifactRow['sessions'] => {
  if (key === 'historicalTradabilityWindows' && typeof value === 'string')
    return normalizeWindows(value, range);
  if (comparableTimestampFields.has(key) && typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  if (comparableNumberFields.has(key) && (typeof value === 'string' || typeof value === 'number')) {
    const number = Number(value);
    if (Number.isFinite(number))
      return Number(number.toFixed(COMPARABLE_AMOUNT_DECIMAL_PLACES)).toString();
  }
  const parsed = parseJsonValue(value);
  if (key === 'range' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return JSON.stringify({ start: range.start, end: range.end });
  }
  if (key === 'holidays' && Array.isArray(parsed)) {
    return stringifyJsonValue(
      parsed.filter((item) => {
        const date = datePart(item);
        return !date || inRange(date, range);
      }),
    );
  }
  if (key === 'sessionOverrides' && Array.isArray(parsed)) {
    return stringifyJsonValue(
      parsed.filter((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
        const date = datePart((item as Record<string, unknown>).date);
        return !date || inRange(date, range);
      }),
    );
  }
  return value;
};

const comparableRow = (
  row: ArtifactRow,
  range: ComparableDataFingerprintRange,
  artifactKey: string,
  normalizeWindows: NormalizeTradabilityWindows,
): ArtifactRow =>
  Object.fromEntries(
    Object.entries(row)
      .filter(
        ([key]) =>
          key !== 'inputFingerprint' &&
          !(artifactKey.startsWith('calendar/') && key === 'availableAt'),
      )
      .map(([key, value]) => [key, normalizeComparableField(key, value, range, normalizeWindows)]),
  );

const comparableRows = (
  rows: readonly ArtifactRow[],
  range: ComparableDataFingerprintRange,
  artifactKey: string,
  normalizeWindows: NormalizeTradabilityWindows,
): ArtifactRow[] =>
  rows
    .filter((row) => {
      const dates = rowDates(row);
      return dates.length === 0 || dates.some((date) => inRange(date, range));
    })
    .map((row) => comparableRow(row, range, artifactKey, normalizeWindows))
    .sort((left, right) => canonicalizeManifest(left).localeCompare(canonicalizeManifest(right)));

export async function fingerprintBacktestRunData(
  runId: string,
  range: ComparableDataFingerprintRange,
  snapshot: Pick<BacktestSnapshotManifestV3, 'artifacts' | 'executionPriceProtocol' | 'frozenExecutionWindow' | 'actualSources'>,
  store: Pick<ArtifactStore, 'openRead'>,
  normalizeWindows: NormalizeTradabilityWindows = comparableTradabilityWindows,
) {
  const artifacts: Array<{ key: string; rows: ArtifactRow[] }> = [];
  for (const artifact of snapshot.artifacts) {
    const key = artifact.key.startsWith(`${runId}/`)
      ? artifact.key.slice(runId.length + 1)
      : artifact.key;
    if (key.startsWith('metadata/')) continue;
    const rows: ArtifactRow[] = [];
    for await (const row of await store.openRead(artifact))
      rows.push(row);
    artifacts.push({ key, rows: comparableRows(rows, range, key, normalizeWindows) });
  }
  artifacts.sort((left, right) => left.key.localeCompare(right.key));
  return hashCanonicalManifest({
    version: 'v3-comparable-data-v1',
    range,
    executionPriceProtocol: snapshot.executionPriceProtocol,
    frozenExecutionWindow: snapshot.frozenExecutionWindow ?? null,
    actualSources: [
      ...new Set(
        snapshot.actualSources.map((source) =>
          canonicalizeManifest({
            symbol: source.symbol,
            routeKey: source.routeKey,
            provenance: source.provenance,
            ...(snapshot.frozenExecutionWindow
              ? {}
              : { inputFingerprint: source.inputFingerprint }),
          }),
        ),
      ),
    ].sort(),
    artifacts,
  });
}
