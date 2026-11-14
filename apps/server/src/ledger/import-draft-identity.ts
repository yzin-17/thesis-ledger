import { importDraftConflict as conflict } from './baseline-import-support.js';
import { ORPHAN_SELL, readDraftRows } from './import-draft-row-state.js';
import { createHash } from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { inferTimePrecision } from './temporal.js';

const stableJson = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (typeof value === 'symbol') return JSON.stringify(value.description ?? null);
  if (typeof value === 'function') return JSON.stringify(value.name || null);
  return 'null';
};

const normalizeStoredDate = (value: string | Date | null | undefined) => {
  if (value === null || value === undefined) return null;
  const raw = value instanceof Date ? value.toISOString() : value;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? raw : parsed.toISOString();
};

const normalizeObservedAt = (
  value: string | Date | null | undefined,
  timePrecision: string | null | undefined,
) => {
  const normalized = normalizeStoredDate(value);
  if (normalized === null) return null;
  return timePrecision === 'DATE' ? normalized.slice(0, 10) : normalized;
};

const fingerprintRowId = (row: unknown) => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return '';
  const rowId = (row as { rowId?: unknown }).rowId;
  return typeof rowId === 'string' ? rowId : '';
};

const normalizeFingerprintRows = (rows: readonly unknown[]) =>
  rows
    .map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
      const normalized = { ...(row as Record<string, unknown>) };
      if (Array.isArray(normalized.issues))
        normalized.issues = normalized.issues.filter((issue) => issue !== ORPHAN_SELL);
      return normalized;
    })
    .sort((left, right) => fingerprintRowId(left).localeCompare(fingerprintRowId(right)));

export type ImportDraftContentFingerprintInput = {
  accountId: string;
  sourceChannel: string;
  scope: string;
  contentHash: string;
  parserVersion: string;
  rawEvidenceRef: string;
  observedAt?: string | Date | null | undefined;
  capturedAt?: string | Date | null | undefined;
  timePrecision?: string | null | undefined;
  sourceTimezone?: string | null | undefined;
  rows: readonly unknown[];
};

export const createImportDraftContentFingerprint = (input: ImportDraftContentFingerprintInput) => {
  const observedAt = normalizeObservedAt(input.observedAt, input.timePrecision);
  const timePrecision =
    input.timePrecision ?? (observedAt === null ? undefined : inferTimePrecision(observedAt));
  return createHash('sha256')
    .update(
      stableJson({
        accountId: input.accountId,
        sourceChannel: input.sourceChannel,
        scope: input.scope,
        contentHash: input.contentHash,
        parserVersion: input.parserVersion,
        rawEvidenceRef: input.rawEvidenceRef,
        observedAt,
        capturedAt: normalizeStoredDate(input.capturedAt),
        timePrecision: timePrecision ?? null,
        sourceTimezone: input.sourceTimezone ?? null,
        rows: normalizeFingerprintRows(input.rows),
      }),
    )
    .digest('hex');
};

type ExistingImportDraft = {
  id: string;
  accountId: string;
  source: string;
  scope: string;
  imageHash: string;
  contentFingerprint?: string | null;
  revisions?: Array<{
    parserVersion: string;
    rawEvidenceRef: string;
    contentHash: string;
    scope: string;
    observedAt: Date | null;
    capturedAt: Date | null;
    timePrecision: string | null;
    sourceTimezone: string | null;
    rows: Prisma.JsonValue;
  }>;
};

const storedImportDraftFingerprint = (draft: ExistingImportDraft) => {
  if (draft.contentFingerprint) return draft.contentFingerprint;
  const revision = draft.revisions?.[0];
  if (!revision) return undefined;
  return createImportDraftContentFingerprint({
    accountId: draft.accountId,
    sourceChannel: draft.source,
    scope: revision.scope || draft.scope,
    contentHash: revision.contentHash || draft.imageHash,
    parserVersion: revision.parserVersion,
    rawEvidenceRef: revision.rawEvidenceRef,
    observedAt: revision.observedAt,
    capturedAt: revision.capturedAt,
    timePrecision: revision.timePrecision,
    sourceTimezone: revision.sourceTimezone,
    rows: readDraftRows(revision.rows),
  });
};

export const resolveExistingImportDraft = (
  draft: ExistingImportDraft,
  contentFingerprint: string,
) => {
  if (storedImportDraftFingerprint(draft) !== contentFingerprint)
    throw conflict('LEDGER_IDEMPOTENCY_CONFLICT', '相同 Draft 幂等键的内容不同');
  return { draftId: draft.id, revision: 1, idempotentReplay: true };
};
