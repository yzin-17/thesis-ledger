import type { ImportDraft, ImportDraftRevision } from '@prisma/client';
import type { ReviseImportDraftCommand } from '@thesis-ledger/schemas';
import { reviseImportDraftWithTransaction } from './baseline-import-revision.js';
import { submitImportDraftWithContext } from './baseline-import-submission.js';
import { importDraftConflict as conflict } from './baseline-import-support.js';
import { normalizeScope, readStoredRowIds, assignStableRowId } from './import-draft-row-state.js';

import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { normalizeSymbol } from '@thesis-ledger/domain';
import { currencySchema, importDraftSchema } from '@thesis-ledger/schemas';

import { assertSymbolMatchesAssetType } from './ledger.service.js';
import type { PrismaService } from '../platform/prisma.service.js';
import { assertAccountCanHoldAsset } from '../portfolio/accounts.service.js';
import { inferAssetType } from './asset-type.js';

import { formatStoredTime, inferTimePrecision, type TimePrecision } from './temporal.js';
import type { LedgerV2Repository } from './ledger-v2.repository.js';

import {
  draftLedgerEventPrefix,
  readAccount,
  readLedgerEvents,
  stableBaselineHash,
} from './import-state.js';
import type { ImportDraftOptions } from './import-draft.types.js';
import { validateImportPositionCandidate } from './import-position-validation.js';

export async function commitReviewedImport(
  prisma: PrismaService,
  repository: LedgerV2Repository,
  id: string,
  reviewedRows: unknown[],
  reviewedSource?: string,
  temporal?: ImportDraftOptions,
) {
  const draft = await prisma.importDraft.findUnique({
    where: { id },
    select: { accountId: true },
  });
  if (!draft) throw new BadRequestException('导入草稿不存在');

  const result = await repository.withAccountWrite(draft.accountId, async (context) => {
    const lockedDraft = await context.transaction.importDraft.findUnique({ where: { id } });
    if (!lockedDraft) throw new BadRequestException('导入草稿不存在');
    if (lockedDraft.status === 'committed')
      return { value: { draft: lockedDraft, blockedRowIds: null }, advanceRevision: false };

    const account = await readAccount(context.transaction, lockedDraft.accountId);
    if (account) {
      if (account.active === false) throw new BadRequestException('账户已停用，不能提交导入');
      if (account.type === 'cash') throw new BadRequestException('现金账户不支持截图导入');
    }
    const accountCurrency = currencySchema.parse(account?.currency ?? 'CNY');
    if (lockedDraft.baselineHash) {
      const importEventPrefix = draftLedgerEventPrefix(lockedDraft.id);
      const currentEvents = await readLedgerEvents(context.transaction, lockedDraft.accountId);
      const baselineEvents = currentEvents.filter((event) => {
        if (!event || typeof event !== 'object') return true;
        const externalId = (event as { externalId?: unknown }).externalId;
        return !(typeof externalId === 'string' && externalId.startsWith(importEventPrefix));
      });
      const currentHash = stableBaselineHash(baselineEvents);
      if (currentHash !== lockedDraft.baselineHash)
        throw new ConflictException('草稿创建后 Ledger 已变化，请重新导入快照');
    }

    const currentRevision = await context.transaction.importDraftRevision.findUnique({
      where: {
        draftId_revision: { draftId: lockedDraft.id, revision: lockedDraft.currentRevision },
      },
    });
    if (!currentRevision) throw new ConflictException('导入草稿缺少可审核 Revision');

    const normalizedRows = normalizeReviewedRows(reviewedRows);
    assertReviewedRows(normalizedRows, account);

    const aggregateRows = readStoredRowIds(lockedDraft.rows);
    const revisionRowsFromDraft = readStoredRowIds(currentRevision.rows);
    const storedRows = aggregateRows.length > 0 ? aggregateRows : revisionRowsFromDraft;
    const times = reviewedImportTimes(currentRevision, temporal);
    const revisionRows = reviewedRevisionRows(
      normalizedRows,
      accountCurrency,
      storedRows,
      lockedDraft.id,
      times,
    );
    const contentHash = createHash('sha256').update(JSON.stringify(revisionRows)).digest('hex');
    const revised = await reviseImportDraftWithTransaction(
      context.transaction,
      reviewedRevisionCommand(
        lockedDraft,
        currentRevision,
        revisionRows,
        contentHash,
        temporal,
        reviewedSource,
        times,
      ),
    );
    const submission = await submitImportDraftWithContext(repository, context, {
      command: 'SUBMIT_IMPORT_DRAFT_REVISION',
      draftId: lockedDraft.id,
      revision: revised.revision,
      expectedLedgerRevision: context.currentLedgerRevision.toString(),
      selectedRowIds: revised.rowIds,
      actorId: 'screenshot-review',
    });
    const updatedDraft = await context.transaction.importDraft.findUnique({ where: { id } });
    if (!updatedDraft) throw new ConflictException('导入草稿提交后无法读取');
    return {
      value: { draft: updatedDraft, blockedRowIds: submission.value.blockedRowIds },
      advanceRevision: submission.advanceRevision,
    };
  });
  if (result.value.blockedRowIds)
    throw conflict('IMPORT_DRAFT_ROWS_INVALID', '问题行不能提交', {
      rowIds: result.value.blockedRowIds,
    });
  return result.value.draft;
}

