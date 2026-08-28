import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ledgerAuditResponseSchemaV2,
  ledgerEventsResponseSchemaV2,
  ledgerReplayResponseSchemaV2,
  type LedgerAuditResponseV2,
  type LedgerEventsResponseV2,
  type LedgerReplayResponseV2,
} from '@thesis-ledger/schemas';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';
import { LedgerV2Repository, toLedgerEventV2 } from './ledger-v2.repository.js';

type StoredLedgerEvent = {
  id: string;
  accountId: string;
  type: string;
  occurredAt: Date | null;
  symbol: string | null;
  quantity: Prisma.Decimal | null;
  price: Prisma.Decimal | null;
  amount: Prisma.Decimal | null;
  fee: Prisma.Decimal | null;
  tax: Prisma.Decimal | null;
  externalId: string | null;
  source: string;
  sourceRowId: string | null;
  currency: string;
  note: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  factId: string | null;
  ledgerRevision: bigint | null;
  timePrecision: string | null;
  sourceTimezone: string | null;
  economicOrderKey: string | null;
  recordedAt: Date;
  projectionGeneration: bigint | null;
  payloadVersion: number | null;
  payload: Prisma.JsonValue;
  sourceCategory: string | null;
  sourceChannel: string | null;
  actorId: string | null;
  revisionAction: string | null;
  supersedesEventId: string | null;
  reason: string | null;
};

const revisionPattern = /^\d+$/;

const assertRevision = (value: string | undefined) => {
  if (value !== undefined && !revisionPattern.test(value))
    throw new BadRequestException({
      errorCode: 'LEDGER_REVISION_INVALID',
      message: 'Ledger Revision 必须是非负整数字符串',
    });
  return value;
};

const decimal = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Prisma.Decimal) return value.toString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint')
    return String(value);
  return null;
};

const metadata = (value: Prisma.JsonValue | null) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const isV2Event = (event: StoredLedgerEvent) =>
  event.factId !== null &&
  event.ledgerRevision !== null &&
  event.timePrecision !== null &&
  event.sourceTimezone !== null &&
  event.economicOrderKey !== null &&
  event.payloadVersion !== null &&
  event.sourceCategory !== null &&
  event.sourceChannel !== null &&
  event.actorId !== null &&
  event.revisionAction !== null;

const mapLegacyEvent = (event: StoredLedgerEvent) => ({
  version: 1 as const,
  id: event.id,
  accountId: event.accountId,
  type: event.type,
  occurredAt: event.occurredAt?.toISOString() ?? null,
  symbol: event.symbol,
  quantity: decimal(event.quantity),
  price: decimal(event.price),
  amount: decimal(event.amount),
  fee: decimal(event.fee),
  tax: decimal(event.tax),
  externalId: event.externalId,
  source: event.source,
  sourceRowId: event.sourceRowId,
  currency: event.currency,
  note: event.note,
  metadata: metadata(event.metadata),
  createdAt: event.createdAt.toISOString(),
});

const revisionOf = (event: { ledgerRevision: string }) => BigInt(event.ledgerRevision);

const sortEffectiveEvents = <T extends { ledgerRevision: string; eventId: string }>(events: T[]) =>
  events.sort((left, right) => {
    const revisionDifference = revisionOf(left) < revisionOf(right) ? -1 : 1;
    return left.ledgerRevision === right.ledgerRevision
      ? left.eventId.localeCompare(right.eventId)
      : revisionDifference;
  });

@Injectable()
export class LedgerQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: LedgerV2Repository,
  ) {}

  async effectiveEvents(accountId: string, asOfRevision?: string): Promise<LedgerEventsResponseV2> {
    const asOf = assertRevision(asOfRevision);
    await this.requireAccount(accountId);
    const events = sortEffectiveEvents(await this.repository.readEffectiveEvents(accountId, asOf));
    const state = await this.readState(accountId);
    return ledgerEventsResponseSchemaV2.parse({
      accountId,
      ledgerRevision: state.ledgerRevision,
      projectionGeneration: state.projectionGeneration,
      ...(asOf === undefined ? {} : { asOfLedgerRevision: asOf }),
      events,
      effective: true,
    });
  }

  async auditEvents(accountId: string, asOfRevision?: string): Promise<LedgerAuditResponseV2> {
    const requestedRevision = assertRevision(asOfRevision);
    await this.requireAccount(accountId);
    const state = await this.readState(accountId);
    const asOf = requestedRevision ?? state.ledgerRevision;
    const stored = (await this.prisma.ledgerEvent.findMany({
      where: {
        accountId,
        ...(requestedRevision === undefined
          ? {}
          : { ledgerRevision: { lte: BigInt(requestedRevision) } }),
      },
      orderBy: [{ ledgerRevision: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    })) as StoredLedgerEvent[];
    const events = stored.map((event) =>
      isV2Event(event) ? toLedgerEventV2(event) : mapLegacyEvent(event),
    );
    return ledgerAuditResponseSchemaV2.parse({
      accountId,
      asOfLedgerRevision: asOf,
      ledgerRevision: state.ledgerRevision,
      projectionGeneration: state.projectionGeneration,
      events,
      effective: false,
    });
  }

  async replay(accountId: string, asOfRevision: string): Promise<LedgerReplayResponseV2> {
    const asOf = assertRevision(asOfRevision);
    if (asOf === undefined) throw new BadRequestException('审计重放必须提供 Ledger Revision');
    const effective = await this.effectiveEvents(accountId, asOf);
    return ledgerReplayResponseSchemaV2.parse({
      accountId: effective.accountId,
      ledgerRevision: effective.ledgerRevision,
      projectionGeneration: effective.projectionGeneration,
      events: effective.events,
      asOfLedgerRevision: asOf,
      replayed: true,
    });
  }

  private async requireAccount(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('账户不存在');
  }

  private async readState(accountId: string) {
    const state = await this.prisma.accountLedgerState.findUnique({
      where: { accountId },
      select: { ledgerRevision: true, projectionGeneration: true },
    });
    return {
      ledgerRevision: state?.ledgerRevision.toString() ?? '0',
      projectionGeneration: state?.projectionGeneration.toString() ?? '0',
    };
  }
}
