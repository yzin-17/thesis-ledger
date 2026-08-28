import type { LedgerEvent } from '@thesis-ledger/domain';
import type { Prisma } from '@prisma/client';
import { latestLedgerEventByFact } from './ledger-event-v2.js';
import { toLedgerEventV2 } from './ledger-v2.repository.js';

export type LegacyLedgerEventRecord = {
  id: string;
  accountId: string;
  type: string;
  occurredAt: Date | null;
  symbol: string | null;
  quantity: unknown;
  price: unknown;
  amount: unknown;
  fee: unknown;
  tax: unknown;
  source?: string | null;
  metadata?: unknown;
  factId?: string | null;
  ledgerRevision?: bigint | null;
  timePrecision?: string | null;
  sourceTimezone?: string | null;
  economicOrderKey?: string | null;
  recordedAt?: Date;
  payloadVersion?: number | null;
  payload?: Prisma.JsonValue;
  sourceCategory?: string | null;
  sourceChannel?: string | null;
  externalId?: string | null;
  sourceRowId?: string | null;
  actorId?: string | null;
  revisionAction?: string | null;
  supersedesEventId?: string | null;
  reason?: string | null;
};

export const toLegacyDomainEvent = (event: LegacyLedgerEventRecord): LedgerEvent => ({
  id: event.id,
  accountId: event.accountId,
  type: event.type as LedgerEvent['type'],
  occurredAt: event.occurredAt?.toISOString() ?? null,
  ...(event.symbol === null || event.symbol === undefined ? {} : { symbol: event.symbol }),
  ...(event.quantity === null || event.quantity === undefined
    ? {}
    : { quantity: Number(event.quantity) }),
  ...(event.price === null || event.price === undefined ? {} : { price: Number(event.price) }),
  ...(event.amount === null || event.amount === undefined ? {} : { amount: Number(event.amount) }),
  ...(event.fee === null || event.fee === undefined ? {} : { fee: Number(event.fee) }),
  ...(event.tax === null || event.tax === undefined ? {} : { tax: Number(event.tax) }),
  ...(event.source === null || event.source === undefined ? {} : { source: event.source }),
  ...(event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
    ? { metadata: event.metadata as Record<string, unknown> }
    : {}),
});

type StoredLedgerEvent = LegacyLedgerEventRecord;

/**
 * 将旧账本行和当前 V2 有效事实转换为投影使用的领域事件。
 * 该适配器只负责读取兼容，不提供任何旧格式写入入口。
 */
export const toDomainEvents = (stored: StoredLedgerEvent[]): LedgerEvent[] => {
  const tips = latestLedgerEventByFact(stored);
  const effective = stored.filter(
    (event) =>
      !event.factId || (tips.get(event.factId)?.id === event.id && event.revisionAction !== 'VOID'),
  );
  return effective.flatMap((event) => {
    if (event.factId && event.payload && event.recordedAt) {
      const v2 = toLedgerEventV2({
        ...event,
        factId: event.factId,
        ledgerRevision: event.ledgerRevision ?? null,
        timePrecision: event.timePrecision ?? null,
        sourceTimezone: event.sourceTimezone ?? null,
        economicOrderKey: event.economicOrderKey ?? null,
        recordedAt: event.recordedAt,
        payloadVersion: event.payloadVersion ?? null,
        payload: event.payload,
        sourceCategory: event.sourceCategory ?? null,
        sourceChannel: event.sourceChannel ?? null,
        externalId: event.externalId ?? null,
        sourceRowId: event.sourceRowId ?? null,
        actorId: event.actorId ?? null,
        revisionAction: event.revisionAction ?? null,
        supersedesEventId: event.supersedesEventId ?? null,
        reason: event.reason ?? null,
      });
      if (v2.revisionAction === 'VOID') return [];
      if (v2.type === 'POSITION_BASELINE_OBSERVATION')
        return [
          {
            id: v2.eventId,
            accountId: v2.accountId,
            type: 'ADJUSTMENT' as const,
            occurredAt: v2.occurredAt,
            symbol: v2.payload.symbol,
            quantity: Number(v2.payload.quantity),
            price: Number(v2.payload.averageCost ?? 0),
            source: v2.source.channel,
            metadata: {
              kind: 'position-balance',
              economicOrderKey: v2.economicOrderKey,
              timePrecision: v2.timePrecision,
            },
          },
        ];
      if (v2.type === 'BUY_EXECUTION' || v2.type === 'SELL_EXECUTION')
        return [
          {
            id: v2.eventId,
            accountId: v2.accountId,
            type: v2.type === 'BUY_EXECUTION' ? ('BUY' as const) : ('SELL' as const),
            occurredAt: v2.occurredAt,
            symbol: v2.payload.symbol,
            quantity: Number(v2.payload.quantity),
            price: Number(v2.payload.price),
            source: v2.source.channel,
            metadata: {
              economicOrderKey: v2.economicOrderKey,
              timePrecision: v2.timePrecision,
            },
          },
        ];
      if (v2.type === 'BONUS_SHARE')
        return [
          {
            id: v2.eventId,
            accountId: v2.accountId,
            type: 'BONUS' as const,
            occurredAt: v2.occurredAt,
            symbol: v2.payload.symbol,
            quantity: Number(v2.payload.quantity),
            source: v2.source.channel,
            metadata: {
              economicOrderKey: v2.economicOrderKey,
              timePrecision: v2.timePrecision,
            },
          },
        ];
      return [];
    }
    return [toLegacyDomainEvent(event)];
  });
};