function normalizeReviewedRows(reviewedRows: unknown[]) {
  const rows = reviewedRows.map((row) => importDraftSchema.shape.rows.element.parse(row));
  const normalizedRows = rows.map((row) => {
    if (!row.symbol) return row;
    const raw = row.symbol.trim().toUpperCase();
    let symbol: string;
    try {
      symbol = raw.endsWith('.OF') ? raw : normalizeSymbol(raw).symbol;
    } catch {
      throw new BadRequestException(`无法识别资产代码：${row.symbol}`);
    }
    const assetType = inferAssetType(symbol, row.assetType) ?? 'stock';
    assertSymbolMatchesAssetType(symbol, assetType);
    return { ...row, symbol, assetType };
  });

  return normalizedRows;
}

type ReviewedRows = ReturnType<typeof normalizeReviewedRows>;
function assertReviewedRows(
  normalizedRows: ReviewedRows,
  account: Awaited<ReturnType<typeof readAccount>>,
) {
  const symbols = normalizedRows
    .map((row) => row.symbol)
    .filter((symbol): symbol is string => Boolean(symbol));
  if (new Set(symbols).size !== symbols.length)
    throw new BadRequestException('同一草稿不能包含重复证券代码');
  if (
    normalizedRows.some((row) => {
      const issues = validateImportPositionCandidate({
        ...(row.quantity === undefined ? {} : { quantity: row.quantity }),
        ...(row.costPrice === undefined ? {} : { costPrice: row.costPrice }),
        ...(row.marketPrice === undefined ? {} : { marketPrice: row.marketPrice }),
        ...(row.marketValue === undefined ? {} : { marketValue: row.marketValue }),
        ...(row.profit === undefined ? {} : { profit: row.profit }),
        ...(row.profitRate === undefined ? {} : { profitRate: row.profitRate }),
        confidence: row.confidence,
      });
      return (
        issues.length > 0 ||
        !row.symbol ||
        row.quantity === undefined ||
        row.costPrice === undefined
      );
    })
  )
    throw new BadRequestException('仍有未解决的导入问题');
  for (const row of normalizedRows) {
    if (!row.symbol) throw new BadRequestException('导入行缺少证券代码');
    if (row.quantity === undefined) throw new BadRequestException('导入行缺少数量');
    const assetType = inferAssetType(row.symbol, row.assetType) ?? 'stock';
    if (account) assertAccountCanHoldAsset(account as { type: string }, assetType);
  }
}

