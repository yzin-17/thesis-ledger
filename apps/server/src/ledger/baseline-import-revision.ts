import type { ImportDraft, ImportDraftRevision } from '@prisma/client';
import type { ImportDraftRow } from '@thesis-ledger/schemas';
import { importDraftConflict as conflict } from './baseline-import-support.js';
import {
  withoutComputedIssues,
  readDraftRows,
  readSubmittedRowIds,
  mergeDraftRows,
} from './import-draft-row-state.js';

import { NotFoundException } from '@nestjs/common';

import type { ReviseImportDraftCommand } from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';

import { formatStoredTime, inferTimePrecision } from './temporal.js';

export async function reviseImportDraftWithTransaction(
  transaction: Prisma.TransactionClient,
  command: ReviseImportDraftCommand,
) {
  const rows = withoutComputedIssues(command.rows);
  const draft = await transaction.importDraft.findUnique({ where: { id: command.draftId } });
  if (!draft) throw new NotFoundException('导入草稿不存在');
  if (draft.status === 'committed' || draft.status === 'cancelled')
    throw conflict('IMPORT_DRAFT_FROZEN', '已提交或已回滚的导入草稿不可修改');
  const currentRevision = await transaction.importDraftRevision.findUnique({
    where: { draftId_revision: { draftId: draft.id, revision: draft.currentRevision } },
    select: {
      submittedAt: true,
      submittedRowIds: true,
      rows: true,
      observedAt: true,
      capturedAt: true,
      timePrecision: true,
      sourceTimezone: true,
    },
  });
  if (draft.currentRevision !== command.expectedRevision)
    throw conflict('IMPORT_DRAFT_REVISION_CONFLICT', '草稿已变更，请刷新后重试');
  const currentSubmittedRowIds = readSubmittedRowIds(currentRevision?.submittedRowIds);
  const priorSubmittedRowIds =
    draft.currentRevision > 1
      ? (
          await transaction.importDraftRevision.findMany({
            where: {
              draftId: draft.id,
              revision: { lte: draft.currentRevision },
              submittedAt: { not: null },
            },
            select: { submittedRowIds: true },
          })
        ).flatMap((revision) => readSubmittedRowIds(revision.submittedRowIds))
      : [];
  const frozenRowIds = new Set([...priorSubmittedRowIds, ...currentSubmittedRowIds]);
  const { mergedRows, nextRevisionRows } = nextDraftRevisionRows(
    draft,
    currentRevision,
    rows,
    frozenRowIds,
    currentSubmittedRowIds,
  );
  const nextRevision = draft.currentRevision + 1;
  const scope = command.scope ?? draft.scope ?? 'FULL';
  const { observedAt, capturedAt, effectiveTimePrecision, sourceTimezone } = draftRevisionTimes(
    currentRevision,
    command,
  );
  await transaction.importDraftRevision.create({
    data: {
      draftId: draft.id,
      revision: nextRevision,
      parserVersion: command.parserVersion,
      rawEvidenceRef: command.rawEvidenceRef,
      contentHash: command.contentHash,
      scope,
      ...(observedAt === undefined ? {} : { observedAt: new Date(observedAt) }),
      ...(capturedAt === undefined ? {} : { capturedAt: new Date(capturedAt) }),
      ...(effectiveTimePrecision === undefined ? {} : { timePrecision: effectiveTimePrecision }),
      ...(sourceTimezone === undefined ? {} : { sourceTimezone }),
      rows: nextRevisionRows as Prisma.InputJsonValue,
      issues: nextRevisionRows.flatMap((row) => row.issues),
    },
  });
  await transaction.importDraft.update({
    where: { id: draft.id },
    data: {
      currentRevision: nextRevision,
      rows: mergedRows as Prisma.InputJsonValue,
      status: 'pending',
      scope,
      ...(command.sourceChannel === undefined
        ? {}
        : {
            source: command.sourceChannel,
            sourceConfidence: command.sourceChannel === 'unknown' ? 0 : 1,
          }),
    },
  });
  return {
    draftId: draft.id,
    revision: nextRevision,
    rowIds: nextRevisionRows.map((row) => row.rowId),
  };
}

type CurrentRevision = Pick<
  ImportDraftRevision,
  | 'submittedAt'
  | 'submittedRowIds'
  | 'rows'
  | 'observedAt'
  | 'capturedAt'
  | 'timePrecision'
  | 'sourceTimezone'
> | null;

function nextDraftRevisionRows(
  draft: Pick<ImportDraft, 'status' | 'rows'>,
  currentRevision: CurrentRevision,
  rows: ImportDraftRow[],
  frozenRowIds: Set<string>,
  currentSubmittedRowIds: string[],
) {
  const hasSubmittedRevision = Boolean(currentRevision?.submittedAt);
  if (hasSubmittedRevision && draft.status !== 'partial')
    throw conflict('IMPORT_DRAFT_FROZEN', '已提交 Revision 不可修改');
  if (hasSubmittedRevision && currentSubmittedRowIds.length === 0)
    throw conflict('IMPORT_DRAFT_FROZEN', '已提交 Revision 缺少冻结行记录');
  const existingRows =
    readDraftRows(draft.rows).length > 0
      ? readDraftRows(draft.rows)
      : readDraftRows(currentRevision?.rows);
  const hasFrozenRows = frozenRowIds.size > 0;
  const mergedRows = hasFrozenRows ? mergeDraftRows(existingRows, rows, frozenRowIds) : rows;
  const nextRevisionRows = hasFrozenRows
    ? mergedRows.filter((row) => !frozenRowIds.has(row.rowId))
    : rows;
  if (nextRevisionRows.length === 0)
    throw conflict('IMPORT_DRAFT_NO_UNSUBMITTED_ROWS', '没有可继续处理的未提交行');

  return { mergedRows, nextRevisionRows };
}

function draftRevisionTimes(currentRevision: CurrentRevision, command: ReviseImportDraftCommand) {
  const currentPrecision =
    currentRevision?.timePrecision === 'DATE' || currentRevision?.timePrecision === 'INSTANT'
      ? currentRevision.timePrecision
      : undefined;
  const observedAt =
    command.observedAt ?? formatStoredTime(currentRevision?.observedAt, currentPrecision);
  const effectiveTimePrecision =
    command.timePrecision ??
    (command.observedAt ? inferTimePrecision(command.observedAt) : currentPrecision);
  const capturedAt = command.capturedAt ?? currentRevision?.capturedAt?.toISOString();
  const sourceTimezone = command.sourceTimezone ?? currentRevision?.sourceTimezone ?? undefined;

  return { observedAt, capturedAt, effectiveTimePrecision, sourceTimezone };
}
