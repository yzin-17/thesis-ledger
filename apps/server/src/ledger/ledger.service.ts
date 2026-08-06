import { BadRequestException, Injectable } from '@nestjs/common';
import { projectAverageCost, projectFifo, type LedgerEvent } from '@thesis-ledger/domain';
import type { Prisma } from '@prisma/client';
import { ledgerEventSchemaV1 } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';

const monetaryTypes = new Set([
  'DIVIDEND',
  'FEE',
  'TAX',
  'INTEREST',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'CASH_DEPOSIT',
  'CASH_WITHDRAW',
]);

type LedgerClient = Pick<PrismaService, 'ledgerEvent'>;

const toDomainEvent = (parsed: ReturnType<typeof ledgerEventSchemaV1.parse>): LedgerEvent => ({
  id: parsed.id,
  accountId: parsed.accountId,
  type: parsed.type,
  occurredAt: parsed.occurredAt,
  ...(parsed.symbol === undefined ? {} : { symbol: parsed.symbol }),
  ...(parsed.quantity === undefined ? {} : { quantity: parsed.quantity }),
  ...(parsed.price === undefined ? {} : { price: parsed.price }),
  ...(parsed.amount === undefined ? {} : { amount: parsed.amount }),
  ...(parsed.fee === undefined ? {} : { fee: parsed.fee }),
  ...(parsed.tax === undefined ? {} : { tax: parsed.tax }),
  externalId: parsed.externalUid,
  ...(parsed.correctionOf === undefined ? {} : { correctionOf: parsed.correctionOf }),
  ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata }),
});

const validateLedgerEvent = (
  input: LedgerEvent,
  parsed: ReturnType<typeof ledgerEventSchemaV1.parse>,
) => {
  if (
    (input.type === 'BUY' || input.type === 'SELL') &&
    (!input.symbol ||
      !input.quantity ||
      input.quantity <= 0 ||
      input.price === undefined ||
      input.price < 0)
  )
    throw new BadRequestException('交易流水需要合法标的、数量和价格');
  if (monetaryTypes.has(input.type) && input.amount === undefined)
    throw new BadRequestException('现金流水需要 amount');
  if (input.type === 'ADJUSTMENT' && (!input.correctionOf || !parsed.note?.trim()))
    throw new BadRequestException('Adjustment 必须引用被修正事件并填写 reason/note');
};

export const appendLedgerEvent = async (client: LedgerClient, rawInput: unknown) => {
  const parsed = ledgerEventSchemaV1.parse(rawInput);
  const input = toDomainEvent(parsed);
  validateLedgerEvent(input, parsed);
  return client.ledgerEvent.upsert({
    where: {
      accountId_externalId: {
        accountId: input.accountId,
        externalId: input.externalId ?? input.id,
      },
    },
    update: {},
    create: {
      id: input.id,
      accountId: input.accountId,
      type: input.type,
      occurredAt: new Date(input.occurredAt),
      ...(input.symbol === undefined ? {} : { symbol: input.symbol }),
      ...(input.quantity === undefined ? {} : { quantity: input.quantity }),
      ...(input.price === undefined ? {} : { price: input.price }),
      ...(input.amount === undefined ? {} : { amount: input.amount }),
      ...(input.fee === undefined ? {} : { fee: input.fee }),
      ...(input.tax === undefined ? {} : { tax: input.tax }),
      externalId: input.externalId ?? input.id,
      source: parsed.source,
      currency: parsed.currency,
      ...(parsed.note === undefined ? {} : { note: parsed.note }),
      ...(input.correctionOf === undefined ? {} : { correctionOf: input.correctionOf }),
      ...(input.metadata === undefined
        ? {}
        : { metadata: input.metadata as Prisma.InputJsonValue }),
    },
  });
};

