import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  correlateReportMetadata, reportMetadataCurrentRevisions, reportMetadataRequestSchema,
  type ReportMetadataPage, type ReportMetadataRequest,
} from '@thesis-ledger/schemas';
import type { PrismaService } from '../src/platform/prisma.service.js';
import type { InstrumentService } from '../src/market/instrument.service.js';
import { DsaError, type DsaClient } from '../src/integration/dsa/dsa.client.js';
import { MarketReportMetadataRepository } from '../src/market/market-report-metadata.repository.js';
import { MarketReportMetadataService } from '../src/market/market-report-metadata.service.js';
import { MarketReportMetadataController } from '../src/market/market-report-metadata.controller.js';

const instrumentId = '86b1de50-d50d-4007-84c0-918e7e5409ca';
const collect = { instrumentId, start: '2026-08-01', end: '2026-10-23', page: 1, pageSize: 1, requestBudgetMs: 3000 };

function response(request: ReportMetadataRequest, title = '公司跟踪报告'): ReportMetadataPage {
  return {
    contractVersion: 3, consumer: 'thesis-ledger', capability: 'RESEARCH_REPORT_METADATA',
    ...reportMetadataCurrentRevisions,
    requestId: request.requestId, symbol: request.symbol, start: request.start, end: request.end,
    page: request.page, pageSize: request.pageSize, totalItems: 1, totalPages: 1, historyComplete: false,
    fetchedAt: '2026-10-22T16:27:04Z', providerId: 'akshare', upstreamSource: 'eastmoney',
    policyRevision: 164, routeTarget: { providerId: 'akshare', upstreamSource: 'eastmoney', routeIndex: 0 },
    items: [{ sourceReportId: 'AP202609211829719676', reference: 'eastmoney:report:AP202609211829719676',
      title, publisher: '诚通证券', publishedDate: '2026-09-21', datePrecision: 'date',
      originalUrl: 'https://pdf.dfcfw.com/pdf/H3_AP202609211829719676_1.pdf' }],
  };
}

function fixture() {
  type Row = { id: string; instrumentId: string; collectedAt: Date; payload: ReturnType<typeof response> | unknown };
  const rows: Row[] = [];
  const orm = {
    create: vi.fn(async ({ data }) => {
      const row = structuredClone({ ...data, collectedAt: new Date(Date.UTC(2026, 9, 23, 0, 0, rows.length)) });
      rows.push(row);
      return structuredClone(row);
    }),
    findUnique: vi.fn(async ({ where }) => structuredClone(rows.find((row) => row.id === where.id) ?? null)),
    findMany: vi.fn(async ({ where, take, cursor, skip = 0 }) => {
      const selected = rows.filter((row) => row.instrumentId === where.instrumentId).slice().reverse();
      const start = cursor ? selected.findIndex((row) => row.id === cursor.id) + skip : 0;
      return structuredClone(selected.slice(start, start + take));
    }),
  };
  const prisma = { marketReportMetadataSnapshot: orm } as unknown as PrismaService;
  const repository = new MarketReportMetadataRepository(prisma);
  const instruments = { resolveCanonicalIdentity: vi.fn(async () => ({ market: 'CN', assetType: 'STOCK', symbol: '600519.SH' })) };
  const post = vi.fn<(
    path: string, request: ReportMetadataRequest, attempts?: number, mapper?: unknown, budget?: number
  ) => Promise<ReportMetadataPage>>(async (_path, request) => response(request));
  const service = new MarketReportMetadataService(instruments as unknown as InstrumentService,
    { post } as unknown as DsaClient, repository);
  return { rows, orm, prisma, repository, instruments, post, service };
}

