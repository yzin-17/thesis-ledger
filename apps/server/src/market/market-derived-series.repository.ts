import { Inject, Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { PrismaService } from '../platform/prisma.service.js';
import type { MarketDerivedSeriesInputV3 } from './market-derived-series-v3.js';
import { freezeMarketDerivedSeriesV3, readMarketDerivedSeriesV3 } from './market-derived-series-snapshot-v3.js';

@Injectable()
export class MarketDerivedSeriesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: MarketDerivedSeriesInputV3) {
    const snapshot = freezeMarketDerivedSeriesV3(input);
    const { inputFingerprint, algorithmRevision } = snapshot;
    try {
      await this.prisma.marketDerivedSeriesSnapshotV3.create({
        data: { inputFingerprint, algorithmRevision, snapshot },
      });
    } catch (error) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2002') throw error;
      const existing = await this.prisma.marketDerivedSeriesSnapshotV3.findUnique({ where: { inputFingerprint } });
      if (!existing || existing.algorithmRevision !== algorithmRevision ||
          !isDeepStrictEqual(existing.snapshot, snapshot))
        throw new Error('派生快照身份冲突，拒绝覆盖');
      readMarketDerivedSeriesV3(existing.snapshot, inputFingerprint);
    }
    return { inputFingerprint, algorithmRevision };
  }

  async read(inputFingerprint: string, limit?: number) {
    if (!/^[a-f0-9]{64}$/.test(inputFingerprint)) throw new Error('派生快照引用格式无效');
    const row = await this.prisma.marketDerivedSeriesSnapshotV3.findUnique({ where: { inputFingerprint } });
    if (!row) return null;
    const result = readMarketDerivedSeriesV3(row.snapshot, inputFingerprint, limit);
    if (row.inputFingerprint !== inputFingerprint || row.algorithmRevision !== result.derivation.algorithmRevision)
      throw new Error('派生快照列与载荷不一致');
    return result;
  }
}
