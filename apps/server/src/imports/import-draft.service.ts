import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { importDraftSchema, type ImportDraft } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { AssetMatcherService } from './asset-matcher.service.js';
import { readAccount, readLedgerEvents, stableBaselineHash } from './import-state.js';
import type { ScreenshotSource } from './screenshot-source.js';
import {
  inferAssetType,
  validateVisionPosition,
  type PositionVisionProvider,
  type VisionPosition,
} from './vision-validation.js';

@Injectable()
export class ImportDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matcher: AssetMatcherService,
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
        const match = await this.matcher.matchAsset(row);
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

  history(accountId: string) {
    return this.prisma.importDraft.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
