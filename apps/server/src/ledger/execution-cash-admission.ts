import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LedgerEvent } from '@thesis-ledger/schemas';
import {
  cashEffectiveAt,
  projectCashMaterialization,
  type StoredCashEvent,
} from './cash-projection.js';
import type { AccountLedgerWriteContext } from './ledger-v2.repository.js';

type ExecutionEvent = Extract<
  LedgerEvent,
  {
    type: 'BUY_EXECUTION' | 'SELL_EXECUTION';
    revisionAction: 'CREATE' | 'REPLACE' | 'RESTORE';
  }
>;

const prospectiveStoredEvent = (event: ExecutionEvent): StoredCashEvent => ({
  id: event.eventId,
  accountId: event.accountId,
  type: event.type,
  factId: event.factId,
  ledgerRevision: BigInt(event.ledgerRevision),
  occurredAt: event.occurredAt === null ? null : new Date(event.occurredAt),
  timePrecision: event.timePrecision,
  sourceTimezone: event.sourceTimezone,
  economicOrderKey: event.economicOrderKey,
  recordedAt: new Date(event.recordedAt),
  envelopeVersion: 1,
  payloadVersion: event.payloadVersion,
  payload: event.payload,
  sourceCategory: event.source.category,
  sourceChannel: event.source.channel,
  externalId: event.source.externalId ?? null,
  sourceRowId: event.source.sourceRowId ?? null,
  actorId: event.actorId,
  revisionAction: event.revisionAction,
  supersedesEventId: event.supersedesEventId ?? null,
  reason: event.reason ?? null,
});

/** 调用方已持有账户写锁；只投影候选事实，不写入或修复现有账本。 */
export async function assertExecutionCashAvailable(
  context: AccountLedgerWriteContext,
  event: ExecutionEvent,
  now = new Date(),
) {
  const stored = await context.transaction.ledgerEvent.findMany({
    where: { accountId: context.accountId },
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
  });
  const candidate = prospectiveStoredEvent(event);
  const effectiveAt = cashEffectiveAt(event.payload, event.occurredAt);
  const checkpoints = [now];
  if (effectiveAt !== null && Date.parse(effectiveAt) !== now.getTime())
    checkpoints.push(new Date(effectiveAt));
  for (const targetAt of checkpoints) {
    const before = projectCashMaterialization(stored, targetAt);
    const after = projectCashMaterialization([...stored, candidate], targetAt);
    const availableBefore = new Map(
      before.balances.map((balance) => [
        balance.currency,
        balance.settledAmount.minus(balance.pendingPayable),
      ]),
    );
    for (const balance of after.balances) {
      const current = availableBefore.get(balance.currency) ?? new Prisma.Decimal(0);
      const next = balance.settledAmount.minus(balance.pendingPayable);
      // 旧负余额可保持或改善；新成交不得扩大透支，待收款不抵扣待付款。
      const floor = Prisma.Decimal.min(current, 0);
      if (next.lessThan(floor))
        throw new ConflictException({
          errorCode: 'LEDGER_INSUFFICIENT_CASH',
          message: `可用现金余额不足（${balance.currency}），请核对成交金额及费用。`,
          accountId: context.accountId,
          currentLedgerRevision: context.currentLedgerRevision.toString(),
        });
    }
  }
}
