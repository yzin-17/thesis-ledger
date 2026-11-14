import type { ImportDraft, ImportDraftRevision, Account } from '@prisma/client';
import { importDraftConflict as conflict } from './baseline-import-support.js';
import {
  ORPHAN_SELL,
  normalizeScope,
  isGeneratedBaselineRow,
  readDraftRows,
  readSubmittedRowIds,
  mergeDraftRows,
} from './import-draft-row-state.js';

import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';

import type {
  ImportDraftRow,
  LedgerEvent,
  SubmitImportDraftRevisionCommand,
} from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';
import { isEqual } from 'es-toolkit';

import { assertAccountCanHoldAsset } from '../portfolio/accounts.service.js';
import { inferAssetType } from './asset-type.js';

import { rebuildLedgerProjection } from './ledger-projection.js';
import { formatStoredTime, inferTimePrecision, isDateOnly } from './temporal.js';
import {
  type LedgerV2Repository,
  toLedgerEventV2,
  type AccountLedgerMutation,
  type AccountLedgerWriteContext,
} from './ledger-v2.repository.js';
import {
  appendDraftRow,
  completeDraftBaselineRows,
  findOrphanSellRowIds,
  type DraftRowAppendContext,
} from './baseline-import-support.js';

export interface DraftSubmissionResult {
  events: LedgerEvent[];
  replay: boolean;
  blockedRowIds: string[] | null;
  projectionGenerations?: Record<string, string>;
}

