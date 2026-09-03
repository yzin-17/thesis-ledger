import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeSymbol } from '@thesis-ledger/domain';
import {
  createBaselineObservationBatchCommandSchemaV2,
  createImportDraftRevisionCommandSchemaV2,
  currencySchema,
  importDraftSchema,
  reviseImportDraftCommandSchemaV2,
  submitImportDraftRevisionCommandSchemaV2,
  type ImportDraftRowV2,
  type LedgerCommandResponseV2,
  type LedgerEventV2,
  type ReviseImportDraftCommandV2,
  type SubmitImportDraftRevisionCommandV2,
} from '@thesis-ledger/schemas';
import { Prisma } from '@prisma/client';
import { isEqual } from 'es-toolkit';
import { assertSymbolMatchesAssetType } from './ledger.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { assertAccountCanHoldAsset } from '../portfolio/accounts.service.js';
import { inferAssetType } from './asset-type.js';
import { ledgerEventSymbol } from './ledger-event-v2.js';
import { rebuildLedgerProjection } from './ledger-projection.js';
import {
  formatStoredTime,
  inferTimePrecision,
  isDateOnly,
  type TimePrecision,
} from './temporal.js';
import {
  LedgerV2Repository,
  toLedgerEventV2,
  type AccountLedgerMutation,
  type AccountLedgerWriteContext,
} from './ledger-v2.repository.js';
import {
  appendDraftRow,
  completeDraftBaselineRows,
  completeObservations,
  findOrphanSellRowIds,
  type DraftRowAppendContext,
} from './baseline-import-support.js';
import {
  draftLedgerEventPrefix,
  readAccount,
  readLedgerEvents,
  stableBaselineHash,
} from './import-state.js';
import type { ImportDraftOptions } from './import-draft.types.js';
import { validateImportPositionCandidate } from './import-position-validation.js';

const conflict = (errorCode: string, message: string, details?: Record<string, unknown>) =>
  new ConflictException({ errorCode, message, ...(details ? { details } : {}) });

const ORPHAN_SELL = 'ORPHAN_SELL';

const withoutComputedIssues = (rows: ImportDraftRowV2[]) =>
  rows.map((row) => ({ ...row, issues: row.issues.filter((issue) => issue !== ORPHAN_SELL) }));

const IMPORT_DRAFT_TRANSACTION_OPTIONS = {
  isolationLevel: 'Serializable' as const,
  maxWait: 10_000,
  timeout: 60_000,
} as const;

const IMPORT_DRAFT_TRANSACTION_RETRIES = 3;

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

const normalizeScope = (value?: string | null): 'FULL' | 'PARTIAL' =>
  value === 'PARTIAL' ? 'PARTIAL' : 'FULL';

const isGeneratedBaselineRow = (row: ImportDraftRowV2) =>
  row.kind === 'POSITION_BASELINE' && row.rowId.startsWith('baseline-zero:');

const readDraftRows = (value: Prisma.JsonValue | null | undefined): ImportDraftRowV2[] =>
  Array.isArray(value) ? (value as unknown as ImportDraftRowV2[]) : [];

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

const resolveExistingImportDraft = (draft: ExistingImportDraft, contentFingerprint: string) => {
  if (storedImportDraftFingerprint(draft) !== contentFingerprint)
    throw conflict('LEDGER_IDEMPOTENCY_CONFLICT', '相同 Draft 幂等键的内容不同');
  return { draftId: draft.id, revision: 1, idempotentReplay: true };
};

const readSubmittedRowIds = (value: Prisma.JsonValue | null | undefined): string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value.map(String) : [];

const isRetryableDraftTransactionError = (error: unknown) =>
  error !== null &&
  typeof error === 'object' &&
  'code' in error &&
  (error.code === 'P2002' || error.code === 'P2034');

