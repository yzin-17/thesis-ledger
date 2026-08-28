import { Injectable } from '@nestjs/common';
import { ledgerEventEnvelopeSchemaV2, type LedgerEventV2 } from '@thesis-ledger/schemas';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';
import { latestLedgerEventByFact } from './ledger-event-v2.js';

type LedgerTransaction = Prisma.TransactionClient;

interface LockedLedgerStateRow {
  accountId: string;
  ledgerRevision: bigint;
  projectionGeneration: bigint;
}

export interface AccountLedgerWriteContext {
  transaction: LedgerTransaction;
  accountId: string;
  currentLedgerRevision: bigint;
  nextLedgerRevision: bigint;
  currentProjectionGeneration: bigint;
  nextProjectionGeneration: bigint;
}

export interface AccountLedgerMutation<T> {
  value: T;
  advanceRevision: boolean;
}

export interface AccountLedgerWriteResult<T> {
  value: T;
  ledgerRevision: string;
  projectionGeneration: string;
}

export interface MultiAccountLedgerMutation<T> {
  value: T;
  advanceAccountIds: string[];
}

export interface MultiAccountLedgerWriteResult<T> {
  value: T;
  ledgerRevisions: Record<string, string>;
  projectionGenerations: Record<string, string>;
}

type TransactionHost = Pick<PrismaClient, '$transaction'>;

const toCreateInput = (
  event: LedgerEventV2,
  projectionGeneration: bigint,
): Prisma.LedgerEventUncheckedCreateInput => {
  return {
    id: event.eventId,
    accountId: event.accountId,
    type: event.type,
    occurredAt: event.occurredAt === null ? null : new Date(event.occurredAt),
    ...(event.source.externalId === undefined ? {} : { externalId: event.source.externalId }),
    ...(event.source.sourceRowId === undefined ? {} : { sourceRowId: event.source.sourceRowId }),
    factId: event.factId,
    ledgerRevision: BigInt(event.ledgerRevision),
    projectionGeneration,
    timePrecision: event.timePrecision,
    sourceTimezone: event.sourceTimezone,
    economicOrderKey: event.economicOrderKey,
    recordedAt: new Date(event.recordedAt),
    payloadVersion: event.payloadVersion,
    payload: event.revisionAction === 'VOID' ? Prisma.DbNull : event.payload,
    sourceCategory: event.source.category,
    sourceChannel: event.source.channel,
    actorId: event.actorId,
    revisionAction: event.revisionAction,
    ...(event.supersedesEventId === undefined
      ? {}
      : { supersedesEventId: event.supersedesEventId }),
    ...(event.reason === undefined ? {} : { reason: event.reason }),
  };
};

export const toLedgerEventV2 = (stored: {
  id: string;
  accountId: string;
  type: string;
  factId: string | null;
  ledgerRevision: bigint | null;
  occurredAt: Date | null;
  timePrecision: string | null;
  sourceTimezone: string | null;
  economicOrderKey: string | null;
  recordedAt: Date;
  payloadVersion: number | null;
  payload: Prisma.JsonValue;
  sourceCategory: string | null;
  sourceChannel: string | null;
  externalId: string | null;
  sourceRowId?: string | null;
  actorId: string | null;
  revisionAction: string | null;
  supersedesEventId: string | null;
  reason: string | null;
}) => {
  const revisionAction = stored.revisionAction;
  let occurredAt: string | null = null;
  if (stored.occurredAt !== null) {
    occurredAt = stored.occurredAt.toISOString();
    if (stored.timePrecision === 'DATE') occurredAt = occurredAt.slice(0, 10);
  }
  const event = {
    version: 2,
    eventId: stored.id,
    factId: stored.factId,
    accountId: stored.accountId,
    ledgerRevision: stored.ledgerRevision?.toString(),
    type: stored.type,
    occurredAt,
    timePrecision: stored.timePrecision,
    sourceTimezone: stored.sourceTimezone,
    economicOrderKey: stored.economicOrderKey,
    recordedAt: stored.recordedAt.toISOString(),
    payloadVersion: stored.payloadVersion,
    source: {
      category: stored.sourceCategory,
      channel: stored.sourceChannel,
      ...(stored.externalId === null ? {} : { externalId: stored.externalId }),
      ...(stored.sourceRowId === null || stored.sourceRowId === undefined
        ? {}
        : { sourceRowId: stored.sourceRowId }),
    },
    actorId: stored.actorId,
    revisionAction,
    ...(stored.supersedesEventId === null ? {} : { supersedesEventId: stored.supersedesEventId }),
    ...(stored.reason === null ? {} : { reason: stored.reason }),
    ...(revisionAction === 'VOID' ? {} : { payload: stored.payload }),
  };
  return ledgerEventEnvelopeSchemaV2.parse(event);
};

@Injectable()
export class LedgerV2Repository {
  constructor(private readonly prisma: PrismaService) {}

