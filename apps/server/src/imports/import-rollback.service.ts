import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { LedgerV2Repository, toLedgerEventV2 } from '../ledger/ledger-v2.repository.js';
import { rebuildLedgerProjection } from '../ledger/ledger-projection.js';
import { PrismaService } from '../platform/prisma.service.js';

@Injectable()
export class ImportRollbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: LedgerV2Repository,
  ) {}

  async rollback(id: string) {
    const draft = await this.prisma.$transaction((transaction) =>
      transaction.importDraft.findUnique({ where: { id } }),
    );
    if (!draft) throw new BadRequestException('导入草稿不存在');
    const result = await this.repository.withAccountWrite(draft.accountId, async (context) => {
      const lockedDraft = await context.transaction.importDraft.findUnique({ where: { id } });
      if (!lockedDraft || lockedDraft.status !== 'committed')
        throw new BadRequestException('只能回滚已提交的导入');
      const importEventPrefix = `draft:${lockedDraft.id}:`;
      const submitted = await context.transaction.ledgerEvent.findMany({
        where: {
          accountId: lockedDraft.accountId,
          factId: { not: null },
          externalId: { startsWith: importEventPrefix },
        },
        orderBy: { economicOrderKey: 'asc' },
      });
      const submittedIds = submitted.map((event) => event.id);
      const submittedIdSet = new Set(submittedIds);
      const rows = (Array.isArray(lockedDraft.rows) ? lockedDraft.rows : []) as unknown[];
      const submittedSymbols = new Set(
        rows
          .filter((row): row is Record<string, unknown> =>
            Boolean(row && typeof row === 'object' && !Array.isArray(row)),
          )
          .map((row) => (typeof row.symbol === 'string' ? row.symbol : ''))
          .filter(Boolean),
      );
      if (submittedSymbols.size > 0 && lockedDraft.committedAt) {
        const laterEvent = await context.transaction.ledgerEvent.findFirst({
          where: {
            accountId: lockedDraft.accountId,
            ...(submittedIds.length > 0 ? { id: { notIn: submittedIds } } : {}),
            symbol: { in: [...submittedSymbols] },
            createdAt: { gt: lockedDraft.committedAt },
            OR: [{ externalId: null }, { externalId: { not: { startsWith: importEventPrefix } } }],
          },
          orderBy: { createdAt: 'asc' },
        });
        if (laterEvent)
          throw new ConflictException(
            `导入提交后 ${laterEvent.symbol ?? '相关标的'} 已有新的 Ledger 事件，不能自动回滚`,
          );
      }
      const submittedFactIds = [
        ...new Set(
          submitted
            .map((event) => event.factId)
            .filter((factId): factId is string => typeof factId === 'string'),
        ),
      ];
      if (submittedFactIds.length > 0) {
        const laterRevisions = await context.transaction.ledgerEvent.findMany({
          where: {
            accountId: lockedDraft.accountId,
            factId: { in: submittedFactIds },
            ...(submittedIds.length > 0 ? { id: { notIn: submittedIds } } : {}),
            supersedesEventId: { not: null },
          },
          select: { id: true, factId: true, supersedesEventId: true },
        });
        const externalRevision = laterRevisions.find(
          (event) =>
            !submittedIdSet.has(event.id) &&
            typeof event.factId === 'string' &&
            event.supersedesEventId !== null,
        );
        if (externalRevision) throw new ConflictException('导入事实已被其他修正，不能自动回滚');
      }
      const recordedAt = new Date().toISOString();
      for (const stored of submitted) {
        const event = toLedgerEventV2(stored);
        await this.repository.appendRevision(context, {
          version: 2,
          eventId: randomUUID(),
          factId: event.factId,
          accountId: event.accountId,
          ledgerRevision: context.nextLedgerRevision.toString(),
          type: event.type,
          occurredAt: event.occurredAt,
          timePrecision: event.timePrecision,
          sourceTimezone: event.sourceTimezone,
          economicOrderKey: event.economicOrderKey,
          recordedAt,
          payloadVersion: event.payloadVersion,
          source: {
            category: 'IMPORT',
            channel: 'screenshot:rollback',
            externalId: `draft:${lockedDraft.id}:rollback:${event.eventId}`,
            ...(event.source.sourceRowId === undefined
              ? {}
              : { sourceRowId: event.source.sourceRowId }),
          },
          actorId: 'screenshot-rollback',
          revisionAction: 'VOID',
          supersedesEventId: event.eventId,
          reason: '回滚截图导入',
        });
      }
      if (submitted.length > 0)
        await rebuildLedgerProjection(
          context.transaction,
          lockedDraft.accountId,
          'AVG',
          context.nextProjectionGeneration,
        );
      const updated = await context.transaction.importDraft.update({
        where: { id },
        data: { status: 'cancelled', rolledBackAt: new Date() },
      });
      return { value: updated, advanceRevision: submitted.length > 0 };
    });
    return result.value;
  }
}
