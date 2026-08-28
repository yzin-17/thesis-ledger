import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  assetIdentitySourceSchema,
  assetIdentityStatusSchema,
  currencySchema,
  nonNegativeDecimalStringSchema,
  type CurrencyV1,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { assertAccountCanHoldAsset } from '../portfolio/accounts.service.js';
import { inferAssetType } from './asset-type.js';
import { LedgerV2Repository } from './ledger-v2.repository.js';
import { rebuildLedgerProjection } from './ledger-projection.js';

const CONFIRMED_IDENTITY_STATUS = assetIdentityStatusSchema.enum.confirmed;
const MANUAL_IDENTITY_SOURCE = assetIdentitySourceSchema.enum.manual;
const SCREENSHOT_IDENTITY_SOURCE = assetIdentitySourceSchema.enum.screenshot;

type LedgerTransactionClient = Prisma.TransactionClient;

type PositionBaselineTemporal = {
  observedAt?: string;
  capturedAt?: string;
  timePrecision?: 'INSTANT' | 'DATE' | 'UNKNOWN';
  sourceTimezone?: string;
};

type SetPositionOptions = {
  assetName?: string;
  assetType?: 'stock' | 'etf' | 'fund';
  temporal?: PositionBaselineTemporal;
};

export const assertSymbolMatchesAssetType = (symbol: string, assetType: string) => {
  if (symbol.endsWith('.OF') && assetType !== 'fund')
    throw new BadRequestException('场外基金代码必须使用基金资产类型');
  if (!symbol.endsWith('.OF') && assetType === 'fund')
    throw new BadRequestException('基金资产类型必须使用 .OF 场外基金代码');
};

const sourceCategory = (source: 'manual' | 'migration' | 'screenshot') => {
  if (source === 'migration') return 'MIGRATION' as const;
  if (source === 'screenshot') return 'IMPORT' as const;
  return 'MANUAL' as const;
};

const assetMarket = (symbol: string) => {
  if (symbol.endsWith('.HK')) return 'HK';
  return 'CN';
};

export const assertWritableAccount = <
  T extends { active: boolean; currency: string; type: string },
