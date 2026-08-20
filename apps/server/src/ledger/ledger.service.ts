import { BadRequestException, Injectable } from '@nestjs/common';
import { projectAverageCost, projectFifo, type LedgerEvent } from '@thesis-ledger/domain';
import type { Prisma } from '@prisma/client';
import {
  assetIdentitySourceSchema,
  assetIdentityStatusSchema,
  ledgerEventSchemaV1,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { assertAccountCanHoldAsset } from '../portfolio/accounts.service.js';

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

const CONFIRMED_IDENTITY_STATUS = assetIdentityStatusSchema.enum.confirmed;
const MANUAL_IDENTITY_SOURCE = assetIdentitySourceSchema.enum.manual;
const SCREENSHOT_IDENTITY_SOURCE = assetIdentitySourceSchema.enum.screenshot;

type LedgerClient = Pick<PrismaService, 'ledgerEvent'>;
type LedgerTransactionClient = Pick<
  Prisma.TransactionClient,
  'account' | 'asset' | 'ledgerEvent' | 'position'
>;

const inferAssetType = (symbol: string, requested?: string) => {
  if (requested) return requested;
  if (symbol.endsWith('.OF')) return 'fund';
  return /^[15]\d{5}\.(SH|SZ|BJ)$/.test(symbol) ? 'etf' : 'stock';
};

export const assertSymbolMatchesAssetType = (symbol: string, assetType: string) => {
  if (symbol.endsWith('.OF') && assetType !== 'fund')
    throw new BadRequestException('场外基金代码必须使用基金资产类型');
  if (!symbol.endsWith('.OF') && assetType === 'fund')
    throw new BadRequestException('基金资产类型必须使用 .OF 场外基金代码');
};

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
  source: parsed.source,
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
  if (input.type === 'ADJUSTMENT' && !parsed.note?.trim())
    throw new BadRequestException('Adjustment 必须填写 reason/note');
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
    source?: string | null;
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
    ...(event.source === null || event.source === undefined ? {} : { source: event.source }),
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
    const parsed = ledgerEventSchemaV1.parse(rawInput);
    const assetType = parsed.symbol
      ? inferAssetType(
          parsed.symbol,
          typeof parsed.metadata?.assetType === 'string'
            ? parsed.metadata.assetType
            : undefined,
        )
      : undefined;
    if (parsed.symbol && assetType) assertSymbolMatchesAssetType(parsed.symbol, assetType);
    return this.prisma.$transaction(async (transaction) => {
      await this.assertAccountWithClient(transaction, parsed.accountId, assetType);
      const stored = await appendLedgerEvent(transaction, parsed);
      await this.rebuildWithClient(transaction, parsed.accountId, 'AVG');
      return stored;
    });
  }

  private async assertAccount(accountId: string, assetType?: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new BadRequestException('账户不存在');
    if (!account.active) throw new BadRequestException('账户已停用，不能新增录入');
    if (account.currency !== 'CNY')
      throw new BadRequestException('历史非人民币账户只读，请先转换为 CNY');
    if (assetType) assertAccountCanHoldAsset(account, assetType);
    return account;
  }

  private async assertAccountWithClient(
    client: Pick<LedgerTransactionClient, 'account'>,
    accountId: string,
    assetType?: string,
  ) {
    const account = await client.account.findUnique({ where: { id: accountId } });
    if (!account) throw new BadRequestException('账户不存在');
    if (!account.active) throw new BadRequestException('账户已停用，不能新增录入');
    if (account.currency !== 'CNY')
      throw new BadRequestException('历史非人民币账户只读，请先转换为 CNY');
    if (assetType) assertAccountCanHoldAsset(account, assetType);
    return account;
  }

  private async upsertAssetWithClient(
    client: Pick<LedgerTransactionClient, 'asset'>,
    symbol: string,
    assetName?: string,
    requestedAssetType?: string,
    identitySource: 'manual' | 'screenshot' = MANUAL_IDENTITY_SOURCE,
  ) {
    const assetType = inferAssetType(symbol, requestedAssetType);
    assertSymbolMatchesAssetType(symbol, assetType);
    const existing = await client.asset.findUnique({ where: { symbol } });
    if (existing?.identityStatus === CONFIRMED_IDENTITY_STATUS) {
      if (existing.assetType !== assetType)
        throw new BadRequestException('已确认的资产类型不能被录入覆盖');
      return existing;
    }
    return client.asset.upsert({
      where: { symbol },
      update: {
        ...(assetName ? { name: assetName } : {}),
        assetType,
        identityStatus: CONFIRMED_IDENTITY_STATUS,
        identitySource,
      },
      create: {
        symbol,
        name: assetName ?? symbol,
        market: symbol.endsWith('.OF') ? 'CN' : symbol.endsWith('.HK') ? 'HK' : 'CN',
        assetType,
        currency: 'CNY',
        identityStatus: CONFIRMED_IDENTITY_STATUS,
        identitySource,
      },
    });
  }

  async setPosition(
    accountId: string,
    symbol: string,
    quantity: number,
    costPrice: number,
    source: 'manual' | 'migration' | 'screenshot',
    reason: string,
    options?: { assetName?: string; assetType?: 'stock' | 'etf' | 'fund' },
  ) {
    const assetType = inferAssetType(symbol, options?.assetType);
    assertSymbolMatchesAssetType(symbol, assetType);
    return this.prisma.$transaction(async (transaction) => {
      await this.assertAccountWithClient(transaction, accountId, assetType);
      await this.upsertAssetWithClient(
        transaction,
        symbol,
        options?.assetName,
        assetType,
        source === 'screenshot' ? SCREENSHOT_IDENTITY_SOURCE : MANUAL_IDENTITY_SOURCE,
      );
      const previous = await transaction.ledgerEvent.findFirst({
        where: { accountId, symbol },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      });
      const result = await appendLedgerEvent(transaction, {
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
        ...(previous?.id ? { correctionOf: previous.id } : {}),
        note: reason,
        metadata: { kind: 'position-balance', quantity, costPrice, source, reason },
      });
      await this.rebuildWithClient(transaction, accountId, 'AVG');
      return result;
    });
  }

  async setCashBalance(
    accountId: string,
    amount: number,
    source: 'manual' | 'screenshot' = 'manual',
  ) {
    if (!Number.isFinite(amount) || amount < 0)
      throw new BadRequestException('现金余额不能为负数');
    return this.prisma.$transaction(async (transaction) => {
      const account = await this.assertAccountWithClient(transaction, accountId);
      if (account.currency !== 'CNY')
        throw new BadRequestException('当前录入只支持人民币现金余额');
      const result = await appendLedgerEvent(transaction, {
        version: 1,
        id: crypto.randomUUID(),
        accountId,
        type: 'ADJUSTMENT',
        occurredAt: new Date().toISOString(),
        amount,
        currency: 'CNY',
        source,
        externalUid: `${source}:cash:${accountId}:${crypto.randomUUID()}`,
        note: '保存当前现金余额',
        metadata: { kind: 'cash-balance', amount, source },
      });
      await this.rebuildWithClient(transaction, accountId, 'AVG');
      return result;
    });
  }

  async migratePositions(accountId?: string) {
    return this.prisma.$transaction(async (transaction) => {
      const positions = await transaction.position.findMany({
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
        await this.upsertAssetWithClient(
          transaction,
          position.symbol,
          position.symbol,
          inferAssetType(position.symbol),
          MANUAL_IDENTITY_SOURCE,
        );
        await appendLedgerEvent(transaction, {
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
          metadata: {
            kind: 'position-balance',
            migratedPositionId: position.id,
            quantity: Number(position.quantity),
            costPrice: Number(position.costPrice),
          },
        });
        migrated.push({
          accountId: position.accountId,
          symbol: position.symbol,
          quantity: Number(position.quantity),
          costPrice: Number(position.costPrice),
        });
      }
      const accountIds = [...new Set(migrated.map((item) => item.accountId))];
      const projections = [];
      for (const id of accountIds)
        projections.push(await this.rebuildWithClient(transaction, id, 'AVG'));
      return { migrated, accounts: accountIds, projections };
    });
  }

  async rebuild(accountId: string, method: 'AVG' | 'FIFO' = 'AVG') {
    return this.prisma.$transaction((transaction) =>
      this.rebuildWithClient(transaction, accountId, method),
    );
  }

  private async rebuildWithClient(
    client: Pick<LedgerTransactionClient, 'ledgerEvent' | 'position'>,
    accountId: string,
    method: 'AVG' | 'FIFO',
  ) {
    const stored = await client.ledgerEvent.findMany({
      where: { accountId },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
    const events = toDomainEvents(stored);
    const projected = method === 'AVG' ? projectAverageCost(events) : projectFifo(events);
    const sourceBySymbol = new Map<string, string>();
    for (const event of events) {
      if (event.type === 'ADJUSTMENT' && event.symbol && event.source)
        sourceBySymbol.set(event.symbol, event.source);
    }
    await client.position.deleteMany({ where: { accountId } });
    for (const position of projected) {
      if (position.quantity <= 0) continue;
      await client.position.create({
        data: {
          accountId,
          symbol: position.symbol,
          quantity: position.quantity,
          costPrice: position.averageCost,
          source: sourceBySymbol.get(position.symbol) ?? 'ledger',
        },
      });
    }
    return projected;
  }

  async list(accountId: string) {
    return this.prisma.ledgerEvent.findMany({
      where: { accountId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
