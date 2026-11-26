import { importDraftConflict as conflict } from './baseline-import-support.js';
import { withoutComputedIssues } from './import-draft-row-state.js';
import {
  createImportDraftContentFingerprint,
  resolveExistingImportDraft,
} from './import-draft-identity.js';
export {
  createImportDraftContentFingerprint,
  type ImportDraftContentFingerprintInput,
} from './import-draft-identity.js';
import { commitReviewedImport } from './baseline-import-review.js';
import { reviseImportDraftWithTransaction } from './baseline-import-revision.js';
import { submitImportDraftWithContext } from './baseline-import-submission.js';
import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';

import {
  createBaselineObservationBatchCommandSchema,
  createImportDraftRevisionCommandSchema,
  reviseImportDraftCommandSchema,
  submitImportDraftRevisionCommandSchema,
  type LedgerCommandResponse,
  type LedgerEvent,
} from '@thesis-ledger/schemas';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../platform/prisma.service.js';

import { ledgerEventSymbol } from './ledger-event-v2.js';
import { rebuildLedgerProjection } from './ledger-projection.js';
import { inferTimePrecision } from './temporal.js';
import { LedgerV2Repository, toLedgerEventV2 } from './ledger-v2.repository.js';
import { completeObservations } from './baseline-import-support.js';

import type { ImportDraftOptions } from './import-draft.types.js';

const IMPORT_DRAFT_TRANSACTION_OPTIONS = {
  isolationLevel: 'Serializable' as const,
  maxWait: 10_000,
  timeout: 60_000,
} as const;

const IMPORT_DRAFT_TRANSACTION_RETRIES = 3;

const isRetryableDraftTransactionError = (error: unknown) =>
  error !== null &&
  typeof error === 'object' &&
  'code' in error &&
  (error.code === 'P2002' || error.code === 'P2034');

interface BaselineBatchResult {
  events: LedgerEvent[];
  replay: boolean;
  projectionGenerations?: Record<string, string>;
}

@Injectable()
export class BaselineImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: LedgerV2Repository,
  ) {}

  async createBaselineBatch(rawCommand: unknown): Promise<LedgerCommandResponse> {
    const command = createBaselineObservationBatchCommandSchema.parse(rawCommand);
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
              version: 1,
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
    const command = createImportDraftRevisionCommandSchema.parse(rawCommand);
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
    return commitReviewedImport(
      this.prisma,
      this.repository,
      id,
      reviewedRows,
      reviewedSource,
      temporal,
    );
  }

  async reviseImportDraft(rawCommand: unknown) {
    const command = reviseImportDraftCommandSchema.parse(rawCommand);
    return this.prisma.$transaction((transaction) =>
      reviseImportDraftWithTransaction(transaction, command),
    );
  }

  async submitImportDraft(rawCommand: unknown): Promise<LedgerCommandResponse> {
    const command = submitImportDraftRevisionCommandSchema.parse(rawCommand);
    const draft = await this.prisma.importDraft.findUnique({ where: { id: command.draftId } });
    if (!draft) throw new NotFoundException('导入草稿不存在');
    const result = await this.repository.withAccountWrite(draft.accountId, (context) =>
      submitImportDraftWithContext(this.repository, context, command),
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

  private eventsResponse(
    events: ReturnType<typeof toLedgerEventV2>[],
    ledgerRevisions: Record<string, string>,
    projectionGenerations: Record<string, string>,
    idempotentReplay: boolean,
  ): LedgerCommandResponse {
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
