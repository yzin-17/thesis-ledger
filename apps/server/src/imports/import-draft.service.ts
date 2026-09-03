import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { currencySchema, importDraftSchema, type ImportDraft } from '@thesis-ledger/schemas';
import type { ImportDraftOptions } from '../ledger/import-draft.types.js';
import { PrismaService } from '../platform/prisma.service.js';
import { AssetMatcherService } from './asset-matcher.service.js';
import { readAccount, readLedgerEvents, stableBaselineHash } from './import-state.js';
import type { ScreenshotSource } from './screenshot-source.js';
import { inferAssetType } from '../ledger/asset-type.js';
import { inferTimePrecision } from '../ledger/temporal.js';
import {
  validateVisionPosition,
  visionPositionSchema,
  type PositionVisionProvider,
  type VisionPosition,
} from './vision-validation.js';

export type { ImportDraftOptions } from '../ledger/import-draft.types.js';

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
    temporal?: ImportDraftOptions,
  ) {
    const extracted = await provider.extract(image, source);
    return this.createDraft(accountId, image, source, extracted, sourceConfidence, temporal);
  }

  async createDraft(
    accountId: string,
    image: Uint8Array,
    source: ScreenshotSource,
    extracted: VisionPosition[],
    sourceConfidence = source === 'unknown' ? 0 : 1,
    temporal?: ImportDraftOptions,
  ) {
    if (image.byteLength === 0 || image.byteLength > 10 * 1024 * 1024)
      throw new BadRequestException('截图大小必须在 1 字节到 10MB 之间');
    const account = await readAccount(this.prisma, accountId);
    if (account) {
      if (account.active === false) throw new BadRequestException('账户已停用，不能创建导入草稿');
      if (account.type === 'cash') throw new BadRequestException('现金账户不支持截图导入');
    }
    const accountCurrency = currencySchema.parse(account?.currency ?? 'CNY');
    const parsedExtracted = extracted.map((row) => {
      const parsed = visionPositionSchema.safeParse(row);
      if (!parsed.success) throw new BadRequestException('识别结果必须使用十进制字符串');
      return parsed.data;
    });
    const imageHash = createHash('sha256').update(image).digest('hex');
    const temporalPrecision = temporal?.timePrecision ?? inferTimePrecision(temporal?.observedAt);
    const idempotencyKey = createHash('sha256')
      .update(
        JSON.stringify({
          accountId,
          imageHash,
          source,
          scope: temporal?.scope ?? 'FULL',
          observedAt: temporal?.observedAt ?? null,
          capturedAt: temporal?.capturedAt ?? null,
          timePrecision: temporalPrecision ?? null,
          sourceTimezone: temporal?.sourceTimezone ?? null,
        }),
      )
      .digest('hex');
    const existing = await this.prisma.importDraft.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const rows = await Promise.all(
      parsedExtracted.map(async (row) => {
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
    const draftId = crypto.randomUUID();
    const rowsWithIds = rows.map((row, index) => ({
      ...row,
      rowId: `screenshot:${draftId}:${String(index).padStart(6, '0')}`,
    }));
    const draft: ImportDraft = importDraftSchema.parse({
      id: draftId,
      accountId,
      source,
      sourceConfidence,
      status: 'pending',
      scope: temporal?.scope ?? 'FULL',
      idempotencyKey,
      rows: rowsWithIds,
      baselineHash: stableBaselineHash(baselineEvents),
      createdAt: new Date().toISOString(),
    });
    const beforeState = (await this.prisma.position.findMany({ where: { accountId } })).map(
      (position) => ({
        symbol: position.symbol,
        quantity: String(position.quantity),
        costPrice: String(position.costPrice),
      }),
    );
    const revisionRows = rowsWithIds.map((row, index) => {
      const rowId = row.rowId ?? `screenshot:${draft.id}:${String(index).padStart(6, '0')}`;
      if (row.symbol && row.quantity !== undefined && row.costPrice !== undefined) {
        return {
          rowId,
          kind: 'POSITION_BASELINE' as const,
          symbol: row.symbol,
          quantity: String(row.quantity),
          averageCost: String(row.costPrice),
          currency: accountCurrency,
          costIncludesFees: 'UNKNOWN' as const,
          ...(temporal?.observedAt ? { observedAt: temporal.observedAt } : {}),
          ...(temporal?.capturedAt ? { capturedAt: temporal.capturedAt } : {}),
          ...(temporalPrecision ? { timePrecision: temporalPrecision } : {}),
          ...(temporal?.sourceTimezone ? { sourceTimezone: temporal.sourceTimezone } : {}),
          ...(row.rawName ? { assetName: row.rawName } : {}),
          ...(row.assetType ? { assetType: row.assetType } : {}),
          issues: row.issues,
        };
      }
      return {
        rowId,
        kind: 'UNRESOLVED' as const,
        raw: row.rawText,
        issues: row.issues.length > 0 ? row.issues : ['MISSING_REQUIRED_POSITION_FIELDS'],
      };
    });
    return this.prisma.$transaction(async (transaction) => {
      const created = await transaction.importDraft.create({
        data: {
          id: draft.id,
          accountId,
          source,
          sourceConfidence,
          scope: temporal?.scope ?? 'FULL',
          status: draft.status,
          idempotencyKey,
          imageHash,
          rows: draft.rows,
          ...(draft.baselineHash === undefined ? {} : { baselineHash: draft.baselineHash }),
          beforeState,
          currentRevision: 1,
        },
      });
      await transaction.importDraftRevision.create({
        data: {
          draftId: draft.id,
          revision: 1,
          parserVersion: 'screenshot-vision@1',
          rawEvidenceRef: `screenshot-import://${draft.id}/image/${imageHash}`,
          contentHash: imageHash,
          scope: temporal?.scope ?? 'FULL',
          ...(temporal?.observedAt ? { observedAt: new Date(temporal.observedAt) } : {}),
          ...(temporal?.capturedAt ? { capturedAt: new Date(temporal.capturedAt) } : {}),
          ...(temporalPrecision ? { timePrecision: temporalPrecision } : {}),
          ...(temporal?.sourceTimezone ? { sourceTimezone: temporal.sourceTimezone } : {}),
          rows: revisionRows,
          issues: revisionRows.flatMap((row) => row.issues),
        },
      });
      return created;
    });
  }

  async rebaseline(id: string) {
    const draft = await this.prisma.importDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException('导入草稿不存在');
    if (!['pending', 'reviewed'].includes(draft.status))
      throw new BadRequestException('只有待审核草稿可以重新导入快照');
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
          quantity: String(position.quantity),
          costPrice: String(position.costPrice),
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