function reviewedImportTimes(
  currentRevision: ImportDraftRevision,
  temporal: ImportDraftOptions | undefined,
) {
  const revisionTimePrecision =
    currentRevision.timePrecision === 'DATE' || currentRevision.timePrecision === 'INSTANT'
      ? currentRevision.timePrecision
      : undefined;
  const observedAt =
    temporal?.observedAt ?? formatStoredTime(currentRevision.observedAt, revisionTimePrecision);
  const capturedAt = temporal?.capturedAt ?? currentRevision.capturedAt?.toISOString();
  let effectiveTimePrecision: 'INSTANT' | 'DATE' | undefined = revisionTimePrecision;
  if (temporal?.timePrecision) effectiveTimePrecision = temporal.timePrecision;
  else {
    let inferredTimePrecision: TimePrecision | undefined;
    if (temporal?.observedAt) inferredTimePrecision = inferTimePrecision(temporal.observedAt);
    else if (observedAt) inferredTimePrecision = inferTimePrecision(observedAt);
    if (inferredTimePrecision === 'DATE' || inferredTimePrecision === 'INSTANT')
      effectiveTimePrecision = inferredTimePrecision;
  }
  const sourceTimezone = temporal?.sourceTimezone ?? currentRevision.sourceTimezone;

  return { observedAt, capturedAt, effectiveTimePrecision, sourceTimezone };
}

type ReviewedTimes = ReturnType<typeof reviewedImportTimes>;
function reviewedRevisionRows(
  normalizedRows: ReviewedRows,
  accountCurrency: ReturnType<typeof currencySchema.parse>,
  storedRows: ReturnType<typeof readStoredRowIds>,
  draftId: string,
  times: ReviewedTimes,
) {
  const { observedAt, capturedAt, effectiveTimePrecision, sourceTimezone } = times;
  const usedRowIds = new Set<string>();
  const revisionRows = normalizedRows.map((row, index) => {
    const rowId = assignStableRowId(row, index, storedRows, usedRowIds, draftId);
    usedRowIds.add(rowId);
    return {
      rowId,
      kind: 'POSITION_BASELINE' as const,
      symbol: row.symbol!,
      quantity: String(row.quantity!),
      averageCost: String(row.costPrice!),
      currency: accountCurrency,
      costIncludesFees: 'UNKNOWN' as const,
      ...(observedAt ? { observedAt } : {}),
      ...(capturedAt ? { capturedAt } : {}),
      ...(effectiveTimePrecision ? { timePrecision: effectiveTimePrecision } : {}),
      ...(sourceTimezone ? { sourceTimezone } : {}),
      ...(row.rawName ? { assetName: row.rawName } : {}),
      ...(row.assetType ? { assetType: row.assetType } : {}),
      issues: [] as string[],
    };
  });

  return revisionRows;
}

function reviewedRevisionCommand(
  lockedDraft: ImportDraft,
  currentRevision: ImportDraftRevision,
  revisionRows: ReturnType<typeof reviewedRevisionRows>,
  contentHash: string,
  temporal: ImportDraftOptions | undefined,
  reviewedSource: string | undefined,
  times: ReviewedTimes,
): ReviseImportDraftCommand {
  const { observedAt, capturedAt, effectiveTimePrecision, sourceTimezone } = times;
  return {
    command: 'REVISE_IMPORT_DRAFT',
    draftId: lockedDraft.id,
    expectedRevision: lockedDraft.currentRevision,
    parserVersion: `${currentRevision.parserVersion}:reviewed`,
    rawEvidenceRef: currentRevision.rawEvidenceRef,
    contentHash,
    scope: normalizeScope(temporal?.scope ?? lockedDraft.scope),
    ...(observedAt ? { observedAt } : {}),
    ...(capturedAt ? { capturedAt } : {}),
    ...(effectiveTimePrecision ? { timePrecision: effectiveTimePrecision } : {}),
    ...(sourceTimezone ? { sourceTimezone } : {}),
    ...(reviewedSource === undefined ? {} : { sourceChannel: reviewedSource }),
    rows: revisionRows,
  };
}