export async function submitImportDraftWithContext(
  repository: LedgerV2Repository,
  context: AccountLedgerWriteContext,
  command: SubmitImportDraftRevisionCommand,
): Promise<AccountLedgerMutation<DraftSubmissionResult>> {
  const lockedDraft = await context.transaction.importDraft.findUnique({
    where: { id: command.draftId },
  });
  if (!lockedDraft) throw new NotFoundException('导入草稿不存在');
  const revision = await context.transaction.importDraftRevision.findUnique({
    where: { draftId_revision: { draftId: lockedDraft.id, revision: command.revision } },
  });
  if (!revision) throw new NotFoundException('导入草稿 Revision 不存在');
  if (command.revision !== lockedDraft.currentRevision)
    throw conflict(
      'IMPORT_DRAFT_REVISION_CONFLICT',
      revision.submittedAt
        ? '已提交 Revision 已冻结，请使用当前 Revision'
        : '草稿已变更，请刷新后重试',
    );
  const rows = readDraftRows(revision.rows);
  const aggregateRows = readDraftRows(lockedDraft.rows);
  const persistedBaseRows = aggregateRows.length > 0 ? aggregateRows : rows;
  const priorRevisions =
    revision.revision > 1
      ? await context.transaction.importDraftRevision.findMany({
          where: {
            draftId: lockedDraft.id,
            revision: { lt: revision.revision },
            submittedAt: { not: null },
          },
          select: { submittedRowIds: true },
        })
      : [];
  const priorSubmittedRowIds = priorRevisions.flatMap((item) =>
    readSubmittedRowIds(item.submittedRowIds),
  );
  const priorSubmittedSet = new Set(priorSubmittedRowIds);
  if (command.selectedRowIds.some((rowId) => priorSubmittedSet.has(rowId)))
    throw conflict('IMPORT_DRAFT_FROZEN', '已提交 Revision 的行不能再次提交');
  const selected = rows.filter((row) => command.selectedRowIds.includes(row.rowId));
  if (selected.length !== command.selectedRowIds.length)
    throw conflict('IMPORT_DRAFT_ROW_NOT_FOUND', '选中行不存在');
  if (revision.submittedAt)
    return replaySubmittedDraft(context, command, lockedDraft, revision, rows);
  if (lockedDraft.status === 'committed' || lockedDraft.status === 'cancelled')
    throw conflict('IMPORT_DRAFT_FROZEN', '已提交或已回滚的导入草稿不可再次提交');
  if (context.currentLedgerRevision.toString() !== command.expectedLedgerRevision)
    throw conflict('LEDGER_REVISION_CONFLICT', '账本已变更，请刷新后重试');

  const invalid = await rejectInvalidImportRows(
    context,
    selected,
    rows,
    revision,
    lockedDraft,
    persistedBaseRows,
    priorSubmittedSet,
  );
  if (invalid) return invalid;

  const baselineBatchId = randomUUID();
  const baselineRows = selected.filter((row) => row.kind === 'POSITION_BASELINE');
  const times = importSubmissionTimes(revision, baselineRows);
  const { observedAt, capturedAt, timePrecision } = times;
  assertSubmissionTimes(selected, times);

  const scope = normalizeScope(revision.scope ?? lockedDraft.scope);
  let generatedRows: ImportDraftRow[] = [];
  if (baselineRows.length > 0 && scope === 'FULL')
    generatedRows = (
      await completeDraftBaselineRows(
        context,
        [
          ...persistedBaseRows,
          ...selected.filter(
            (selectedRow) => !persistedBaseRows.some((row) => row.rowId === selectedRow.rowId),
          ),
        ],
        observedAt!,
      )
    ).filter(
      (row) =>
        !persistedBaseRows.some((existingRow) => existingRow.rowId === row.rowId) &&
        !selected.some((selectedRow) => selectedRow.rowId === row.rowId),
    );
  const rowsToAppend = [...selected, ...generatedRows];
  const newGeneratedRows = generatedRows.filter(
    (row) => !persistedBaseRows.some((existingRow) => existingRow.rowId === row.rowId),
  );
  const persistedRows = [...persistedBaseRows, ...newGeneratedRows];
  const submittedRowIds = [...command.selectedRowIds, ...generatedRows.map((row) => row.rowId)];
  const recordedAt = new Date().toISOString();

  const account = await context.transaction.account.findUnique({
    where: { id: lockedDraft.accountId },
  });
  if (!account) throw new NotFoundException('账户不存在');
  await confirmImportAssets(context, rowsToAppend, account);

  if (baselineRows.length > 0) {
    await context.transaction.baselineObservationBatch.create({
      data: {
        id: baselineBatchId,
        accountId: lockedDraft.accountId,
        scope,
        observedAt: new Date(observedAt!),
        timePrecision: timePrecision!,
        capturedAt: new Date(capturedAt!),
        sourceCategory: 'IMPORT',
        sourceChannel: lockedDraft.source,
        externalId: `draft:${lockedDraft.id}:${revision.revision}:baseline`,
        evidenceRef: revision.rawEvidenceRef,
        contentHash: revision.contentHash,
        status: 'SUBMITTED',
        submittedAt: new Date(recordedAt),
      },
    });
  }
  const events = [];
  const appendContext = draftAppendContext(
    context,
    lockedDraft,
    revision,
    command,
    baselineBatchId,
    scope,
    recordedAt,
    times,
  );
  for (const [index, row] of rowsToAppend.entries()) {
    events.push(await appendDraftRow(repository, appendContext, row, index));
  }
  await context.transaction.importDraftRevision.update({
    where: { id: revision.id },
    data: {
      rows: [...rows, ...newGeneratedRows] as Prisma.InputJsonValue,
      submittedAt: new Date(recordedAt),
      submittedRowIds,
    },
  });
  const submittedRowIdSet = new Set([...priorSubmittedRowIds, ...submittedRowIds]);
  await context.transaction.importDraft.update({
    where: { id: lockedDraft.id },
    data: submittedDraftState(persistedRows, submittedRowIdSet, recordedAt),
  });
  await rebuildLedgerProjection(
    context.transaction,
    lockedDraft.accountId,
    'AVG',
    context.nextProjectionGeneration,
  );
  return { value: { events, replay: false, blockedRowIds: null }, advanceRevision: true };
}

