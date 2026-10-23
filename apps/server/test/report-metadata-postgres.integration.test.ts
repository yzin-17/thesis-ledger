import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { reportMetadataRequestSchema } from '@thesis-ledger/schemas';
import type { PrismaService } from '../src/platform/prisma.service.js';
import { MarketReportMetadataRepository } from '../src/market/market-report-metadata.repository.js';

const databaseUrl = process.env.JOURNAL_REVIEW_DATABASE_URL;

describe.skipIf(!databaseUrl)('隔离 PostgreSQL 的研报元数据快照', () => {
  let prisma: PrismaClient;
  let repository: MarketReportMetadataRepository;
  const instrumentId = randomUUID();
  const request = reportMetadataRequestSchema.parse({
    contractVersion: 3, consumer: 'thesis-ledger', requestId: randomUUID(), symbol: '600519.SH',
    start: '2026-08-01', end: '2026-10-23', page: 1, pageSize: 1, requestBudgetMs: 3000,
  });
  const page = {
    contractVersion: 3 as const, consumer: 'thesis-ledger' as const, capability: 'RESEARCH_REPORT_METADATA' as const,
    metadataVersion: 'research-report-metadata-v1' as const, adapterRevision: 'eastmoney-report-metadata-page-v1',
    sourceRevision: 'eastmoney-report-list-single-page-v1',
    requestId: request.requestId, symbol: request.symbol, start: request.start, end: request.end,
    page: 1, pageSize: 1, totalItems: 1, totalPages: 1, historyComplete: false as const,
    fetchedAt: '2026-10-22T16:27:04Z', providerId: 'akshare', upstreamSource: 'eastmoney',
    policyRevision: 164, routeTarget: { providerId: 'akshare', upstreamSource: 'eastmoney', routeIndex: 0 },
    items: [{ sourceReportId: 'AP202609211829719676', reference: 'eastmoney:report:AP202609211829719676',
      title: '隔离测试的研报标题', publisher: '诚通证券', publishedDate: '2026-09-21', datePrecision: 'date' as const,
      originalUrl: 'https://pdf.dfcfw.com/pdf/H3_AP202609211829719676_1.pdf' }],
  };

  beforeAll(async () => {
    if (new URL(databaseUrl!).pathname !== '/journal_review_fixture') throw new Error('研报隔离测试拒绝其他数据库');
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    repository = new MarketReportMetadataRepository(prisma as PrismaService);
    await prisma.instrument.create({ data: {
      id: instrumentId, instrumentType: 'STOCK', market: 'SH', canonicalCode: '600519',
      displayName: '研报隔离测试', generation: 1,
    } });
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  it('真实 JSONB 往返后摘要与规范字段一致，重新连接仍可读取', async () => {
    const first = await repository.record(instrumentId, request, page);
    await prisma.$disconnect();
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    repository = new MarketReportMetadataRepository(prisma as PrismaService);
    expect(await repository.read(first.snapshotId)).toEqual(first);
    const history = await repository.history(instrumentId, 10);
    expect(history.items.map((item) => item.snapshotId)).toContain(first.snapshotId);
    expect(history.items[0]?.page.items[0]?.reference).toBe('eastmoney:report:AP202609211829719676');
  });

  it('重复来源报告保留多个快照，游标读取不会重复', async () => {
    const nextRequest = { ...request, requestId: randomUUID() };
    await repository.record(instrumentId, nextRequest, { ...page, requestId: nextRequest.requestId });
    const first = await repository.history(instrumentId, 1);
    const second = await repository.history(instrumentId, 1, first.nextCursor!);
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(first.items[0]?.snapshotId).not.toBe(second.items[0]?.snapshotId);
    expect(first.items[0]?.page.items[0]?.reference).toBe(second.items[0]?.page.items[0]?.reference);
  });

  it('已留存快照保护原目录外键，载荷被改动时停止返回历史', async () => {
    await expect(prisma.instrument.delete({ where: { id: instrumentId } })).rejects.toMatchObject({ code: 'P2003' });
    const existing = await prisma.marketReportMetadataSnapshot.findFirstOrThrow({ where: { instrumentId } });
    await prisma.marketReportMetadataSnapshot.update({ where: { id: existing.id }, data: { payload: {} } });
    await expect(repository.read(existing.id)).rejects.toThrow('本地研报快照校验失败');
  });
});
