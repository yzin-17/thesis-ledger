import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { normalizeSymbol } from '@thesis-ledger/domain';
import { importDraftSchema, type ImportDraft } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import {
  appendLedgerEvent,
  assertSymbolMatchesAssetType,
  LedgerService,
} from '../ledger/ledger.service.js';
import { assertAccountCanHoldAsset } from '../portfolio/accounts.service.js';

export type ScreenshotSource = 'alipay' | 'ths' | 'broker' | 'bank' | 'fund-platform' | 'unknown';

export interface VisionPosition {
  symbol?: string;
  name?: string;
  quantity?: number;
  costPrice?: number;
  marketValue?: number;
  marketPrice?: number;
  profit?: number;
  profitRate?: number;
  confidence: number;
  rawText?: Record<string, string>;
}

export interface PositionVisionProvider {
  readonly id: string;
  extract(image: Uint8Array, source: ScreenshotSource): Promise<VisionPosition[]>;
}

export const detectScreenshotSource = (text: string): ScreenshotSource => {
  const normalized = text.toLowerCase();
  if (normalized.includes('支付宝') || normalized.includes('蚂蚁财富')) return 'alipay';
  if (normalized.includes('同花顺') || normalized.includes('ths')) return 'ths';
  if (normalized.includes('证券') || normalized.includes('券商')) return 'broker';
  if (normalized.includes('银行') || normalized.includes('bank')) return 'bank';
  if (normalized.includes('基金') || normalized.includes('fund')) return 'fund-platform';
  return 'unknown';
};

const inferAssetType = (symbol?: string, explicit?: string) => {
  if (explicit) return explicit;
  if (!symbol) return undefined;
  if (symbol.endsWith('.OF')) return 'fund';
  return /^[15]\d{5}\.(SH|SZ|BJ)$/.test(symbol) ? 'etf' : 'stock';
};

const stableBaselineHash = (events: unknown[]) => {
  const normalized = events.map((event) => {
    if (!event || typeof event !== 'object') return event;
    const item = event as Record<string, unknown>;
    return {
      id: item.id,
      type: item.type,
      occurredAt: item.occurredAt instanceof Date ? item.occurredAt.toISOString() : item.occurredAt,
      symbol: item.symbol,
      quantity: item.quantity === null ? null : Number(item.quantity ?? 0),
      price: item.price === null ? null : Number(item.price ?? 0),
      amount: item.amount === null ? null : Number(item.amount ?? 0),
      source: item.source,
      correctionOf: item.correctionOf,
      metadata: item.metadata,
    };
  }) as Array<Record<string, unknown>>;
  return createHash('sha256')
    .update(JSON.stringify(normalized.sort((a, b) => String(a.id).localeCompare(String(b.id)))))
    .digest('hex');
};

const readLedgerEvents = async (client: unknown, accountId: string) => {
  const delegate = (
    client as { ledgerEvent?: { findMany?: (args: unknown) => Promise<unknown[]> } }
  ).ledgerEvent;
  if (!delegate || typeof delegate.findMany !== 'function') return [];
  return delegate.findMany({
    where: { accountId },
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
  });
};

const readAccount = async (client: unknown, accountId: string) => {
  const delegate = (
    client as {
      account?: { findUnique?: (args: unknown) => Promise<Record<string, unknown> | null> };
    }
  ).account;
  if (!delegate || typeof delegate.findUnique !== 'function') return null;
  return delegate.findUnique({ where: { id: accountId } });
};

