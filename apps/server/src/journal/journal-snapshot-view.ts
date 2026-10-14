import type { JournalReviewSnapshot } from '@prisma/client';
import { uniq } from 'es-toolkit';
import {
  journalReviewSnapshotContractSchema,
  journalStoredSnapshotViewSchema,
  type JournalReviewEvidenceInput,
} from '@thesis-ledger/schemas';
import { JOURNAL_ANALYSIS_VERSION } from '@thesis-ledger/domain';
import {
  journalReviewEvidenceFingerprint,
  journalReviewEvidenceReferences,
} from './journal-review-evidence.js';

const sameIds = (saved: unknown, ids: readonly string[]) =>
  Array.isArray(saved) &&
  saved.every((id) => typeof id === 'string') &&
  JSON.stringify(uniq(saved).sort()) === JSON.stringify(uniq(ids).sort());

function metadataMatches(row: JournalReviewSnapshot, input: JournalReviewEvidenceInput) {
  const reference = input.reference;
  const projection = input.projection;
  const sources = journalReviewEvidenceReferences(input);
  return (
    row.accountId === input.trade.accountId &&
    row.mode === input.trade.accountMode &&
    row.reviewObjectType === reference.reviewObjectType &&
    row.tradeId === reference.tradeId &&
    row.closeSliceId ===
      (reference.reviewObjectType === 'CLOSE_SLICE' ? reference.closeSliceId : null) &&
    row.ledgerRevision.toString() === projection.ledgerRevision &&
    row.projectionGeneration.toString() === projection.projectionGeneration &&
    row.projectionFingerprint === projection.projectionFingerprint &&
    row.fxEvidenceVersion === projection.fxEvidenceVersion &&
    row.conversionFingerprint === projection.conversionFingerprint &&
    sameIds(row.factIds, sources.factIds) &&
    sameIds(projection.factIds, sources.factIds) &&
    sameIds(row.eventIds, sources.eventIds) &&
    sameIds(projection.eventIds, sources.eventIds) &&
    projection.evidenceFingerprint === journalReviewEvidenceFingerprint(input)
  );
}

export function journalSnapshotView(
  row: JournalReviewSnapshot,
  currentFingerprints: ReadonlyMap<string, string>,
) {
  const parsed = journalReviewSnapshotContractSchema.safeParse({
    id: row.id,
    inputSnapshot: row.inputSnapshot,
    outputSnapshot: row.outputSnapshot,
    status: 'STALE',
    createdAt: row.createdAt.toISOString(),
  });
  const reasons: string[] = [];
  if (!parsed.success) reasons.push('SNAPSHOT_CONTRACT_UNSUPPORTED');
  else {
    if (!metadataMatches(row, parsed.data.inputSnapshot))
      reasons.push('SNAPSHOT_EVIDENCE_MISMATCH');
    if (parsed.data.outputSnapshot.algorithmVersion !== JOURNAL_ANALYSIS_VERSION)
      reasons.push('SNAPSHOT_ALGORITHM_UNSUPPORTED');
  }
  if (parsed.success && reasons.length === 0) {
    const original = parsed.data.inputSnapshot;
    const current = currentFingerprints.get(original.reference.reviewObjectId);
    return journalStoredSnapshotViewSchema.parse({
      compatibility: 'CURRENT_CONTRACT',
      accountId: row.accountId,
      mode: row.mode,
      snapshot: {
        ...parsed.data,
        status: current === original.projection.evidenceFingerprint ? 'CURRENT' : 'STALE',
      },
    });
  }
  return journalStoredSnapshotViewSchema.parse({
    compatibility: 'LEGACY_UNSUPPORTED',
    id: row.id,
    accountId: row.accountId,
    mode: row.mode,
    reviewObjectType: row.reviewObjectType,
    tradeId: row.tradeId,
    closeSliceId: row.closeSliceId,
    status: 'LEGACY_REVIEW_NEEDS_CONFIRMATION',
    reasons,
    inputSnapshot: row.inputSnapshot,
    outputSnapshot: row.outputSnapshot,
    createdAt: row.createdAt.toISOString(),
    savedMetadata: {
      ledgerRevision: row.ledgerRevision.toString(),
      projectionGeneration: row.projectionGeneration.toString(),
      projectionFingerprint: row.projectionFingerprint,
      factIds: row.factIds,
      eventIds: row.eventIds,
      fxEvidenceVersion: row.fxEvidenceVersion,
      conversionFingerprint: row.conversionFingerprint,
      status: row.status,
    },
  });
}