>(
  account: T | null,
  assetType?: string,
) => {
  if (!account) throw new BadRequestException('账户不存在');
  if (!account.active) throw new BadRequestException('账户已停用，不能新增录入');
  if (assetType) assertAccountCanHoldAsset(account, assetType);
  return account;
};

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: LedgerV2Repository,
  ) {}

  append(rawInput: unknown) {
    void rawInput;
    return Promise.reject(
      new BadRequestException('旧通用 LedgerEvent 写入入口已停用，请使用专用 V2 命令'),
    );
  }

  private async assertAccountWithClient(
    client: Pick<LedgerTransactionClient, 'account'>,
    accountId: string,
    assetType?: string,
  ) {
    const account = await client.account.findUnique({ where: { id: accountId } });
    return assertWritableAccount(account, assetType);
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
        market: assetMarket(symbol),
        assetType,
        currency: 'CNY',
        identityStatus: CONFIRMED_IDENTITY_STATUS,
        identitySource,
      },
    });
  }

  private async appendPositionBaselineWithClient(
    context: Parameters<LedgerV2Repository['appendRevision']>[0],
    accountId: string,
    symbol: string,
    quantity: string,
    costPrice: string,
    source: 'manual' | 'migration' | 'screenshot',
    reason: string,
    options: SetPositionOptions | undefined,
    batchId: string,
    recordedAt: string,
  ) {
    const assetType = inferAssetType(symbol, options?.assetType);
    const timePrecision = options?.temporal?.timePrecision ?? 'INSTANT';
    const unknownSourceTime = timePrecision === 'UNKNOWN';
    const observedAt = unknownSourceTime ? null : (options?.temporal?.observedAt ?? recordedAt);
    const capturedAt = unknownSourceTime
      ? options?.temporal?.capturedAt
      : (options?.temporal?.capturedAt ?? recordedAt);
    const sourceTimezone =
      options?.temporal?.sourceTimezone ?? (unknownSourceTime ? 'UNKNOWN' : 'UTC');
    const contentHash = createHash('sha256')
      .update(JSON.stringify({ accountId, symbol, quantity, costPrice, source, reason }))
      .digest('hex');

    await this.assertAccountWithClient(context.transaction, accountId, assetType);
    await this.upsertAssetWithClient(
      context.transaction,
      symbol,
      options?.assetName,
      assetType,
      source === 'screenshot' ? SCREENSHOT_IDENTITY_SOURCE : MANUAL_IDENTITY_SOURCE,
    );
    await context.transaction.baselineObservationBatch.create({
      data: {
        id: batchId,
        accountId,
        scope: 'PARTIAL',
        ...(observedAt ? { observedAt: new Date(observedAt) } : {}),
        timePrecision,
        ...(capturedAt ? { capturedAt: new Date(capturedAt) } : {}),
        sourceCategory: sourceCategory(source),
        sourceChannel: source,
        externalId: `${source}:position:${accountId}:${symbol}:${batchId}`,
        evidenceRef: `manual-baseline://${batchId}`,
        contentHash,
        status: 'SUBMITTED',
        submittedAt: new Date(recordedAt),
      },
    });
    return this.repository.appendRevision(context, {
      version: 2,
      eventId: randomUUID(),
      factId: randomUUID(),
      accountId,
      ledgerRevision: context.nextLedgerRevision.toString(),
      type: 'POSITION_BASELINE_OBSERVATION',
      occurredAt: observedAt,
      timePrecision,
      sourceTimezone,
      economicOrderKey: `baseline:${batchId}:000000`,
      recordedAt,
      payloadVersion: 1,
      source: {
        category: sourceCategory(source),
        channel: source,
        externalId: `${source}:position:${accountId}:${symbol}:${batchId}`,
      },
      actorId: source,
      revisionAction: 'CREATE',
      reason,
      payload: {
        symbol,
        batchId,
        batchScope: 'PARTIAL',
        quantity,
        averageCost: costPrice,
        currency: 'CNY',
        costIncludesFees: 'UNKNOWN',
        ...(capturedAt ? { capturedAt } : {}),
      },
    });
  }

  async setPosition(
    accountId: string,
    symbol: string,
    quantity: string,
    costPrice: string,
    source: 'manual' | 'migration' | 'screenshot',
    reason: string,
    options?: SetPositionOptions,
  ) {
    nonNegativeDecimalStringSchema.parse(quantity);
    nonNegativeDecimalStringSchema.parse(costPrice);
    const assetType = inferAssetType(symbol, options?.assetType);
    assertSymbolMatchesAssetType(symbol, assetType);
    const batchId = randomUUID();
    const recordedAt = new Date().toISOString();
    const result = await this.repository.withAccountWrite(accountId, async (context) => {
      const event = await this.appendPositionBaselineWithClient(
        context,
        accountId,
        symbol,
        quantity,
        costPrice,
        source,
        reason,
        options,
        batchId,
        recordedAt,
      );
      await this.rebuildWithClient(
        context.transaction,
        accountId,
        'AVG',
        context.nextProjectionGeneration,
      );
      return { value: event, advanceRevision: true };
    });
    return result.value;
  }

  async setCashBalance(
    accountId: string,
    amount: string,
    source: 'manual' | 'screenshot' = 'manual',
    currency?: CurrencyV1,
  ) {
    nonNegativeDecimalStringSchema.parse(amount);
    const recordedAt = new Date().toISOString();
    const result = await this.repository.withAccountWrite(accountId, async (context) => {
      const account = await this.assertAccountWithClient(context.transaction, accountId);
      const cashCurrency = currency ?? currencySchema.parse(account.currency);
      const event = await this.repository.appendRevision(context, {
        version: 2,
        eventId: randomUUID(),
        factId: randomUUID(),
        accountId,
        ledgerRevision: context.nextLedgerRevision.toString(),
        type: 'CASH_BALANCE_OBSERVATION',
        occurredAt: recordedAt,
        timePrecision: 'INSTANT',
        sourceTimezone: 'UTC',
        economicOrderKey: `cash-baseline:${recordedAt}`,
        recordedAt,
        payloadVersion: 1,
        source: {
          category: source === 'screenshot' ? 'IMPORT' : 'MANUAL',
          channel: source,
          externalId: `${source}:cash:${accountId}:${randomUUID()}`,
        },
        actorId: source,
        revisionAction: 'CREATE',
        reason: '保存当前现金余额',
        payload: { currency: cashCurrency, amount, capturedAt: recordedAt },
      });
      await this.rebuildWithClient(
        context.transaction,
        accountId,
        'AVG',
        context.nextProjectionGeneration,
      );
      return { value: event, advanceRevision: true };
    });
    return result.value;
  }

  async migratePositions(accountId?: string) {
    const accountIds = accountId
      ? [accountId]
      : (await this.prisma.account.findMany({ select: { id: true } })).map((account) => account.id);
    if (accountIds.length === 0) return { migrated: [], accounts: [], projections: [] };

    const result = await this.repository.withAccountsWrite(accountIds, async (contexts) => {
      const migrated: Array<{
        accountId: string;
        symbol: string;
        quantity: string;
        costPrice: string;
      }> = [];
      const projections: Array<Awaited<ReturnType<typeof rebuildLedgerProjection>>> = [];
      const advanceAccountIds: string[] = [];
      for (const id of [...new Set(accountIds)].sort()) {
        const context = contexts.get(id);
        if (!context) throw new Error(`缺少账户账本上下文: ${id}`);
        const currentPositions = await context.transaction.position.findMany({
          where: { accountId: id },
          orderBy: { symbol: 'asc' },
        });
        for (const position of currentPositions) {
          const quantity = position.quantity.toString();
          const costPrice = position.costPrice.toString();
          await this.appendPositionBaselineWithClient(
            context,
            id,
            position.symbol,
            quantity,
            costPrice,
            'migration',
            `迁移 Position ${position.id} 为 Baseline Observation`,
            { temporal: { timePrecision: 'UNKNOWN', sourceTimezone: 'UNKNOWN' } },
            randomUUID(),
            new Date().toISOString(),
          );
          migrated.push({ accountId: id, symbol: position.symbol, quantity, costPrice });
        }
        projections.push(
          await rebuildLedgerProjection(
            context.transaction,
            id,
            'AVG',
            context.nextProjectionGeneration,
          ),
        );
        if (currentPositions.length > 0) advanceAccountIds.push(id);
      }
      return {
        value: { migrated, accounts: [...new Set(accountIds)].sort(), projections },
        advanceAccountIds,
      };
    });
    return result.value;
  }

  async rebuild(accountId: string, method: 'AVG' | 'FIFO' = 'AVG') {
    if (typeof this.repository.withAccountWrite === 'function') {
      const result = await this.repository.withAccountWrite(accountId, async (context) => ({
        value: await this.rebuildWithClient(
          context.transaction,
          accountId,
          method,
          context.currentProjectionGeneration,
        ),
        advanceRevision: false,
      }));
      return result.value;
    }
    return this.prisma.$transaction((transaction) =>
      this.rebuildWithClient(transaction, accountId, method),
    );
  }

  private async rebuildWithClient(
    client: LedgerTransactionClient,
    accountId: string,
    method: 'AVG' | 'FIFO',
    projectionGeneration?: bigint,
  ) {
    return rebuildLedgerProjection(client, accountId, method, projectionGeneration);
  }

  async list(accountId: string) {
    return this.prisma.ledgerEvent.findMany({
      where: { accountId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
