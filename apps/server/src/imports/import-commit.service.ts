import { BadRequestException, ConflictException, Injectable, Optional } from '@nestjs/common';
import { normalizeSymbol } from '@thesis-ledger/domain';
import {
  assetIdentitySourceSchema,
  assetIdentityStatusSchema,
  importDraftSchema,
} from '@thesis-ledger/schemas';
import {
  appendLedgerEvent,
  assertSymbolMatchesAssetType,
  LedgerService,
} from '../ledger/ledger.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { assertAccountCanHoldAsset } from '../portfolio/accounts.service.js';
import { readAccount, readLedgerEvents, stableBaselineHash } from './import-state.js';
import { screenshotSources, type ScreenshotSource } from './screenshot-source.js';
import { inferAssetType, validateVisionPosition } from './vision-validation.js';

const CONFIRMED_IDENTITY_STATUS = assetIdentityStatusSchema.enum.confirmed;
const SCREENSHOT_IDENTITY_SOURCE = assetIdentitySourceSchema.enum.screenshot;

@Injectable()
export class ImportCommitService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ledger?: LedgerService,
  ) {}

  async commit(id: string, reviewedRows: unknown[], reviewedSource?: ScreenshotSource) {
    if (reviewedSource !== undefined && !screenshotSources.includes(reviewedSource))
      throw new BadRequestException('截图来源无效');
    const result = await this.prisma.$transaction(async (transaction) => {
      const draft = await transaction.importDraft.findUnique({ where: { id } });
      if (!draft) throw new BadRequestException('导入草稿不存在');
      if (draft.status === 'committed') return draft;
      const account = await readAccount(transaction, draft.accountId);
      if (account) {
        if (account.active === false) throw new BadRequestException('账户已停用，不能提交导入');
        if (account.type === 'cash') throw new BadRequestException('现金账户不支持截图导入');
        if (account.currency !== 'CNY')
          throw new BadRequestException('历史非人民币账户只读，请先转换为 CNY');
      }
      if (draft.baselineHash) {
        const currentHash = stableBaselineHash(
          await readLedgerEvents(transaction, draft.accountId),
        );
        if (currentHash !== draft.baselineHash)
          throw new ConflictException('草稿创建后 Ledger 已变化，请重新建立基线');
      }
      const rows = reviewedRows.map((row) => importDraftSchema.shape.rows.element.parse(row));
      const normalizedRows = rows.map((row) => {
        if (!row.symbol) return row;
        const raw = row.symbol.trim().toUpperCase();
        let symbol: string;
        try {
          symbol = raw.endsWith('.OF') ? raw : normalizeSymbol(raw).symbol;
        } catch {
          throw new BadRequestException(`无法识别资产代码：${row.symbol}`);
        }
        const assetType = inferAssetType(symbol, row.assetType) ?? 'stock';
        assertSymbolMatchesAssetType(symbol, assetType);
        return { ...row, symbol, assetType };
      });
      const symbols = normalizedRows
        .map((row) => row.symbol)
        .filter((symbol): symbol is string => Boolean(symbol));
      if (new Set(symbols).size !== symbols.length)
        throw new BadRequestException('同一草稿不能包含重复证券代码');
      if (
        normalizedRows.some((row) => {
          const issues = validateVisionPosition({
            ...(row.symbol ? { symbol: row.symbol } : {}),
            ...(row.rawName ? { name: row.rawName } : {}),
            ...(row.quantity === undefined ? {} : { quantity: row.quantity }),
            ...(row.costPrice === undefined ? {} : { costPrice: row.costPrice }),
            ...(row.marketPrice === undefined ? {} : { marketPrice: row.marketPrice }),
            ...(row.marketValue === undefined ? {} : { marketValue: row.marketValue }),
            ...(row.profit === undefined ? {} : { profit: row.profit }),
            ...(row.profitRate === undefined ? {} : { profitRate: row.profitRate }),
            confidence: row.confidence,
            rawText: row.rawText,
          });
          return (
            issues.length > 0 ||
            !row.symbol ||
            row.quantity === undefined ||
            row.costPrice === undefined
          );
        })
      )
        throw new BadRequestException('仍有未解决的导入问题');
      for (const row of normalizedRows) {
        const symbol = row.symbol;
        if (!symbol) throw new BadRequestException('导入行缺少证券代码');
        const quantity = row.quantity;
        if (quantity === undefined) throw new BadRequestException('导入行缺少数量');
        const assetType = inferAssetType(symbol, row.assetType) ?? 'stock';
        if (account) assertAccountCanHoldAsset(account as { type: string }, assetType);
        const existing =
          typeof (transaction.asset as { findUnique?: unknown }).findUnique === 'function'
            ? await transaction.asset.findUnique({ where: { symbol } })
            : null;
        if (
          existing &&
          existing.identityStatus === CONFIRMED_IDENTITY_STATUS &&
          existing.assetType !== assetType
        )
          throw new ConflictException('已确认的资产类型不能被截图导入覆盖');
        await transaction.asset.upsert({
          where: { symbol },
          update:
            existing?.identityStatus === CONFIRMED_IDENTITY_STATUS
              ? {}
              : {
                  ...(row.rawName ? { name: row.rawName } : {}),
                  assetType,
                  identityStatus: CONFIRMED_IDENTITY_STATUS,
                  identitySource: SCREENSHOT_IDENTITY_SOURCE,
                },
          create: {
            symbol,
            name: row.rawName ?? symbol,
            market: 'CN',
            assetType,
            currency: 'CNY',
            identityStatus: CONFIRMED_IDENTITY_STATUS,
            identitySource: SCREENSHOT_IDENTITY_SOURCE,
          },
        });
        await appendLedgerEvent(transaction, {
          version: 1,
          id: crypto.randomUUID(),
          accountId: draft.accountId,
          type: 'ADJUSTMENT',
          occurredAt: new Date().toISOString(),
          symbol,
          quantity: quantity > 0 ? quantity : undefined,
          price: row.costPrice,
          currency: 'CNY',
          source: `screenshot:${draft.source}`,
          externalUid: `screenshot:${draft.id}:${symbol}`,
          correctionOf: draft.id,
          note: '截图导入当前持仓余额',
          metadata: {
            kind: 'opening-balance',
            importDraftId: draft.id,
            quantity: row.quantity,
            costPrice: row.costPrice,
            assetType,
          },
        });
      }
      return transaction.importDraft.update({
        where: { id },
        data: {
          status: 'committed',
          rows: normalizedRows,
          committedAt: new Date(),
          ...(reviewedSource === undefined
            ? {}
            : {
                source: reviewedSource,
                sourceConfidence: reviewedSource === 'unknown' ? 0 : 1,
              }),
        },
      });
    });
    if (this.ledger) await this.ledger.rebuild(result.accountId);
    return result;
  }
}
