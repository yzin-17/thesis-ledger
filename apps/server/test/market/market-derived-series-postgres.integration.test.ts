import 'reflect-metadata';
import { PrismaClient, type Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MarketDerivedSeriesRepository } from '../../src/market/market-derived-series.repository.js';
import type { MarketDerivedSeriesInputV3 } from '../../src/market/market-derived-series-v3.js';
import type { PrismaService } from '../../src/platform/prisma.service.js';

const databaseUrl = process.env.DERIVED_SNAPSHOT_TEST_DATABASE_URL;
const postgresDescribe = databaseUrl ? describe : describe.skip;

function input(name: string): MarketDerivedSeriesInputV3 {
  const timestamp = '2025-06-01T07:00:00Z';
  const availableAt = '2026-09-27T00:00:00Z';
  return {
    identity: { symbol: '510300.SH', assetType: 'ETF', timeframe: '1d', adjustment: 'none' },
    rawEvidenceRef: `isolated-fixture-${name}`, dataAsOf: availableAt,
    bars: [{ timestamp, open: 2, high: 2, low: 2, close: 2, volume: 100, amount: 200,
      completionStatus: 'complete', availableAt }],
    conversion: { kind: 'multiplicative-price-factor', adjustment: 'qfq', evidenceRef: 'factor-fixture',
      sourceRevision: 'v1', basisRef: 'fixed', anchorFactor: 2, anchorAvailableAt: availableAt,
      volumeSemantics: 'unadjusted', amountSemantics: 'unadjusted',
      factors: [{ timestamp, value: 1, availableAt }] },
  };
}

postgresDescribe('隔离 PostgreSQL 派生快照', () => {
  let prisma: PrismaClient;
  let repository: MarketDerivedSeriesRepository;
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/derived_snapshot_fixture')
      throw new Error('集成测试仅允许指定的本地隔离数据库');
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    const actual = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    if (actual[0]?.name !== 'derived_snapshot_fixture') throw new Error('隔离数据库身份不匹配');
    repository = new MarketDerivedSeriesRepository(prisma as PrismaService);
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  it('并发创建同内容只保留一行，真实 JSON 往返后重算', async () => {
    const references = await Promise.all(Array.from({ length: 4 }, () => repository.record(input('concurrent'))));
    expect(new Set(references.map((ref) => ref.inputFingerprint)).size).toBe(1);
    const fingerprint = references[0]!.inputFingerprint;
    expect(await prisma.marketDerivedSeriesSnapshotV3.count({ where: { inputFingerprint: fingerprint } })).toBe(1);
    expect((await repository.read(fingerprint, 1))?.bars[0]?.close).toBe(1);
  });

  it('已存内容损坏时读取和幂等写入均拒绝，原行不被覆盖', async () => {
    const source = input('corrupt');
    const ref = await repository.record(source);
    const row = await prisma.marketDerivedSeriesSnapshotV3.findUniqueOrThrow({ where: ref });
    const payload = row.snapshot as unknown as { input: MarketDerivedSeriesInputV3 };
    payload.input.bars[0]!.amount = 999;
    await prisma.marketDerivedSeriesSnapshotV3.update({
      where: { inputFingerprint: ref.inputFingerprint }, data: { snapshot: payload as unknown as Prisma.InputJsonValue },
    });
    await expect(repository.read(ref.inputFingerprint)).rejects.toThrow();
    await expect(repository.record(source)).rejects.toThrow('拒绝覆盖');
    const retained = await prisma.marketDerivedSeriesSnapshotV3.findUniqueOrThrow({ where: ref });
    expect(retained.snapshot).toEqual(payload);
  });

  it('算法版本列与快照不一致由数据库拒绝', async () => {
    const ref = await repository.record(input('constraint'));
    await expect(prisma.marketDerivedSeriesSnapshotV3.update({
      where: { inputFingerprint: ref.inputFingerprint }, data: { algorithmRevision: 'wrong' },
    })).rejects.toThrow();
    expect(await repository.read(ref.inputFingerprint)).not.toBeNull();
  });
});
