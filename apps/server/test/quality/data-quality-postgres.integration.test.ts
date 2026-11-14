import 'reflect-metadata';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DataQualityService } from '../../src/quality/data-quality.service.js';
import { DataQualityController } from '../../src/quality/data-quality.controller.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';
import { providerIssueRecordSchema } from '@thesis-ledger/schemas';
import { redisKey } from '../../src/platform/redis.service.js';
import { quoteControlCacheKey } from '../market/quote-control-fixture.js';
import { qualityMarketFixture, quoteFixture } from './market-quality-fixture.js';

const url = process.env.DATA_QUALITY_TEST_DATABASE_URL;
describe.skipIf(!url)('数据质量隔离 PostgreSQL 闭环', () => {
  let prisma: PrismaClient, service: DataQualityService, app: INestApplication;
  const input = {
    capability: 'REALTIME_QUOTE',
    provider: 'dsa',
    symbol: '600519.SH',
    code: 'response_schema_invalid' as const,
  };
  beforeAll(async () => {
    if (new URL(url!).pathname !== '/data_quality_fixture') throw new Error('仅允许专用隔离数据库');
    prisma = new PrismaClient({ datasources: { db: { url: url! } } });
    const identity = await prisma.$queryRaw<
      Array<{ database: string; owner: string }>
    >`SELECT current_database() AS database, current_user AS owner`;
    if (identity[0]?.database !== 'data_quality_fixture' || identity[0]?.owner !== 'fixture_owner')
      throw new Error('隔离数据库身份不符');
    service = new DataQualityService(prisma as PrismaService);
    @Module({
      controllers: [DataQualityController],
      providers: [{ provide: DataQualityService, useValue: service }],
    })
    class FixtureModule {}
    app = await NestFactory.create(FixtureModule, { logger: false });
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => {
    await prisma.dataQualityIssue.deleteMany();
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('八个并发观察只生成一条问题，次数不丢失', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => service.observe(input)));
    expect(results.every((result) => result !== null)).toBe(true);
    const rows = await prisma.dataQualityIssue.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.details).toMatchObject({ occurrences: 8 });
  });
  it('已确认保留，关闭后再次发生创建独立新记录', async () => {
    const first = await service.observe(input);
    if (!first) throw new Error('首次观察未持久化');
    await prisma.dataQualityIssue.update({
      where: { id: first.id },
      data: { status: 'acknowledged' },
    });
    expect(await service.observe(input)).toMatchObject({ id: first.id, occurrences: 2 });
    expect(
      (await prisma.dataQualityIssue.findUniqueOrThrow({ where: { id: first.id } })).status,
    ).toBe('acknowledged');
    const acknowledged = await fetch(`${await app.getUrl()}/data-quality/issues?status=unresolved`);
    expect(acknowledged.status).toBe(200);
    expect(await acknowledged.json()).toMatchObject([{ id: first.id, status: 'acknowledged' }]);
    await service.resolve(first.id);
    const next = await service.observe(input);
    expect(next).toMatchObject({ created: true, occurrences: 1 });
    expect(next?.id).not.toBe(first.id);
    expect(await prisma.dataQualityIssue.count()).toBe(2);
  });
  it('真实报价校验失败即使降级成功，也能由实际 HTTP 查询读取日志', async () => {
    const h = qualityMarketFixture(service);
    h.values.set(
      redisKey('cache', `${quoteControlCacheKey('600519.SH')}:last-valid`),
      JSON.stringify(quoteFixture),
    );
    await expect(h.service.getQuote('600519.SH', { refresh: true })).resolves.toMatchObject({
      servedFromCache: true,
    });
    const response = await fetch(`${await app.getUrl()}/data-quality/issues?status=unresolved`);
    expect(response.status).toBe(200);
    const rows = providerIssueRecordSchema.array().parse(await response.json());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      capability: 'REALTIME_QUOTE',
      provider: 'dsa',
      symbol: '600519.SH',
      code: 'response_schema_invalid',
      detectedAt: expect.any(String),
      details: { occurrences: 1 },
    });
    expect(h.dsa.get).toHaveBeenCalledTimes(1);
  });
});