type BaselineRow = Extract<ImportDraftRow, { kind: 'POSITION_BASELINE' }>;
function importSubmissionTimes(revision: ImportDraftRevision, baselineRows: BaselineRow[]) {
  const revisionTimePrecision =
    revision.timePrecision === 'DATE' || revision.timePrecision === 'INSTANT'
      ? revision.timePrecision
      : undefined;
  const observedAt =
    formatStoredTime(revision.observedAt, revisionTimePrecision) ?? baselineRows[0]?.observedAt;
  const capturedAt = revision.capturedAt?.toISOString() ?? baselineRows[0]?.capturedAt;
  const sourceTimezone =
    revision.sourceTimezone ?? baselineRows.find((row) => row.sourceTimezone)?.sourceTimezone;
  const timePrecision =
    revisionTimePrecision ?? (observedAt ? inferTimePrecision(observedAt) : undefined);
  if (baselineRows.length > 0 && (!observedAt || !capturedAt || !sourceTimezone))
    throw conflict(
      'IMPORT_DRAFT_TIME_REQUIRED',
      '持仓快照必须提供业务观察时间、采集时间和来源时区',
    );

  return { revisionTimePrecision, observedAt, capturedAt, sourceTimezone, timePrecision } as const;
}

type SubmissionTimes = ReturnType<typeof importSubmissionTimes>;
function assertSubmissionTimes(selected: ImportDraftRow[], times: SubmissionTimes) {
  const { observedAt, sourceTimezone, timePrecision } = times;
  for (const row of selected) {
    if (row.kind === 'UNRESOLVED') continue;
    const rowTime = row.kind === 'EXECUTION' ? row.occurredAt : (row.observedAt ?? observedAt);
    if (!rowTime) throw conflict('IMPORT_DRAFT_TIME_REQUIRED', '导入行缺少业务发生时间');
    const rowPrecision =
      row.timePrecision ??
      (row.kind === 'POSITION_BASELINE' ? timePrecision : undefined) ??
      inferTimePrecision(rowTime);
    if (rowPrecision === 'DATE' && !isDateOnly(rowTime))
      throw conflict('IMPORT_DRAFT_TIME_INVALID', 'DATE 精度必须使用日期值');
    if (rowPrecision === 'INSTANT' && isDateOnly(rowTime))
      throw conflict('IMPORT_DRAFT_TIME_INVALID', 'INSTANT 精度必须使用时间值');
    if (!(row.sourceTimezone ?? sourceTimezone))
      throw conflict('IMPORT_DRAFT_TIME_REQUIRED', '导入行缺少来源时区');
  }
}

async function replaySubmittedDraft(
  context: AccountLedgerWriteContext,
  command: SubmitImportDraftRevisionCommand,
  lockedDraft: ImportDraft,
  revision: ImportDraftRevision,
  rows: ImportDraftRow[],
): Promise<AccountLedgerMutation<DraftSubmissionResult>> {
  const submittedRowIds = readSubmittedRowIds(revision.submittedRowIds);
  const generatedRowIds = rows
    .filter((row) => isGeneratedBaselineRow(row) && !command.selectedRowIds.includes(row.rowId))
    .map((row) => row.rowId);
  const expectedSubmittedRowIds = [...command.selectedRowIds, ...generatedRowIds];
  if (submittedRowIds.length === 0 || !isEqual(submittedRowIds, expectedSubmittedRowIds))
    throw conflict('LEDGER_IDEMPOTENCY_CONFLICT', '已提交 Revision 的选中行不能变更');
  const events = await context.transaction.ledgerEvent.findMany({
    where: {
      accountId: lockedDraft.accountId,
      sourceChannel: lockedDraft.source,
      externalId: { startsWith: `draft:${lockedDraft.id}:${revision.revision}:` },
    },
    orderBy: { economicOrderKey: 'asc' },
  });
  return {
    value: {
      events: events.map(toLedgerEventV2),
      replay: true,
      blockedRowIds: null,
      projectionGenerations: Object.fromEntries(
        events.map((event) => [
          lockedDraft.accountId,
          event.projectionGeneration?.toString() ?? String(event.ledgerRevision ?? 0),
        ]),
      ),
    },
    advanceRevision: false,
  };
}

