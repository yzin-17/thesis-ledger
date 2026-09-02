import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  type LedgerCommandErrorCodeV2,
  type LedgerCommandResponseV2,
  type LedgerEventV2,
} from '@thesis-ledger/schemas';
import { Prisma } from '@prisma/client';
import { isEqual } from 'es-toolkit';
import { projectCashMaterialization } from './cash-projection.js';
import {
  toLedgerEventV2,
  type AccountLedgerWriteContext,
  type LedgerV2Repository,
} from './ledger-v2.repository.js';
import { rebuildLedgerProjection } from './ledger-projection.js';

export type CashFlowPayloadEvent = Extract<
  LedgerEventV2,
  { type: 'CASH_FLOW'; revisionAction: 'CREATE' | 'REPLACE' | 'RESTORE' }
>;
export type CashFlowVoidEvent = Extract<
  LedgerEventV2,
  { revisionAction: 'VOID' }
> & { type: 'CASH_FLOW' };
export type CashFlowLedgerEvent = CashFlowPayloadEvent | CashFlowVoidEvent;

export type SingleCashMutation = {
  event: LedgerEventV2;
  replay: boolean;
  projectionGeneration?: string;
};

export type PairedCashMutation = {
  events: LedgerEventV2[];
  replay: boolean;
  projectionGenerations?: Record<string, string>;
};

type IdempotentReplay = {
  event: LedgerEventV2;
  projectionGeneration: string;
};

export const cashLedgerConflict = (
  errorCode: LedgerCommandErrorCodeV2,
  message: string,
  accountId?: string,
  currentLedgerRevision?: string,
) =>
  new ConflictException({
    errorCode,
    message,
    ...(accountId === undefined ? {} : { accountId }),
    ...(currentLedgerRevision === undefined ? {} : { currentLedgerRevision }),
  });

export const assertCashExpectedRevision = (
  context: AccountLedgerWriteContext,
  expectedLedgerRevision: string,
) => {
  if (context.currentLedgerRevision.toString() === expectedLedgerRevision) return;
  throw cashLedgerConflict(
    'LEDGER_REVISION_CONFLICT',
    '账本已变更，请刷新后重试',
    context.accountId,
    context.currentLedgerRevision.toString(),
  );
};

type LedgerEventBaseInput = {
  accountId: string;
  ledgerRevision: bigint;
  occurredAt: string | null;
  timePrecision: LedgerEventV2['timePrecision'];
  sourceTimezone: string;
  economicOrderKey: string;
  source: LedgerEventV2['source'];
  actorId: string;
  payloadVersion?: number;
};