const readStoredRowIds = (value: unknown) => {
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

const assignStableRowId = (
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

const mergeDraftRows = (
  existingRows: ImportDraftRowV2[],
  incomingRows: ImportDraftRowV2[],
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

interface DraftSubmissionResult {
  events: LedgerEventV2[];
  replay: boolean;
  blockedRowIds: string[] | null;
  projectionGenerations?: Record<string, string>;
}

interface BaselineBatchResult {
  events: LedgerEventV2[];
  replay: boolean;
  projectionGenerations?: Record<string, string>;
}

@Injectable()
export class BaselineImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: LedgerV2Repository,
  ) {}

  async createBaselineBatch(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    const command = createBaselineObservationBatchCommandSchemaV2.parse(rawCommand);
    const result = await this.repository.withAccountWrite<BaselineBatchResult>(
      command.accountId,
      async (context) => {
        const existing = await context.transaction.baselineObservationBatch.findUnique({
          where: {
            accountId_sourceChannel_externalId: {
              accountId: command.accountId,
              sourceChannel: command.source.channel,
              externalId: command.source.externalId,
            },
          },
        });
        if (existing) {
          if (existing.contentHash !== command.contentHash)
            throw conflict('LEDGER_IDEMPOTENCY_CONFLICT', '相同快照幂等键的内容不同');
          const events = await context.transaction.ledgerEvent.findMany({
            where: {
              accountId: command.accountId,
              sourceChannel: command.source.channel,
              externalId: { startsWith: `${command.source.externalId}:` },
            },
            orderBy: { economicOrderKey: 'asc' },
          });
          return {
            value: {
              events: events.map(toLedgerEventV2),
              replay: true,
              projectionGenerations: Object.fromEntries(
                events.map((event) => [
                  command.accountId,
                  event.projectionGeneration?.toString() ?? String(event.ledgerRevision ?? 0),
                ]),
              ),
            },
            advanceRevision: false,
          };
        }

        const observations = await completeObservations(context, command);
        const timePrecision =
          command.timePrecision ??
          (command.observedAt ? inferTimePrecision(command.observedAt) : 'UNKNOWN');
        await context.transaction.baselineObservationBatch.create({
          data: {
            id: command.batchId,
            accountId: command.accountId,
            scope: command.scope,
            ...(command.observedAt ? { observedAt: new Date(command.observedAt) } : {}),
            timePrecision,
            ...(command.capturedAt ? { capturedAt: new Date(command.capturedAt) } : {}),
            sourceCategory: command.source.category,
            sourceChannel: command.source.channel,
            externalId: command.source.externalId,
            evidenceRef: command.evidenceRef,
            contentHash: command.contentHash,
            status: 'SUBMITTED',
            submittedAt: new Date(),
          },
        });
        const recordedAt = new Date().toISOString();
        const events = [];
        for (const [index, observation] of observations.entries()) {
          events.push(
            await this.repository.appendRevision(context, {
              version: 2,
              eventId: randomUUID(),
              factId: randomUUID(),
              accountId: command.accountId,
              ledgerRevision: context.nextLedgerRevision.toString(),
              type: 'POSITION_BASELINE_OBSERVATION',
              occurredAt: command.observedAt ?? null,
              timePrecision,
              sourceTimezone: command.sourceTimezone,
              economicOrderKey: `baseline:${command.batchId}:${String(index).padStart(6, '0')}`,
              recordedAt,
              payloadVersion: 1,
              source: {
                ...command.source,
                externalId: `${command.source.externalId}:${observation.symbol}`,
                ...(observation.sourceRowId ? { sourceRowId: observation.sourceRowId } : {}),
              },
              actorId: command.actorId,
              revisionAction: 'CREATE',
              payload: {
                symbol: observation.symbol,
                batchId: command.batchId,
                batchScope: command.scope,
                quantity: observation.quantity,
                ...(observation.averageCost === undefined
                  ? {}
                  : { averageCost: observation.averageCost }),
                currency: observation.currency,
                costIncludesFees: observation.costIncludesFees,
                ...(command.capturedAt ? { capturedAt: command.capturedAt } : {}),
              },
            }),
          );
        }
        await rebuildLedgerProjection(
          context.transaction,
          command.accountId,
          'AVG',
          context.nextProjectionGeneration,
        );
        return { value: { events, replay: false }, advanceRevision: true };
      },
    );
    return this.eventsResponse(
      result.value.events,
      { [command.accountId]: result.ledgerRevision },
      result.value.projectionGenerations ?? { [command.accountId]: result.projectionGeneration },
      result.value.replay,
    );
  }

  async createImportDraft(rawCommand: unknown) {
    const command = createImportDraftRevisionCommandSchemaV2.parse(rawCommand);
    const rows = withoutComputedIssues(command.rows);
    const timePrecision =
      command.timePrecision ??
      (command.observedAt ? inferTimePrecision(command.observedAt) : undefined);
    const contentFingerprint = createImportDraftContentFingerprint({
      accountId: command.accountId,
      sourceChannel: command.sourceChannel,
      scope: command.scope,
      contentHash: command.contentHash,
      parserVersion: command.parserVersion,
      rawEvidenceRef: command.rawEvidenceRef,
      observedAt: command.observedAt,
      capturedAt: command.capturedAt,
      timePrecision,
      sourceTimezone: command.sourceTimezone,
      rows,
    });

    for (let attempt = 0; attempt < IMPORT_DRAFT_TRANSACTION_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const existing = await transaction.importDraft.findUnique({
            where: { idempotencyKey: command.idempotencyKey },
            include: {
              revisions: {
                where: { revision: 1 },
                take: 1,
                select: {
                  parserVersion: true,
                  rawEvidenceRef: true,
                  contentHash: true,
                  scope: true,
                  observedAt: true,
                  capturedAt: true,
                  timePrecision: true,
                  sourceTimezone: true,
                  rows: true,
                },
              },
            },
          });
          if (existing) return resolveExistingImportDraft(existing, contentFingerprint);

          await transaction.importDraft.create({
            data: {
              id: command.draftId,
              accountId: command.accountId,
              source: command.sourceChannel,
              scope: command.scope,
              status: 'pending',
              idempotencyKey: command.idempotencyKey,
              contentFingerprint,
              imageHash: command.contentHash,
              rows: rows as Prisma.InputJsonValue,
              currentRevision: 1,
            },
          });
          await transaction.importDraftRevision.create({
            data: {
              draftId: command.draftId,
              revision: 1,
              parserVersion: command.parserVersion,
              rawEvidenceRef: command.rawEvidenceRef,
              contentHash: command.contentHash,
              scope: command.scope,
              ...(command.observedAt === undefined
                ? {}
                : { observedAt: new Date(command.observedAt) }),
              ...(command.capturedAt === undefined
                ? {}
                : { capturedAt: new Date(command.capturedAt) }),
              ...(timePrecision === undefined ? {} : { timePrecision }),
              ...(command.sourceTimezone === undefined
                ? {}
                : { sourceTimezone: command.sourceTimezone }),
              rows: rows as Prisma.InputJsonValue,
              issues: rows.flatMap((row) => row.issues),
            },
          });
          return { draftId: command.draftId, revision: 1, idempotentReplay: false };
        }, IMPORT_DRAFT_TRANSACTION_OPTIONS);
      } catch (error) {
        if (!isRetryableDraftTransactionError(error)) throw error;
      }
    }

    const existing = await this.prisma.importDraft.findUnique({
      where: { idempotencyKey: command.idempotencyKey },
      include: {
        revisions: {
          where: { revision: 1 },
          take: 1,
          select: {
            parserVersion: true,
            rawEvidenceRef: true,
            contentHash: true,
            scope: true,
            observedAt: true,
            capturedAt: true,
            timePrecision: true,
            sourceTimezone: true,
            rows: true,
          },
        },
      },
    });
    if (existing) return resolveExistingImportDraft(existing, contentFingerprint);
    throw conflict('IMPORT_DRAFT_CONCURRENCY_CONFLICT', '导入草稿创建发生并发冲突，请重试');
  }

  async commitReviewedImport(
    id: string,
    reviewedRows: unknown[],
    reviewedSource?: string,
    temporal?: ImportDraftOptions,
  ) {
    const draft = await this.prisma.importDraft.findUnique({
      where: { id },
      select: { accountId: true },
    });
    if (!draft) throw new BadRequestException('导入草稿不存在');

    const result = await this.repository.withAccountWrite(draft.accountId, async (context) => {
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

      const aggregateRows = readStoredRowIds(lockedDraft.rows);
      const revisionRowsFromDraft = readStoredRowIds(currentRevision.rows);
      const storedRows = aggregateRows.length > 0 ? aggregateRows : revisionRowsFromDraft;
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
      const usedRowIds = new Set<string>();
      const revisionRows = normalizedRows.map((row, index) => {
        const rowId = assignStableRowId(row, index, storedRows, usedRowIds, lockedDraft.id);
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
      const contentHash = createHash('sha256').update(JSON.stringify(revisionRows)).digest('hex');
      const revised = await this.reviseImportDraftWithTransaction(context.transaction, {
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
      });
      const submission = await this.submitImportDraftWithContext(context, {
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

  async reviseImportDraft(rawCommand: unknown) {
    const command = reviseImportDraftCommandSchemaV2.parse(rawCommand);
    return this.prisma.$transaction((transaction) =>
      this.reviseImportDraftWithTransaction(transaction, command),
    );
  }

  private async reviseImportDraftWithTransaction(
    transaction: Prisma.TransactionClient,
    command: ReviseImportDraftCommandV2,
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
    const nextRevision = draft.currentRevision + 1;
    const scope = command.scope ?? draft.scope ?? 'FULL';
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

  async submitImportDraft(rawCommand: unknown): Promise<LedgerCommandResponseV2> {
    const command = submitImportDraftRevisionCommandSchemaV2.parse(rawCommand);
    const draft = await this.prisma.importDraft.findUnique({ where: { id: command.draftId } });
    if (!draft) throw new NotFoundException('导入草稿不存在');
    const result = await this.repository.withAccountWrite(draft.accountId, (context) =>
      this.submitImportDraftWithContext(context, command),
    );
    if (result.value.blockedRowIds)
      throw conflict('IMPORT_DRAFT_ROWS_INVALID', '问题行不能提交', {
        rowIds: result.value.blockedRowIds,
      });
    return this.eventsResponse(
      result.value.events,
      { [draft.accountId]: result.ledgerRevision },
      result.value.projectionGenerations ?? { [draft.accountId]: result.projectionGeneration },
      result.value.replay,
    );
  }

  private async submitImportDraftWithContext(
    context: AccountLedgerWriteContext,
    command: SubmitImportDraftRevisionCommandV2,
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
    if (revision.submittedAt) {
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
    if (lockedDraft.status === 'committed' || lockedDraft.status === 'cancelled')
      throw conflict('IMPORT_DRAFT_FROZEN', '已提交或已回滚的导入草稿不可再次提交');
    if (context.currentLedgerRevision.toString() !== command.expectedLedgerRevision)
      throw conflict('LEDGER_REVISION_CONFLICT', '账本已变更，请刷新后重试');

    const staticInvalid = selected.filter((row) =>
      row.issues.some((issue) => issue !== ORPHAN_SELL),
    );
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

    const baselineBatchId = randomUUID();
    const baselineRows = selected.filter((row) => row.kind === 'POSITION_BASELINE');
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

    const scope = normalizeScope(revision.scope ?? lockedDraft.scope);
    let generatedRows: ImportDraftRowV2[] = [];
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
    const appendContext: DraftRowAppendContext = {
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
    for (const [index, row] of rowsToAppend.entries()) {
      events.push(await appendDraftRow(this.repository, appendContext, row, index));
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
    const fullySubmitted = persistedRows.every((row) => submittedRowIdSet.has(row.rowId));
    await context.transaction.importDraft.update({
      where: { id: lockedDraft.id },
      data: {
        rows: persistedRows as Prisma.InputJsonValue,
        status: fullySubmitted ? 'committed' : 'partial',
        committedAt: fullySubmitted ? new Date(recordedAt) : null,
      },
    });
    await rebuildLedgerProjection(
      context.transaction,
      lockedDraft.accountId,
      'AVG',
      context.nextProjectionGeneration,
    );
    return { value: { events, replay: false, blockedRowIds: null }, advanceRevision: true };
  }

  private eventsResponse(
    events: ReturnType<typeof toLedgerEventV2>[],
    ledgerRevisions: Record<string, string>,
    projectionGenerations: Record<string, string>,
    idempotentReplay: boolean,
  ): LedgerCommandResponseV2 {
    const symbols = events.flatMap((event) => {
      const symbol = ledgerEventSymbol(event);
      return symbol ? [symbol] : [];
    });
    const eventLedgerRevisions = Object.fromEntries(
      events.map((event) => [event.accountId, event.ledgerRevision]),
    );
    return {
      eventIds: events.map((event) => event.eventId),
      factIds: events.map((event) => event.factId),
      ledgerRevisions:
        Object.keys(eventLedgerRevisions).length > 0 ? eventLedgerRevisions : ledgerRevisions,
      projectionGenerations,
      affectedSymbols: [...new Set(symbols)],
      idempotentReplay,
    };
  }
}
