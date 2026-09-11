import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  createTradeOpeningBoundaryAssertionCommandSchemaV2,
  type CreateTradeOpeningBoundaryAssertionCommandV2,
  type LedgerCommandErrorCodeV2,
  type LedgerCommandResponseV2,
  type LedgerEventV2,
} from '@thesis-ledger/schemas';
import { isEqual } from 'es-toolkit';
import { rebuildLedgerProjection } from './ledger-projection.js';
import {
  LedgerV2Repository,
  toLedgerEventV2,
  type AccountLedgerWriteContext,
} from './ledger-v2.repository.js';

type OpeningBoundaryEvent = Extract<
  LedgerEventV2,
  {
    type: 'TRADE_OPENING_BOUNDARY_ASSERTION';
    revisionAction: 'CREATE' | 'REPLACE' | 'RESTORE';
  }
>;

type OpeningBoundaryMutation = {
  event: OpeningBoundaryEvent;
  replay: boolean;
  projectionGeneration?: string;
};

const ledgerConflict = (errorCode: LedgerCommandErrorCodeV2, message: string, accountId?: string) =>
  new ConflictException({
    errorCode,
    message,
    ...(accountId === undefined ? {} : { accountId }),
  });

const eventFingerprint = (event: LedgerEventV2) => ({
  accountId: event.accountId,
  type: event.type,
  occurredAt: event.occurredAt,
  timePrecision: event.timePrecision,
  sourceTimezone: event.sourceTimezone,
  economicOrderKey: event.economicOrderKey,
  payloadVersion: event.payloadVersion,
  source: event.source,
  actorId: event.actorId,
  revisionAction: event.revisionAction,
  supersedesEventId: event.supersedesEventId,
  reason: event.reason,
  ...(event.revisionAction === 'VOID' ? {} : { payload: event.payload }),
});

const createOpeningBoundaryEvent = (
  tradeId: string,
  command: CreateTradeOpeningBoundaryAssertionCommandV2,
  ledgerRevision: bigint,
): OpeningBoundaryEvent => ({
  version: 2,
  eventId: randomUUID(),
  factId: randomUUID(),
  accountId: command.accountId,
  ledgerRevision: ledgerRevision.toString(),
  type: 'TRADE_OPENING_BOUNDARY_ASSERTION',
  revisionAction: 'CREATE',
  occurredAt: command.occurredAt,
  timePrecision: 'INSTANT',
  sourceTimezone: command.sourceTimezone,
  economicOrderKey: command.economicOrderKey,
  recordedAt: new Date().toISOString(),
  payloadVersion: 1,
  source: command.source,
  actorId: command.actorId,
  reason: command.reason,
  payload: {
    tradeId,
    symbol: command.payload.symbol,
    baselineFactId: command.payload.baselineFactId,
  },
});

const positiveBaselineFact = (
  components: Array<{ factId: string; quantity: Prisma.Decimal }>,
  factId: string,
) =>
  components.find((component) => component.factId === factId && component.quantity.greaterThan(0));

@Injectable()
export class TradeOpeningBoundaryCommandService {
  constructor(private readonly repository: LedgerV2Repository) {}

  async createOpeningBoundary(
    tradeId: string,
    rawCommand: unknown,
  ): Promise<LedgerCommandResponseV2> {
    const command = createTradeOpeningBoundaryAssertionCommandSchemaV2.parse(rawCommand);
    const result = await this.repository.withAccountWrite<OpeningBoundaryMutation>(
      command.accountId,
      async (context) => {
        const desired = createOpeningBoundaryEvent(tradeId, command, context.nextLedgerRevision);
        const replay = await this.findIdempotentReplay(context, desired);
        if (replay)
          return {
            value: {
              event: replay.event,
              replay: true,
              projectionGeneration: replay.projectionGeneration,
            },
            advanceRevision: false,
          };

        await this.assertTargetIsEligible(context, tradeId, command);
        const event = (await this.repository.appendRevision(
          context,
          desired,
        )) as OpeningBoundaryEvent;
        await rebuildLedgerProjection(
          context.transaction,
          context.accountId,
          'AVG',
          context.nextProjectionGeneration,
        );
        return { value: { event, replay: false }, advanceRevision: true };
      },
    );

    return {
      eventIds: [result.value.event.eventId],
      factIds: [result.value.event.factId],
      ledgerRevisions: { [result.value.event.accountId]: result.value.event.ledgerRevision },
      projectionGenerations: {
        [result.value.event.accountId]:
          result.value.projectionGeneration ?? result.projectionGeneration,
      },
      affectedSymbols: [result.value.event.payload.symbol],
      idempotentReplay: result.value.replay,
    };
  }

  private async findIdempotentReplay(
    context: AccountLedgerWriteContext,
    desired: OpeningBoundaryEvent,
  ): Promise<{ event: OpeningBoundaryEvent; projectionGeneration: string } | undefined> {
    const externalId = desired.source.externalId;
    if (externalId === undefined) throw new Error('建仓时间补录事件缺少幂等键');
    const stored = await context.transaction.ledgerEvent.findUnique({
      where: {
        accountId_sourceChannel_externalId: {
          accountId: context.accountId,
          sourceChannel: desired.source.channel,
          externalId,
        },
      },
    });
    if (!stored) return undefined;
    const existing = toLedgerEventV2(stored);
    if (isEqual(eventFingerprint(existing), eventFingerprint(desired)))
      return {
        event: existing as OpeningBoundaryEvent,
        projectionGeneration: stored.projectionGeneration?.toString() ?? existing.ledgerRevision,
      };
    throw ledgerConflict(
      'LEDGER_IDEMPOTENCY_CONFLICT',
      '相同幂等键已用于不同内容',
      context.accountId,
    );
  }

  private async assertTargetIsEligible(
    context: AccountLedgerWriteContext,
    tradeId: string,
    command: CreateTradeOpeningBoundaryAssertionCommandV2,
  ) {
    const trade = await context.transaction.trade.findUnique({
      where: { id: tradeId },
      select: {
        accountId: true,
        symbol: true,
        openedAt: true,
        earliestEvidenceAt: true,
        entryLegs: { select: { id: true } },
        baselineComponents: { select: { factId: true, quantity: true } },
      },
    });
    if (!trade || trade.accountId !== context.accountId)
      throw ledgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '找不到当前账户的目标交易',
        context.accountId,
      );
    if (trade.symbol !== command.payload.symbol)
      throw ledgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '补录标的与目标交易不一致',
        context.accountId,
      );
    if (trade.openedAt !== null)
      throw ledgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '该交易已有建仓时间，不能重复补录',
        context.accountId,
      );
    if (trade.entryLegs.length > 0)
      throw ledgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '该交易已有真实建仓成交，不能补录建仓时间',
        context.accountId,
      );
    if (!positiveBaselineFact(trade.baselineComponents, command.payload.baselineFactId))
      throw ledgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '只能为包含有效持仓快照的交易补录建仓时间',
        context.accountId,
      );

    const openingAt = Date.parse(command.occurredAt);
    if (openingAt > Date.now())
      throw ledgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '建仓时间不能晚于当前时间',
        context.accountId,
      );
    if (trade.earliestEvidenceAt !== null && openingAt > trade.earliestEvidenceAt.getTime())
      throw ledgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '建仓时间不能晚于该交易最早证据时间',
        context.accountId,
      );
  }
}