const toDomainEvents = (
  stored: Array<{
    id: string;
    accountId: string;
    type: string;
    occurredAt: Date;
    symbol: string | null;
    quantity: unknown;
    price: unknown;
    amount: unknown;
    fee: unknown;
    tax: unknown;
    correctionOf?: string | null;
    metadata?: unknown;
  }>,
): LedgerEvent[] =>
  stored.map((event) => ({
    id: event.id,
    accountId: event.accountId,
    type: event.type as LedgerEvent['type'],
    occurredAt: event.occurredAt.toISOString(),
    ...(event.symbol === null ? {} : { symbol: event.symbol }),
    ...(event.quantity === null ? {} : { quantity: Number(event.quantity) }),
    ...(event.price === null ? {} : { price: Number(event.price) }),
    ...(event.amount === null ? {} : { amount: Number(event.amount) }),
    ...(event.fee === null ? {} : { fee: Number(event.fee) }),
    ...(event.tax === null ? {} : { tax: Number(event.tax) }),
    ...(event.correctionOf === null || event.correctionOf === undefined
      ? {}
      : { correctionOf: event.correctionOf }),
    ...(event.metadata && typeof event.metadata === 'object'
      ? { metadata: event.metadata as Record<string, unknown> }
      : {}),
  }));

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async append(rawInput: unknown) {
    const stored = await appendLedgerEvent(this.prisma, rawInput);
    const accountId = (rawInput as { accountId?: string }).accountId;
    if (accountId) await this.rebuild(accountId);
    return stored;
  }

  async setPosition(
    accountId: string,
    symbol: string,
    quantity: number,
    costPrice: number,
    source: 'manual' | 'migration' | 'screenshot',
    reason: string,
  ) {
    await this.prisma.asset.upsert({
      where: { symbol },
      update: {},
      create: {
        symbol,
        name: symbol,
        market: symbol.endsWith('.HK') ? 'HK' : 'CN',
        assetType: 'stock',
        currency: 'CNY',
      },
    });
    const previous = await this.prisma.ledgerEvent.findFirst({
      where: { accountId, symbol },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
    const result = await appendLedgerEvent(this.prisma, {
      version: 1,
      id: crypto.randomUUID(),
      accountId,
      type: 'ADJUSTMENT',
      occurredAt: new Date().toISOString(),
      symbol,
      quantity: quantity > 0 ? quantity : undefined,
      price: costPrice,
      currency: 'CNY',
      source,
      externalUid: `${source}:position:${accountId}:${symbol}:${crypto.randomUUID()}`,
      correctionOf: previous?.id ?? crypto.randomUUID(),
      note: reason,
      metadata: { kind: 'opening-balance', quantity, costPrice, source, reason },
    });
    await this.rebuild(accountId);
    return result;
  }

  async migratePositions(accountId?: string) {
    const positions = await this.prisma.position.findMany({
      ...(accountId ? { where: { accountId } } : {}),
      orderBy: [{ accountId: 'asc' }, { symbol: 'asc' }],
    });
    const migrated: Array<{
      accountId: string;
      symbol: string;
      quantity: number;
      costPrice: number;
    }> = [];
    for (const position of positions) {
      await this.prisma.asset.upsert({
        where: { symbol: position.symbol },
        update: {},
        create: {
          symbol: position.symbol,
          name: position.symbol,
          market: position.symbol.endsWith('.HK') ? 'HK' : 'CN',
          assetType: 'stock',
          currency: 'CNY',
        },
      });
      await appendLedgerEvent(this.prisma, {
        version: 1,
        id: crypto.randomUUID(),
        accountId: position.accountId,
        type: 'ADJUSTMENT',
        occurredAt: new Date().toISOString(),
        symbol: position.symbol,
        quantity: Number(position.quantity),
        price: Number(position.costPrice),
        currency: 'CNY',
        source: 'migration',
        externalUid: `migration:position:${position.id}`,
        correctionOf: position.id,
        note: 'V0.1 Position 迁移为 Ledger opening balance',
        metadata: { kind: 'opening-balance', migratedPositionId: position.id },
      });
      migrated.push({
        accountId: position.accountId,
        symbol: position.symbol,
        quantity: Number(position.quantity),
        costPrice: Number(position.costPrice),
      });
    }
    const accountIds = [...new Set(migrated.map((item) => item.accountId))];
    const projections = await Promise.all(accountIds.map((id) => this.rebuild(id)));
    return { migrated, accounts: accountIds, projections };
  }

  async rebuild(accountId: string, method: 'AVG' | 'FIFO' = 'AVG') {
    const stored = await this.prisma.ledgerEvent.findMany({
      where: { accountId },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
    const events = toDomainEvents(stored);
    const projected = method === 'AVG' ? projectAverageCost(events) : projectFifo(events);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.position.deleteMany({ where: { accountId } });
      for (const position of projected) {
        if (position.quantity <= 0) continue;
        await transaction.position.create({
          data: {
            accountId,
            symbol: position.symbol,
            quantity: position.quantity,
            costPrice: position.averageCost,
            source: 'ledger',
          },
        });
      }
    });
    return projected;
  }

  async list(accountId: string) {
    return this.prisma.ledgerEvent.findMany({
      where: { accountId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