describe('研报采集、稳定引用与本地历史', () => {
  it('省略日期仍按目录身份采集并保存显式空筛选', async () => {
    const f = fixture();
    f.instruments.resolveCanonicalIdentity.mockResolvedValue({ market: 'CN', assetType: 'STOCK', symbol: '000001.SZ' });
    const saved = await f.service.collect({ instrumentId, pageSize: 1 });
    expect(f.post).toHaveBeenCalledTimes(1);
    expect(f.post.mock.calls[0]?.[1]).toMatchObject({ symbol: '000001.SZ', start: null, end: null });
    expect(saved.request).toMatchObject({ start: null, end: null });
    expect(saved.page.metadataVersion).toBe('research-report-metadata-v2');
    expect((await f.repository.read(saved.snapshotId)).contentHash).toBe(saved.contentHash);
  });

  it('旧版 v1 快照继续本地读取，新业务消费拒绝旧版或错配修订', async () => {
    const f = fixture();
    const request = reportMetadataRequestSchema.parse({ start: collect.start, end: collect.end,
      page: 1, pageSize: 1, requestBudgetMs: 3000, contractVersion: 3,
      consumer: 'thesis-ledger', requestId: 'legacy', symbol: '600519.SH' });
    const legacy = correlateReportMetadata(request, { ...response(request), metadataVersion: 'research-report-metadata-v1',
      adapterRevision: 'eastmoney-report-metadata-page-v1', sourceRevision: 'eastmoney-report-list-single-page-v1' });
    const saved = await f.repository.record(instrumentId, request, correlateReportMetadata(request, legacy));
    expect((await f.repository.read(saved.snapshotId)).contentHash).toBe(saved.contentHash);
    expect(saved.page.metadataVersion).toBe('research-report-metadata-v1');
    f.post.mockImplementation(async (_path, value) => ({ ...response(value), ...legacy, requestId: value.requestId }));
    await expect(f.service.collect(collect)).rejects.toMatchObject({ code: 'invalid-response' });
    f.post.mockImplementation(async (_path, value) => ({ ...response(value), adapterRevision: 'other' }));
    await expect(f.service.collect(collect)).rejects.toMatchObject({ code: 'invalid-response' });
    expect(f.orm.create).toHaveBeenCalledTimes(1);
  });

  it('从目录身份单次读取并保存，重新建立 repository 后历史仍不联网', async () => {
    const f = fixture();
    const saved = await f.service.collect(collect);
    expect(f.post).toHaveBeenCalledTimes(1);
    const [path, request, attempts, , budget] = f.post.mock.calls[0]!;
    expect(path).toBe('/api/v3/thesis-ledger/market/research-report-metadata');
    expect(request).toMatchObject({ symbol: '600519.SH', assetType: 'STOCK', pageSize: 1 });
    expect(attempts).toBe(1);
    expect(budget).toBe(3000);
    f.post.mockRejectedValue(new Error('历史查询不能访问来源'));
    const restored = new MarketReportMetadataRepository(f.prisma);
    expect(await restored.read(saved.snapshotId)).toEqual(saved);
    expect(await restored.history(instrumentId, 10)).toEqual({ items: [saved], nextCursor: null });
    expect(f.post).toHaveBeenCalledTimes(1);
    expect(saved.page.items[0]?.reference).toBe('eastmoney:report:AP202609211829719676');
    expect(saved.page.historyComplete).toBe(false);
  });

  it('相同报告的再次采集保留独立快照及旧元数据', async () => {
    const f = fixture();
    const first = await f.service.collect(collect);
    f.post.mockImplementation(async (_path, request) => response(request, '修订后的标题'));
    const second = await f.service.collect(collect);
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(second.page.items[0]?.reference).toBe(first.page.items[0]?.reference);
    expect((await f.repository.read(first.snapshotId)).page.items[0]?.title).toBe('公司跟踪报告');
  });

  it.each(['ETF', 'INDEX', 'MUTUAL_FUND'])('目录中的 %s 不会被当作股票调用来源', async (assetType) => {
    const f = fixture();
    f.instruments.resolveCanonicalIdentity.mockResolvedValue({ market: 'CN', assetType, symbol: '510300.SH' });
    await expect(f.service.collect(collect)).rejects.toThrow('沪深股票');
    expect(f.post).not.toHaveBeenCalled();
    expect(f.orm.create).not.toHaveBeenCalled();
  });

  it('无效窗口和额外字段在目录及数据服务查询前拒绝', async () => {
    const f = fixture();
    await expect(f.service.collect({ ...collect, pageSize: 100 })).rejects.toThrow('有界分页');
    await expect(f.service.collect({ ...collect, prompt: '不得触发模型' })).rejects.toThrow('有界分页');
    expect(f.instruments.resolveCanonicalIdentity).not.toHaveBeenCalled();
    expect(f.post).not.toHaveBeenCalled();
  });

  it('错配来源响应及取数失败均不创建快照', async () => {
    const f = fixture();
    f.post.mockImplementation(async (_path, request) => ({ ...response(request), symbol: '000001.SZ' }));
    await expect(f.service.collect(collect)).rejects.toMatchObject({ code: 'invalid-response' });
    f.post.mockRejectedValue(new DsaError('未准入', 'control-rejected'));
    await expect(f.service.collect(collect)).rejects.toThrow('未准入');
    expect(f.orm.create).not.toHaveBeenCalled();
    expect(f.post).toHaveBeenCalledTimes(2);
  });

  it('本地 JSON 内容或来源标识被改动时拒绝返回历史', async () => {
    const f = fixture();
    const saved = await f.service.collect(collect);
    const payload = f.rows[0]!.payload as { page: { items: { title: string }[] } };
    payload.page.items[0]!.title = '被篡改的标题';
    await expect(f.repository.read(saved.snapshotId)).rejects.toThrow('本地研报快照校验失败');
  });

  it('历史分页不重叠，游标不能跨标的使用', async () => {
    const f = fixture();
    const first = await f.service.collect(collect);
    const second = await f.service.collect(collect);
    const page = await f.repository.history(instrumentId, 1);
    expect(page.items.map((item) => item.snapshotId)).toEqual([second.snapshotId]);
    expect(await f.repository.history(instrumentId, 1, page.nextCursor!)).toEqual({ items: [first], nextCursor: null });
    await expect(f.repository.history(randomUUID(), 1, second.snapshotId)).rejects.toThrow('目录标的不一致');
  });

  it('空历史与不存在快照分别表达，HTTP 输入保持有界', async () => {
    const f = fixture();
    const controller = new MarketReportMetadataController(f.service, f.repository);
    expect(await controller.history({ instrumentId })).toEqual({ items: [], nextCursor: null });
    await expect(controller.read(randomUUID())).rejects.toThrow('本地研报快照不存在');
    expect(() => controller.history({ instrumentId, limit: '999' })).toThrow('有界条数');
    expect(f.post).not.toHaveBeenCalled();
  });
});