async function rejectInvalidImportRows(
  context: AccountLedgerWriteContext,
  selected: ImportDraftRow[],
  rows: ImportDraftRow[],
  revision: ImportDraftRevision,
  lockedDraft: ImportDraft,
  persistedBaseRows: ImportDraftRow[],
  priorSubmittedSet: Set<string>,
): Promise<AccountLedgerMutation<DraftSubmissionResult> | null> {
  const staticInvalid = selected.filter((row) => row.issues.some((issue) => issue !== ORPHAN_SELL));
  const orphanSellRowIds = await findOrphanSellRowIds(
    context,
    selected,
    formatStoredTime(revision.observedAt, revision.timePrecision),
  );
  const invalidRowIds = [
    ...new Set([...staticInvalid.map((row) => row.rowId), ...orphanSellRowIds]),
  ];
  if (invalidRowIds.length > 0) {
    const invalidSet = new Set(orphanSellRowIds);
    const reviewedRows = rows.map((row) => ({
      ...row,
      issues: [
        ...row.issues.filter((issue) => issue !== ORPHAN_SELL),
        ...(invalidSet.has(row.rowId) ? [ORPHAN_SELL] : []),
      ],
    }));
    await context.transaction.importDraftRevision.update({
      where: { id: revision.id },
      data: {
        rows: reviewedRows as Prisma.InputJsonValue,
        issues: reviewedRows.flatMap((row) => row.issues),
      },
    });
    const reviewedAggregateRows = mergeDraftRows(
      persistedBaseRows,
      reviewedRows,
      priorSubmittedSet,
    );
    await context.transaction.importDraft.update({
      where: { id: lockedDraft.id },
      data: { rows: reviewedAggregateRows as Prisma.InputJsonValue, status: 'pending' },
    });
    return {
      value: { events: [], replay: false, blockedRowIds: invalidRowIds },
      advanceRevision: false,
    };
  }

  return null;
}

async function confirmImportAssets(
  context: AccountLedgerWriteContext,
  rowsToAppend: ImportDraftRow[],
  account: Account,
) {
  for (const row of rowsToAppend) {
    if (row.kind === 'UNRESOLVED') continue;
    const assetType = inferAssetType(row.symbol, row.assetType);
    assertAccountCanHoldAsset(account, assetType);
    const existing = await context.transaction.asset.findUnique({
      where: { symbol: row.symbol },
    });
    if (existing?.identityStatus === 'confirmed' && existing.assetType !== assetType)
      throw conflict('IMPORT_ASSET_IDENTITY_CONFLICT', '已确认的资产类型不能被导入覆盖');
    await context.transaction.asset.upsert({
      where: { symbol: row.symbol },
      update:
        existing?.identityStatus === 'confirmed'
          ? {}
          : {
              ...(row.assetName ? { name: row.assetName } : {}),
              assetType,
              identityStatus: 'confirmed',
              identitySource: 'screenshot',
            },
      create: {
        symbol: row.symbol,
        name: row.assetName ?? row.symbol,
        market: row.symbol.endsWith('.OF') ? 'CN' : (row.symbol.split('.').at(-1) ?? 'CN'),
        assetType,
        currency: row.currency,
        identityStatus: 'confirmed',
        identitySource: 'screenshot',
      },
    });
  }
}

function draftAppendContext(
  context: AccountLedgerWriteContext,
  lockedDraft: ImportDraft,
  revision: ImportDraftRevision,
  command: SubmitImportDraftRevisionCommand,
  baselineBatchId: string,
  scope: 'FULL' | 'PARTIAL',
  recordedAt: string,
  times: SubmissionTimes,
): DraftRowAppendContext {
  const { observedAt, capturedAt, revisionTimePrecision, sourceTimezone } = times;
  return {
    ledger: context,
    draftId: lockedDraft.id,
    sourceChannel: lockedDraft.source,
    revision: revision.revision,
    actorId: command.actorId,
    baselineBatchId,
    batchScope: scope,
    recordedAt,
    ...(observedAt ? { observedAt } : {}),
    ...(capturedAt ? { capturedAt } : {}),
    ...(revisionTimePrecision ? { timePrecision: revisionTimePrecision } : {}),
    ...(sourceTimezone ? { sourceTimezone } : {}),
  };
}

function submittedDraftState(
  persistedRows: ImportDraftRow[],
  submittedRowIdSet: Set<string>,
  recordedAt: string,
): Prisma.ImportDraftUpdateInput {
  const fullySubmitted = persistedRows.every((row) => submittedRowIdSet.has(row.rowId));
  return {
    rows: persistedRows as Prisma.InputJsonValue,
    status: fullySubmitted ? 'committed' : 'partial',
    committedAt: fullySubmitted ? new Date(recordedAt) : null,
  };
}
