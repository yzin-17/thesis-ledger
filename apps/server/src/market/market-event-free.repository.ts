import { Inject, Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { PrismaService } from '../platform/prisma.service.js';
import {
  EVENT_FREE_EVIDENCE_REVISION,
  prepareEventFreeEvidence,
} from './market-event-free-evidence.js';

@Injectable()
export class MarketEventFreeRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** 维护入口才可发布已审核材料；证书与原派生快照原子封存，不能覆盖既有事实。 */
  async publish(raw: unknown) {
    const prepared = prepareEventFreeEvidence(raw);
    const snapshot = prepared.derivedSnapshot;
    await this.prisma.$transaction(async (tx) => {
      const derivedData = {
        inputFingerprint: snapshot.inputFingerprint,
        algorithmRevision: snapshot.algorithmRevision,
        snapshot,
      };
      const certificateData = {
        inputFingerprint: prepared.certificateFingerprint,
        algorithmRevision: EVENT_FREE_EVIDENCE_REVISION,
        snapshot: prepared.certificate,
        symbol: prepared.bundle.symbol,
        startDate: prepared.bundle.start,
        endDate: prepared.bundle.end,
        derivedFingerprint: snapshot.inputFingerprint,
      };
      const saved = [
        [
          await tx.marketDerivedSeriesSnapshotV3.upsert({
            where: { inputFingerprint: derivedData.inputFingerprint },
            create: derivedData,
            update: {},
          }),
          derivedData,
        ],
        [
          await tx.marketEconomicPriceCertificate.upsert({
            where: { inputFingerprint: certificateData.inputFingerprint },
            create: certificateData,
            update: {},
          }),
          certificateData,
        ],
      ] as const;
      for (const [existing, data] of saved) {
        if (
          existing.algorithmRevision !== data.algorithmRevision ||
          !isDeepStrictEqual(existing.snapshot, data.snapshot)
        )
          throw new Error('经济价格冻结身份冲突，拒绝覆盖');
      }
    });
    return {
      certificateFingerprint: prepared.certificateFingerprint,
      derivedFingerprint: snapshot.inputFingerprint,
    };
  }

  async publishedAt(symbol: string, startDate: string, endDate: string) {
    const row = await this.prisma.marketEconomicPriceCertificate.findFirst({
      where: { symbol, startDate, endDate, algorithmRevision: EVENT_FREE_EVIDENCE_REVISION },
      select: { createdAt: true }, orderBy: { createdAt: 'desc' },
    });
    return row?.createdAt ?? null;
  }

  async exact(symbol: string, start: string, end: string) {
    const records = await this.prisma.marketEconomicPriceCertificate.findMany({
      where: {
        algorithmRevision: EVENT_FREE_EVIDENCE_REVISION,
        symbol,
        startDate: start,
        endDate: end,
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    if (!records.length) return null;
    if (records.length > 1) throw new Error('精确窗口存在多份经济资格，不擅自选择');
    const row = records[0]!;
    const stored = row.snapshot as { bundle?: unknown; derivedFingerprint?: string };
    const prepared = prepareEventFreeEvidence(stored.bundle);
    if (
      prepared.certificateFingerprint !== row.inputFingerprint ||
      prepared.derivedSnapshot.inputFingerprint !== stored.derivedFingerprint ||
      !isDeepStrictEqual(prepared.certificate, row.snapshot)
    )
      throw new Error('经济资格记录摘要或载荷不匹配');
    const derived = await this.prisma.marketDerivedSeriesSnapshotV3.findUnique({
      where: { inputFingerprint: stored.derivedFingerprint },
    });
    if (
      !derived ||
      !isDeepStrictEqual(derived.snapshot, prepared.derivedSnapshot) ||
      derived.algorithmRevision !== prepared.derivedSnapshot.algorithmRevision
    )
      throw new Error('经济资格引用的派生快照无效');
    return prepared;
  }
}
