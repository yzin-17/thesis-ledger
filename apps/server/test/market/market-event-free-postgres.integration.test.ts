import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { MarketEventFreeRepository } from '../../src/market/market-event-free.repository.js';
import { MarketEventFreeReader } from '../../src/market/market-event-free-reader.js';
import { MarketWindowEvidenceV3Repository } from '../../src/market/market-window-evidence-v3.repository.js';
import * as selector from '../../src/market/market-window-selector-v3.js';
import { fixture } from './market-event-free.fixture.js';

const url = process.env.ECONOMIC_PRICE_DATABASE_URL;
(url ? describe : describe.skip)('经济资格隔离 PostgreSQL', () => {
  let prisma: PrismaClient;
  let repo: MarketEventFreeRepository;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/economic_price_fixture')
      throw new Error('仅允许指定本地隔离库');
    prisma = new PrismaClient({ datasources: { db: { url: url! } } });
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    expect(rows[0]?.name).toBe('economic_price_fixture');
    repo = new MarketEventFreeRepository(prisma as never);
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  it('真实 JSON 往返、幂等及原表约束兼容', async () => {
    const result = await repo.publish(fixture());
    expect(await repo.publish(fixture())).toEqual(result);
    expect(
      (await repo.exact('600519.SH', '2026-10-29', '2026-10-30'))?.certificateFingerprint,
    ).toBe(result.certificateFingerprint);
    expect(await prisma.marketEconomicPriceCertificate.count()).toBe(1);
    expect(await prisma.marketDerivedSeriesSnapshotV3.count()).toBe(1);
    await expect(
      prisma.marketEconomicPriceCertificate.update({
        where: { inputFingerprint: result.certificateFingerprint },
        data: { symbol: '000001.SZ' },
      }),
    ).rejects.toThrow();
  });
  it('证书约束失败回滚同次新派生快照', async () => {
    const broken = new MarketEventFreeRepository({
      $transaction: (fn: (tx: unknown) => unknown) =>
        prisma.$transaction(
          (tx) =>
            fn({
              marketDerivedSeriesSnapshotV3: tx.marketDerivedSeriesSnapshotV3,
              marketEconomicPriceCertificate: {
                upsert: (args: { create: object }) =>
                  tx.marketEconomicPriceCertificate.upsert({
                    ...args,
                    create: { ...args.create, symbol: 'wrong' },
                  } as never),
              },
            }) as Promise<unknown>,
        ),
    } as never);
    const altered = fixture();
    altered.qualification.captureSha256 = 'e'.repeat(64);
    await expect(broken.publish(altered)).rejects.toThrow();
    expect(await prisma.marketEconomicPriceCertificate.count()).toBe(1);
    expect(await prisma.marketDerivedSeriesSnapshotV3.count()).toBe(1);
  });
  it('原请求模式经真实行情仓储保存同批次逐日证据并可冻结读取', async () => {
    const source = fixture().source;
    const spy = vi
      .spyOn(selector, 'marketRouteContextV3')
      .mockReturnValue({
        ok: true,
        context: {
          desiredRevision: 188,
          effectivePolicyRevision: 188,
          catalogRevision: 1,
          targets: [{ target: source, routeIndex: 0, eligible: true, catalogReady: true }],
        },
      } as never);
    try {
      const storage = new MarketWindowEvidenceV3Repository(prisma as never);
      const reader = new MarketEventFreeReader(
        repo,
        {
          getPolicy: async () => ({
            contractVersion: 3,
            consumer: 'thesis-ledger',
            requestId: 'test',
            revision: 188,
            enabled: true,
            routes: [],
            syncState: 'applied',
            effectiveStale: false,
          }),
        } as never,
        {
          effectiveControlPolicyV3: async () => ({ projection: { effective: {} } }),
          marketRouteCatalogV3: async () => ({}),
        } as never,
        {
          read: async () => ({
            status: 'ready',
            calendar: {
              revision: 'qualified-calendar',
              availableAt: '2026-10-28T00:00:00Z',
              coverageStart: '2026-10-29',
              coverageEnd: '2026-10-30',
              sessions: ['2026-10-29', '2026-10-30'].map((tradingDate) => ({ tradingDate })),
            },
          }),
        } as never,
        storage,
      );
      const result = await reader.read({
        market: 'CN',
        symbol: '600519.SH',
        window: { start: '2026-10-29', end: '2026-10-30' },
        routeKey: {
          kind: 'bar',
          market: 'CN',
          assetType: 'STOCK',
          capability: 'DAILY_BAR',
          timeframe: '1d',
          adjustment: 'qfq',
        },
        priceResearch: true,
        tradabilityMode: 'assume-untradable-no-bar',
      });
      expect(result?.status).toBe('selected');
      if (result?.status !== 'selected') throw new Error('材料未通过');
      const frozen = await storage.findFrozen(result.evidence.identityFingerprint);
      expect(frozen?.response.historicalTradabilityWindows?.[0]?.days.map((d) => d.state)).toEqual([
        'observed-traded',
        'observed-traded',
      ]);
      expect(await prisma.marketBarWindowEvidenceV3.count()).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});
