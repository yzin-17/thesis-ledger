import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { normalizeSymbol } from '@investment-os/domain';
import { importDraftSchema, type ImportDraft } from '@investment-os/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { appendLedgerEvent, LedgerService } from '../ledger/ledger.service.js';

export type ScreenshotSource = 'alipay' | 'ths' | 'broker' | 'unknown';

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
  return 'unknown';
};

export const validateVisionPosition = (row: VisionPosition) => {
  const issues: string[] = [];
  if (row.quantity === undefined || row.quantity <= 0) issues.push('数量缺失或非法');
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
        const normalized = normalizeSymbol(row.symbol);
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
    const imageHash = createHash('sha256').update(image).digest('hex');
    const idempotencyKey = createHash('sha256').update(`${accountId}:${imageHash}`).digest('hex');
    const existing = await this.prisma.importDraft.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const rows = await Promise.all(
      extracted.map(async (row) => {
        const match = await this.matchAsset(row);
        return {
          rawSymbol: row.symbol ?? '',
          rawName: row.name,
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
    const draft: ImportDraft = importDraftSchema.parse({
      id: crypto.randomUUID(),
      accountId,
      source,
      sourceConfidence,
      status: 'pending',
      idempotencyKey,
      rows,
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
        beforeState,
      },
    });
  }

  async commit(id: string, reviewedRows: unknown[], reviewedSource?: ScreenshotSource) {
    if (
      reviewedSource !== undefined &&
      !(['alipay', 'ths', 'broker', 'unknown'] as const).includes(reviewedSource)
    )
      throw new BadRequestException('截图来源无效');
    const result = await this.prisma.$transaction(async (transaction) => {
      const draft = await transaction.importDraft.findUnique({ where: { id } });
      if (!draft) throw new NotFoundException('导入草稿不存在');
      if (draft.status === 'committed') return draft;
      const rows = reviewedRows.map((row) => importDraftSchema.shape.rows.element.parse(row));
      if (
        rows.some((row) => {
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
      for (const row of rows) {
        const symbol = row.symbol;
        if (!symbol) throw new BadRequestException('导入行缺少证券代码');
        await transaction.asset.upsert({
          where: { symbol },
          update: { ...(row.rawName ? { name: row.rawName } : {}) },
          create: {
            symbol,
            name: row.rawName ?? symbol,
            market: symbol.endsWith('.HK') ? 'HK' : 'CN',
            assetType: 'stock',
            currency: 'CNY',
          },
        });
        await appendLedgerEvent(transaction, {
          version: 1,
          id: crypto.randomUUID(),
          accountId: draft.accountId,
          type: 'ADJUSTMENT',
          occurredAt: new Date().toISOString(),
          symbol: row.symbol,
          quantity: row.quantity,
          price: row.costPrice,
          currency: 'CNY',
          source: `screenshot:${draft.source}`,
          externalUid: `screenshot:${draft.id}:${row.symbol}`,
          correctionOf: draft.id,
          note: '截图导入开仓余额',
          metadata: {
            kind: 'opening-balance',
            importDraftId: draft.id,
            quantity: row.quantity,
            costPrice: row.costPrice,
          },
        });
      }
      const updated = await transaction.importDraft.update({
        where: { id },
        data: {
          status: 'committed',
          rows,
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
      const before = Array.isArray(draft.beforeState) ? draft.beforeState : [];
      const rows = Array.isArray(draft.rows) ? draft.rows : [];
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        if (typeof row.symbol !== 'string') continue;
        await appendLedgerEvent(transaction, {
          version: 1,
          id: crypto.randomUUID(),
          accountId: draft.accountId,
          type: 'ADJUSTMENT',
          occurredAt: new Date().toISOString(),
          symbol: row.symbol,
          currency: 'CNY',
          source: 'screenshot:rollback',
          externalUid: `screenshot:${draft.id}:rollback:${row.symbol}`,
          correctionOf: draft.id,
          note: '回滚截图导入',
          metadata: { kind: 'rollback', importDraftId: draft.id, quantity: 0, costPrice: 0 },
        });
      }
      for (const item of before) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        if (typeof item.symbol !== 'string') continue;
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