export const createCashLedgerEventBase = (input: LedgerEventBaseInput) => ({
  version: 2 as const,
  accountId: input.accountId,
  ledgerRevision: input.ledgerRevision.toString(),
  occurredAt: input.occurredAt,
  timePrecision: input.timePrecision,
  sourceTimezone: input.sourceTimezone,
  economicOrderKey: input.economicOrderKey,
  recordedAt: new Date().toISOString(),
  payloadVersion: input.payloadVersion ?? 1,
  source: input.source,
  actorId: input.actorId,
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

const signedCashImpact = (event: CashFlowLedgerEvent) => {
  if (event.revisionAction === 'VOID') return new Prisma.Decimal(0);
  const amount = new Prisma.Decimal(event.payload.amount);
  return event.payload.direction === 'INFLOW' ? amount : amount.neg();
};

export class CashLedgerCommandSupport {
  constructor(private readonly repository: LedgerV2Repository) {}

  async assertAccountWritable(context: AccountLedgerWriteContext, currency: string) {
    const account = await context.transaction.account.findUnique({ where: { id: context.accountId } });
    if (!account)
      throw cashLedgerConflict('LEDGER_VALIDATION_FAILED', '账户不存在', context.accountId);
    if (!account.active)
      throw cashLedgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '已停用账户不能写入现金流',
        context.accountId,
      );
    if (account.mode !== 'actual')
      throw cashLedgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '现金流只支持真实账户',
        context.accountId,
      );
    if (account.currency !== currency)
      throw cashLedgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '现金流币种必须与账户币种一致',
        context.accountId,
      );
    return account;
  }

  async assertBalanceAfterRevision(
    context: AccountLedgerWriteContext,
    currentTip: CashFlowLedgerEvent | undefined,
    desiredTip: CashFlowLedgerEvent,
  ) {
    const desiredPayload = desiredTip.revisionAction === 'VOID' ? undefined : desiredTip.payload;
    const currentPayload =
      currentTip?.revisionAction === 'VOID' ? undefined : currentTip?.payload;
    const currency = desiredPayload?.currency ?? currentPayload?.currency;
    if (!currency) return;
    if (desiredPayload && currentPayload && desiredPayload.currency !== currentPayload.currency)
      throw cashLedgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '现金流修正不能改变币种',
        context.accountId,
      );
    const currentBalance = await this.settledBalance(context, currency);
    const currentImpact = currentTip ? signedCashImpact(currentTip) : new Prisma.Decimal(0);
    const desiredImpact = signedCashImpact(desiredTip);
    const nextBalance = currentBalance.minus(currentImpact).plus(desiredImpact);
    if (nextBalance.isNegative())
      throw cashLedgerConflict(
        'LEDGER_INSUFFICIENT_CASH',
        '已结算现金余额不足',
        context.accountId,
        context.currentLedgerRevision.toString(),
      );
  }

  async requireEvent(
    context: AccountLedgerWriteContext,
    eventId: string,
  ): Promise<CashFlowLedgerEvent> {
    const stored = await context.transaction.ledgerEvent.findUnique({ where: { id: eventId } });
    if (!stored || stored.factId === null)
      throw new NotFoundException({
        errorCode: 'LEDGER_FACT_NOT_FOUND',
        message: '找不到可修正的现金事实',
      });
    if (stored.accountId !== context.accountId)
      throw cashLedgerConflict(
        'LEDGER_CORRECTION_ACCOUNT_MISMATCH',
        '不能在当前账户修正其他账户的事实',
        context.accountId,
      );
    const event = toLedgerEventV2(stored);
    if (event.type !== 'CASH_FLOW')
      throw cashLedgerConflict(
        'LEDGER_VALIDATION_FAILED',
        '目标事件不是现金流',
        context.accountId,
      );
    return event as CashFlowLedgerEvent;
  }

  async assertChainTip(context: AccountLedgerWriteContext, eventId: string) {
    const child = await context.transaction.ledgerEvent.findUnique({
      where: { supersedesEventId: eventId },
    });
    if (child)
      throw cashLedgerConflict(
        'LEDGER_CORRECTION_NOT_CHAIN_TIP',
        '只能修正当前链末',
        context.accountId,
      );
  }

  assertCorrectionAction(
    target: CashFlowLedgerEvent,
    action: 'REPLACE' | 'VOID' | 'RESTORE',
    accountId: string,
  ) {
    if (action === 'RESTORE' && target.revisionAction !== 'VOID')
      throw cashLedgerConflict(
        'LEDGER_RESTORE_REQUIRES_VOID',
        '只能恢复当前链末为 VOID 的事实',
        accountId,
      );
    if (action !== 'RESTORE' && target.revisionAction === 'VOID')
      throw cashLedgerConflict(
        'LEDGER_CORRECTION_NOT_CHAIN_TIP',
        '已作废事实只能恢复',
        accountId,
      );
  }

  async findIdempotentReplay(
    context: AccountLedgerWriteContext,
    desired: LedgerEventV2,
  ): Promise<IdempotentReplay | undefined> {
    const externalId = desired.source.externalId;
    if (externalId === undefined) return undefined;
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
        event: existing,
        projectionGeneration: stored.projectionGeneration?.toString() ?? existing.ledgerRevision,
      };
    throw cashLedgerConflict(
      'LEDGER_IDEMPOTENCY_CONFLICT',
      '相同幂等键已用于不同内容',
      context.accountId,
      context.currentLedgerRevision.toString(),
    );
  }

  rebuild(context: AccountLedgerWriteContext) {
    return rebuildLedgerProjection(
      context.transaction,
      context.accountId,
      'AVG',
      context.nextProjectionGeneration,
    );
  }

  singleResponse(
    mutation: SingleCashMutation,
    result: { ledgerRevision: string; projectionGeneration: string },
  ): LedgerCommandResponseV2 {
    const event = mutation.event;
    return {
      eventIds: [event.eventId],
      factIds: [event.factId],
      ledgerRevisions: { [event.accountId]: event.ledgerRevision },
      projectionGenerations: {
        [event.accountId]: mutation.projectionGeneration ?? result.projectionGeneration,
      },
      affectedSymbols: [],
      idempotentReplay: mutation.replay,
    };
  }

  pairedResponse(
    mutation: PairedCashMutation,
    result: {
      ledgerRevisions: Record<string, string>;
      projectionGenerations: Record<string, string>;
    },
  ): LedgerCommandResponseV2 {
    return {
      eventIds: mutation.events.map((event) => event.eventId),
      factIds: mutation.events.map((event) => event.factId),
      ledgerRevisions: Object.fromEntries(
        mutation.events.map((event) => [event.accountId, event.ledgerRevision]),
      ),
      projectionGenerations: mutation.projectionGenerations ?? result.projectionGenerations,
      affectedSymbols: [],
      idempotentReplay: mutation.replay,
    };
  }

  private async settledBalance(context: AccountLedgerWriteContext, currency: string) {
    const stored = await context.transaction.ledgerEvent.findMany({
      where: { accountId: context.accountId },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
    const projected = projectCashMaterialization(stored);
    return (
      projected.balances.find(
        (balance) =>
          balance.accountId === context.accountId && balance.currency === currency,
      )?.settledAmount ?? new Prisma.Decimal(0)
    );
  }
}
