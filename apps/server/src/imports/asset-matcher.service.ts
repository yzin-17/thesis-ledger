import { Injectable } from '@nestjs/common';
import { normalizeSymbol } from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';
import type { VisionPosition } from './vision-validation.js';

@Injectable()
export class AssetMatcherService {
  constructor(private readonly prisma: PrismaService) {}

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
}