export const validateVisionPosition = (row: VisionPosition) => {
  const issues: string[] = [];
  if (row.quantity === undefined || row.quantity < 0) issues.push('数量缺失或非法');
  if (row.costPrice === undefined || row.costPrice < 0) issues.push('成本价缺失或非法');
  if (
    row.marketValue !== undefined &&
    row.quantity !== undefined &&
    row.marketPrice !== undefined
  ) {
    const expected = row.quantity * row.marketPrice;
    if (expected > 0 && Math.abs(row.marketValue - expected) / expected > 0.02)
      issues.push('市值与数量、市场价不一致');
  }
  if (
    row.profit !== undefined &&
    row.quantity !== undefined &&
    row.costPrice !== undefined &&
    row.marketPrice !== undefined
  ) {
    const expected = row.quantity * (row.marketPrice - row.costPrice);
    if (Math.abs(row.profit - expected) > Math.max(0.01, Math.abs(expected) * 0.02))
      issues.push('盈亏与数量、成本价、市场价不一致');
  }
  if (
    row.profitRate !== undefined &&
    row.costPrice !== undefined &&
    row.marketPrice !== undefined &&
    row.costPrice > 0
  ) {
    const expected = row.marketPrice / row.costPrice - 1;
    if (Math.abs(row.profitRate - expected) > 0.005) issues.push('盈亏比例不一致');
  }
  if (row.confidence < 0.75) issues.push('识别置信度较低');
  return issues;
};

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ledger?: LedgerService,
  ) {}

  async createDraftFromProvider(
    accountId: string,
    image: Uint8Array,
    source: ScreenshotSource,
    provider: PositionVisionProvider,
    sourceConfidence?: number,
  ) {
    const extracted = await provider.extract(image, source);
    return this.createDraft(accountId, image, source, extracted, sourceConfidence);
  }

  async matchAsset(row: VisionPosition) {
    if (row.symbol) {
      try {
        const raw = row.symbol.trim().toUpperCase();
        const normalized = raw.endsWith('.OF') ? { symbol: raw } : normalizeSymbol(raw);
        const asset = await this.prisma.asset.findUnique({ where: { symbol: normalized.symbol } });
        if (asset)
          return {
            status: 'matched' as const,
            asset,
            candidates: [asset.symbol],
            reason: '代码精确匹配',
          };
      } catch {
        /* 回退到名称匹配 */
      }
    }
    if (!row.name)
      return {
        status: 'unmatched' as const,
        asset: null,
        candidates: [],
        reason: '缺少代码和名称',
      };
    const candidates = await this.prisma.asset.findMany({
      where: { name: { equals: row.name.trim(), mode: 'insensitive' } },
      take: 5,
    });
    if (candidates.length === 1)
      return {
        status: 'matched' as const,
        asset: candidates[0]!,
        candidates: [candidates[0]!.symbol],
        reason: '名称精确匹配',
      };
    if (candidates.length > 1)
      return {
        status: 'ambiguous' as const,
        asset: null,
        candidates: candidates.map((asset) => asset.symbol),
        reason: '名称对应多个标的，需要人工确认',
      };
    return { status: 'unmatched' as const, asset: null, candidates: [], reason: '未找到资产' };
  }

  async createDraft(
    accountId: string,
    image: Uint8Array,
    source: ScreenshotSource,
    extracted: VisionPosition[],
    sourceConfidence = source === 'unknown' ? 0 : 1,
  ) {
    if (image.byteLength === 0 || image.byteLength > 10 * 1024 * 1024)
      throw new BadRequestException('截图大小必须在 1 字节到 10MB 之间');
    const account = await readAccount(this.prisma, accountId);
    if (account) {
      if (account.active === false) throw new BadRequestException('账户已停用，不能创建导入草稿');
      if (account.type === 'cash') throw new BadRequestException('现金账户不支持截图导入');
      if (account.currency !== 'CNY')
        throw new BadRequestException('历史非人民币账户只读，请先转换为 CNY');
    }
    const imageHash = createHash('sha256').update(image).digest('hex');
    const idempotencyKey = createHash('sha256').update(`${accountId}:${imageHash}`).digest('hex');
    const existing = await this.prisma.importDraft.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const rows = await Promise.all(
      extracted.map(async (row) => {
        const match = await this.matchAsset(row);
        const symbol = match.asset?.symbol ?? row.symbol?.trim().toUpperCase();
        const assetType = inferAssetType(symbol, match.asset?.assetType);
        return {
          rawSymbol: row.symbol ?? '',
          rawName: row.name,
          assetType,
          symbol: match.asset?.symbol,
          matchStatus: match.status,
          matchCandidates: match.candidates,
          quantity: row.quantity,
          costPrice: row.costPrice,
          marketValue: row.marketValue,
          marketPrice: row.marketPrice,
          profit: row.profit,
          profitRate: row.profitRate,
          confidence: row.confidence,
          rawText: row.rawText ?? {},
          issues: [
            ...validateVisionPosition(row),
            ...(match.status === 'matched' ? [] : [match.reason]),
          ],
        };
      }),
    );
    const baselineEvents = await readLedgerEvents(this.prisma, accountId);
    const draft: ImportDraft = importDraftSchema.parse({
      id: crypto.randomUUID(),
      accountId,
      source,
      sourceConfidence,
      status: 'pending',
      idempotencyKey,
      rows,
      baselineHash: stableBaselineHash(baselineEvents),
      createdAt: new Date().toISOString(),
    });
    const beforeState = (await this.prisma.position.findMany({ where: { accountId } })).map(
      (position) => ({
        symbol: position.symbol,
        quantity: Number(position.quantity),
        costPrice: Number(position.costPrice),
      }),
    );
    return this.prisma.importDraft.create({
      data: {
        id: draft.id,
        accountId,
        source,
        sourceConfidence,
        status: draft.status,
        idempotencyKey,
        imageHash,
        rows: draft.rows,
        ...(draft.baselineHash === undefined ? {} : { baselineHash: draft.baselineHash }),
        beforeState,
      },
    });
  }

  async rebaseline(id: string) {
    const draft = await this.prisma.importDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException('导入草稿不存在');
    if (!['pending', 'reviewed'].includes(draft.status))
      throw new BadRequestException('只有待审核草稿可以重新建立基线');
    const [events, positions] = await Promise.all([
      readLedgerEvents(this.prisma, draft.accountId),
      this.prisma.position.findMany({ where: { accountId: draft.accountId } }),
    ]);
    return this.prisma.importDraft.update({
      where: { id },
      data: {
        baselineHash: stableBaselineHash(events),
        beforeState: positions.map((position) => ({
          symbol: position.symbol,
          quantity: Number(position.quantity),
          costPrice: Number(position.costPrice),
        })),
      },
    });
  }

  async commit(id: string, reviewedRows: unknown[], reviewedSource?: ScreenshotSource) {
    const allowedSources: ScreenshotSource[] = [
      'alipay',
      'ths',
      'broker',
      'bank',
      'fund-platform',
      'unknown',
    ];
    if (reviewedSource !== undefined && !allowedSources.includes(reviewedSource))
      throw new BadRequestException('截图来源无效');
    const result = await this.prisma.$transaction(async (transaction) => {
      const draft = await transaction.importDraft.findUnique({ where: { id } });
      if (!draft) throw new NotFoundException('导入草稿不存在');
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
          existing.identityStatus === 'user-confirmed' &&
          existing.assetType !== assetType
        )
          throw new ConflictException('已确认的资产类型不能被截图导入覆盖');
        await transaction.asset.upsert({
          where: { symbol },
          update: {
            ...(row.rawName ? { name: row.rawName } : {}),
            ...(existing?.identityStatus === 'user-confirmed'
              ? {}
              : { assetType, identityStatus: 'user-confirmed', identitySource: 'screenshot' }),
          },
          create: {
            symbol,
            name: row.rawName ?? symbol,
            market: symbol.endsWith('.HK') ? 'HK' : 'CN',
            assetType,
            currency: 'CNY',
            identityStatus: 'user-confirmed',
            identitySource: 'screenshot',
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
      const updated = await transaction.importDraft.update({
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
      return updated;
    });
    if (this.ledger) await this.ledger.rebuild(result.accountId);
    return result;
  }

  history(accountId: string) {
    return this.prisma.importDraft.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async rollback(id: string) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const draft = await transaction.importDraft.findUnique({ where: { id } });
      if (!draft || draft.status !== 'committed')
        throw new BadRequestException('只能回滚已提交的导入');
      const before = (Array.isArray(draft.beforeState) ? draft.beforeState : []) as Array<{
        symbol?: unknown;
        quantity?: unknown;
        costPrice?: unknown;
      }>;
      const rows = (Array.isArray(draft.rows) ? draft.rows : []) as unknown[];
      const submittedSymbols = new Set(
        rows
          .filter((row): row is Record<string, unknown> =>
            Boolean(row && typeof row === 'object' && !Array.isArray(row)),
          )
          .map((row) => (typeof row.symbol === 'string' ? row.symbol : ''))
          .filter(Boolean),
      );
      for (const symbol of submittedSymbols) {
        await appendLedgerEvent(transaction, {
          version: 1,
          id: crypto.randomUUID(),
          accountId: draft.accountId,
          type: 'ADJUSTMENT',
          occurredAt: new Date().toISOString(),
          symbol,
          currency: 'CNY',
          source: 'screenshot:rollback',
          externalUid: `screenshot:${draft.id}:rollback:${symbol}`,
          correctionOf: draft.id,
          note: '回滚截图导入',
          metadata: { kind: 'rollback', importDraftId: draft.id, quantity: 0, costPrice: 0 },
        });
      }
      for (const item of before) {
        if (typeof item.symbol !== 'string' || !submittedSymbols.has(item.symbol)) continue;
        await appendLedgerEvent(transaction, {
          version: 1,
          id: crypto.randomUUID(),
          accountId: draft.accountId,
          type: 'ADJUSTMENT',
          occurredAt: new Date().toISOString(),
          symbol: item.symbol,
          quantity: Number(item.quantity),
          price: Number(item.costPrice),
          currency: 'CNY',
          source: 'screenshot:rollback',
          externalUid: `screenshot:${draft.id}:rollback:before:${item.symbol}`,
          correctionOf: draft.id,
          note: '恢复截图导入前持仓',
          metadata: {
            kind: 'rollback',
            importDraftId: draft.id,
            quantity: Number(item.quantity),
            costPrice: Number(item.costPrice),
          },
        });
      }
      const updated = await transaction.importDraft.update({
        where: { id },
        data: { status: 'cancelled', rolledBackAt: new Date() },
      });
      return updated;
    });
    if (this.ledger) await this.ledger.rebuild(result.accountId);
    return result;
  }
}
