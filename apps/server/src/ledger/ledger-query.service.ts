import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ledgerAuditResponseSchemaV2,
  ledgerEventsResponseSchemaV2,
  ledgerReplayResponseSchemaV2,
  type LedgerAuditResponseV2,
  type LedgerEventsResponseV2,
  type LedgerReplayResponseV2,
} from '@thesis-ledger/schemas';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';
import { LedgerV2Repository, toLedgerEventV2 } from './ledger-v2.repository.js';

type StoredLedgerEvent = {
  id: string;
  accountId: string;
  type: string;
  occurredAt: Date | null;
  externalId: string | null;
  sourceRowId: string | null;
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
    const events = stored.map(toLedgerEventV2);
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