  async withAccountWrite<T>(
    accountId: string,
    operation: (context: AccountLedgerWriteContext) => Promise<AccountLedgerMutation<T>>,
  ): Promise<AccountLedgerWriteResult<T>> {
    const result = await this.withAccountsWrite([accountId], async (contexts) => {
      const context = contexts.get(accountId);
      if (!context) throw new Error(`缺少账户账本上下文: ${accountId}`);
      const mutation = await operation(context);
      return {
        value: mutation.value,
        advanceAccountIds: mutation.advanceRevision ? [accountId] : [],
      };
    });
    const ledgerRevision = result.ledgerRevisions[accountId];
    const projectionGeneration = result.projectionGenerations[accountId];
    if (ledgerRevision === undefined || projectionGeneration === undefined)
      throw new Error(`缺少账户账本结果: ${accountId}`);
    return { value: result.value, ledgerRevision, projectionGeneration };
  }

  async withAccountsWrite<T>(
    accountIds: string[],
    operation: (
      contexts: Map<string, AccountLedgerWriteContext>,
    ) => Promise<MultiAccountLedgerMutation<T>>,
  ): Promise<MultiAccountLedgerWriteResult<T>> {
    const orderedAccountIds = [...new Set(accountIds)].sort();
    if (orderedAccountIds.length === 0) throw new Error('至少需要一个账户');

    return (this.prisma as TransactionHost).$transaction(async (transaction) => {
      const client = transaction as LedgerTransaction;
      for (const accountId of orderedAccountIds) {
        await client.$executeRaw`
          INSERT INTO "AccountLedgerState" ("accountId", "updatedAt")
          VALUES (${accountId}::uuid, CURRENT_TIMESTAMP)
          ON CONFLICT ("accountId") DO NOTHING
        `;
      }
      const rows = await client.$queryRaw<LockedLedgerStateRow[]>(Prisma.sql`
        SELECT "accountId", "ledgerRevision", "projectionGeneration"
        FROM "AccountLedgerState"
        WHERE "accountId" = ANY(ARRAY[${Prisma.join(orderedAccountIds)}]::uuid[])
        ORDER BY "accountId"
        FOR UPDATE
      `);
      if (rows.length !== orderedAccountIds.length) throw new Error('无法锁定所有账户账本状态');

      const contexts = new Map<string, AccountLedgerWriteContext>();
      for (const state of rows) {
        contexts.set(state.accountId, {
          transaction: client,
          accountId: state.accountId,
          currentLedgerRevision: state.ledgerRevision,
          nextLedgerRevision: state.ledgerRevision + 1n,
          currentProjectionGeneration: state.projectionGeneration,
          nextProjectionGeneration: state.projectionGeneration + 1n,
        });
      }

      const mutation = await operation(contexts);
      const advanceAccountIds = new Set(mutation.advanceAccountIds);
      const ledgerRevisions: Record<string, string> = {};
      const projectionGenerations: Record<string, string> = {};
      for (const accountId of orderedAccountIds) {
        const context = contexts.get(accountId);
        if (!context) throw new Error(`缺少账户账本上下文: ${accountId}`);
        if (advanceAccountIds.has(accountId)) {
          await client.accountLedgerState.update({
            where: { accountId },
            data: {
              ledgerRevision: context.nextLedgerRevision,
              projectionGeneration: context.nextProjectionGeneration,
            },
          });
          ledgerRevisions[accountId] = context.nextLedgerRevision.toString();
          projectionGenerations[accountId] = context.nextProjectionGeneration.toString();
          continue;
        }
        ledgerRevisions[accountId] = context.currentLedgerRevision.toString();
        projectionGenerations[accountId] = context.currentProjectionGeneration.toString();
      }
      return {
        value: mutation.value,
        ledgerRevisions,
        projectionGenerations,
      };
    });
  }

  async appendRevision(
    context: AccountLedgerWriteContext,
    rawEvent: unknown,
  ): Promise<LedgerEventV2> {
    const event = ledgerEventEnvelopeSchemaV2.parse(rawEvent);
    if (event.accountId !== context.accountId) throw new Error('账本事件与已锁定账户不一致');
    if (event.ledgerRevision !== context.nextLedgerRevision.toString())
      throw new Error('账本事件 Revision 与事务下一版本不一致');
    await context.transaction.ledgerEvent.create({
      data: toCreateInput(event, context.nextProjectionGeneration),
    });
    return event;
  }

  async readEffectiveEvents(accountId: string, asOfRevision?: string): Promise<LedgerEventV2[]> {
    const stored = await this.prisma.ledgerEvent.findMany({
      where: {
        accountId,
        factId: { not: null },
        ...(asOfRevision === undefined ? {} : { ledgerRevision: { lte: BigInt(asOfRevision) } }),
      },
      orderBy: { ledgerRevision: 'asc' },
    });
    const chainTips = latestLedgerEventByFact(stored.map(toLedgerEventV2));
    return [...chainTips.values()].filter((event) => event.revisionAction !== 'VOID');
  }
}
