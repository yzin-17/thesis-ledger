import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  correlateReportMetadata, reportMetadataRequestSchema, reportMetadataSnapshotSchema,
  type ReportMetadataPage, type ReportMetadataRequest, type ReportMetadataSnapshot,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';

type SnapshotRow = { id: string; instrumentId: string; symbol: string; contentHash: string; payload: unknown; collectedAt: Date };

function payloadFor(request: ReportMetadataRequest, raw: unknown) {
  const checked = reportMetadataRequestSchema.parse(request);
  return { request: checked, page: correlateReportMetadata(checked, raw) };
}

function hashPayload(payload: ReturnType<typeof payloadFor>) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function decode(row: SnapshotRow): ReportMetadataSnapshot {
  try {
    const payload = z.strictObject({ request: reportMetadataRequestSchema, page: z.unknown() }).parse(row.payload);
    const checked = payloadFor(payload.request, payload.page);
    if (hashPayload(checked) !== row.contentHash) throw new Error('摘要不匹配');
    return reportMetadataSnapshotSchema.parse({
      snapshotId: row.id, instrumentId: row.instrumentId, symbol: row.symbol,
      contentHash: row.contentHash, collectedAt: row.collectedAt.toISOString(), ...checked,
    });
  } catch { throw new ServiceUnavailableException('本地研报快照校验失败，拒绝返回失真的历史'); }
}

@Injectable()
export class MarketReportMetadataRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(instrumentId: string, request: ReportMetadataRequest, page: ReportMetadataPage) {
    z.uuid().parse(instrumentId);
    const payload = payloadFor(request, page);
    const row = await this.prisma.marketReportMetadataSnapshot.create({ data: {
      id: randomUUID(), instrumentId, symbol: request.symbol, payload, contentHash: hashPayload(payload),
    } });
    return decode(row);
  }

  async read(snapshotId: string) {
    const row = await this.prisma.marketReportMetadataSnapshot.findUnique({ where: { id: snapshotId } });
    if (!row) throw new NotFoundException('本地研报快照不存在');
    return decode(row);
  }

  async history(instrumentId: string, limit: number, cursor?: string) {
    if (cursor) {
      const boundary = await this.prisma.marketReportMetadataSnapshot.findUnique({ where: { id: cursor } });
      if (!boundary || boundary.instrumentId !== instrumentId) throw new BadRequestException('研报历史游标与目录标的不一致');
    }
    const rows = await this.prisma.marketReportMetadataSnapshot.findMany({
      where: { instrumentId }, orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, limit).map(decode);
    return { items, nextCursor: rows.length > limit ? items.at(-1)!.snapshotId : null };
  }
}
