import { describe, expect, it, vi } from 'vitest';
import {
  estimateFundNavFromHoldings,
  PerformanceValuationSeriesService,
} from '../../src/performance/performance-valuation-series.service.js';
import { PerformanceSnapshotService } from '../../src/performance/performance-snapshot.service.js';

describe('组合估值走势', () => {
  it('部分披露持仓不归一放大，无法定价部分按零变动处理', () => {
    const result = estimateFundNavFromHoldings(
      1,
      [
        { symbol: '600519.SH', name: '贵州茅台', weight: 0.08 },
        { symbol: '000001.SZ', name: '平安银行', weight: 0.06 },
      ],
      new Map([['600519.SH', 0.1]]),
    );

    expect(result.estimatedNav).toBeCloseTo(1.008);
    expect(result.disclosureCoverage).toBeCloseTo(0.14);
    expect(result.pricedCoverage).toBeCloseTo(0.08);
  });

  it('分钟序列按自然分钟归并并限制为最后 2000 点', async () => {
    const start = new Date('2026-09-01T01:30:00.000Z');
    const rows = Array.from({ length: 2_002 }, (_, index) => ({
      at: new Date(start.getTime() + index * 60_000 + (index % 2) * 1_000),
      totalValue: index,
      valuationBasis: 'ESTIMATED',
      disclosureCoverage: 1,
      pricedCoverage: 1,
      dataQuality: 'COMPLETE',
      sourceSnapshotId: null,
    }));
    const service = new PerformanceValuationSeriesService(
      {
        accountValuationPoint: { findMany: vi.fn(async () => rows) },
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.series({
      scope: 'account',
      accountId: 'account-1',
      range: '5D',
      interval: '1min',
      mode: 'actual',
      baseCurrency: 'CNY',
    });

    expect(result.points).toHaveLength(2_000);
    expect(result.points[0]?.value).toBe(2);
    expect(result.points.at(-1)?.value).toBe(2_001);
  });

  it('正式快照以追加修订替代同一估值槽位的估算版本', async () => {
    const stored: Array<Record<string, unknown>> = [];
    const prisma = {
      position: { findMany: vi.fn(async () => []) },
      ledgerEvent: { findMany: vi.fn(async () => []) },
      portfolioSnapshot: {
        findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
          stored.find((row) => row.idempotencyKey === where.idempotencyKey),
        ),
        findFirst: vi.fn(async () => stored.at(-1) ?? null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `snapshot-${stored.length + 1}`, ...data };
          stored.push(row);
          return row;
        }),
      },
    };
    const data = {
      accountCurrencies: vi.fn(async () => new Map()),
      resolveFx: vi.fn(async () => ({
        enabled: true,
        complete: true,
        rates: new Map([['CNY', 1]]),
        meta: {
          enabled: true,
          status: 'not_needed',
          baseCurrency: 'CNY',
          missingCurrencies: [],
          rates: [],
        },
      })),
    };
    const service = new PerformanceSnapshotService(prisma as never, {} as never, data as never);
    const capturedAt = new Date('2026-09-07T08:00:00.000Z');

    const estimate = await service.capture(
      undefined,
      capturedAt,
      'actual',
      {},
      {
        source: 'DAILY_CLOSE',
        valuationBasis: 'ESTIMATED',
      },
    );
    const official = await service.capture(
      undefined,
      capturedAt,
      'actual',
      {},
      {
        source: 'DAILY_CLOSE',
        valuationBasis: 'OFFICIAL',
      },
    );
    const repeatedEstimate = await service.capture(
      undefined,
      capturedAt,
      'actual',
      {},
      {
        source: 'DAILY_CLOSE',
        valuationBasis: 'ESTIMATED',
        idempotencyKey: 'late-estimate-after-official',
      },
    );

    expect(estimate).toMatchObject({ revision: 1, valuationBasis: 'ESTIMATED' });
    expect(official).toMatchObject({
      revision: 2,
      valuationBasis: 'OFFICIAL',
      supersedesSnapshotId: 'snapshot-1',
    });
    expect(stored).toHaveLength(2);
    expect(repeatedEstimate).toMatchObject({
      id: 'snapshot-2',
      valuationBasis: 'OFFICIAL',
    });
  });
});
