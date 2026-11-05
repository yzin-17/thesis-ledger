import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { PerformanceSnapshotService } from '../../src/performance/performance-snapshot.service.js';

const accountId = 'account-frozen';
const capturedAt = new Date('2026-09-28T08:00:00.000Z');

function harness() {
  const estimate = {
    id: 'estimated-1',
    accountId,
    scope: 'account',
    mode: 'actual',
    capturedAt,
    valuationDate: new Date('2026-09-28T00:00:00.000Z'),
    baseCurrency: 'CNY',
    slotKey: `account:${accountId}:actual:2026-09-28`,
    revision: 1,
    source: 'DAILY_CLOSE',
    valuationBasis: 'ESTIMATED',
    status: 'VALID',
    disclosureCoverage: 1 as number | Prisma.Decimal,
    idempotencyKey: 'estimate-1',
    marketValue: 900,
    costValue: 800,
    cashValue: 500,
    payload: {
      mode: 'actual',
      currency: 'CNY',
      accountScopePolicy: 'account-v1',
      positions: [
        {
          symbol: '600519.SH',
          quantity: 10,
          costPrice: 80,
          assetType: 'stock',
          currency: 'CNY',
          nativeCostValue: 800,
          marketValue: 900,
        },
      ],
      cashByCurrency: [{ accountId, currency: 'CNY', amount: 500, convertedAmount: 500 }],
    },
  };
  const stored: Array<Record<string, unknown>> = [estimate];
  const currentPositions = [
    {
      accountId,
      symbol: '600519.SH',
      quantity: 999,
      costPrice: 95,
      asset: { assetType: 'stock', currency: 'CNY' },
    },
  ];
  const prisma = {
    position: { findMany: vi.fn(async () => currentPositions) },
    ledgerEvent: { findMany: vi.fn(async () => []) },
    portfolioSnapshot: {
      // 模拟已被两个执行者读取的估算候选；重复校准仍须幂等。
      findMany: vi.fn(async () => [estimate]),
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
        stored.find((row) => row.idempotencyKey === where.idempotencyKey),
      ),
      findFirst: vi.fn(async () => stored.at(-1)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `snapshot-${stored.length + 1}`, ...data };
        stored.push(row);
        return row;
      }),
    },
  };
  const data = {
    accountCurrencies: vi.fn(async () => new Map([[accountId, 'CNY']])),
    resolveFx: vi.fn(async () => ({
      rates: new Map([['CNY', 1]]),
      meta: {
        version: 3,
        evidenceVersion: 'fx-cny-1',
        enabled: true,
        status: 'not_needed',
        baseCurrency: 'CNY',
        missingCurrencies: [],
        rates: [],
      },
    })),
    convertFx: vi.fn((amount: number) => amount),
  };
  const price = { close: 100, availableAt: '2026-09-28T07:01:00.000Z' };
  const bars = {
    readV3: vi.fn(async () => ({
      status: 'selected',
      selection: {
        response: {
          bars: [{ timestamp: '2026-09-28T07:00:00.000Z', ...price, completionStatus: 'complete' }],
          provenance: { providerId: 'hithink', upstreamSource: 'hithink-financial-api' },
        },
      },
    })),
  };
  const service = new PerformanceSnapshotService(
    prisma as never,
    {} as never,
    data as never,
    bars as never,
  );
  return { estimate, stored, currentPositions, prisma, data, price, bars, service };
}

describe('正式校准的冻结经济输入与证据身份', () => {
  it('后续交易与账户变化不改变旧日数量、成本和现金，也不重写估算', async () => {
    const h = harness();
    const original = JSON.stringify(h.estimate);
    await expect(h.service.reconcileOfficial()).resolves.toMatchObject({ scanned: 1, pending: [] });
    expect(h.stored.at(-1)).toMatchObject({
      marketValue: 1000,
      costValue: 800,
      cashValue: 500,
      totalValue: 1500,
      valuationBasis: 'OFFICIAL',
      revision: 2,
      supersedesSnapshotId: 'estimated-1',
      payload: { positions: [{ quantity: 10, costPrice: 80 }], cashByCurrency: [{ amount: 500 }] },
    });
    expect(JSON.stringify(h.estimate)).toBe(original);
    expect(h.prisma.position.findMany).not.toHaveBeenCalled();
    expect(h.prisma.ledgerEvent.findMany).not.toHaveBeenCalled();
    expect(h.data.accountCurrencies).not.toHaveBeenCalled();
  });

  it('同值重读幂等，正式价格更正追加修订且保留全部旧证据', async () => {
    const h = harness();
    await h.service.reconcileOfficial();
    const first = JSON.stringify(h.stored[1]);
    h.price.availableAt = '2026-09-28T07:02:00.000Z';
    await h.service.reconcileOfficial();
    expect(h.stored).toHaveLength(2);
    h.price.close = 101;
    await h.service.reconcileOfficial();
    expect(h.stored).toHaveLength(3);
    expect(h.stored[2]).toMatchObject({
      marketValue: 1010,
      cashValue: 500,
      revision: 3,
      supersedesSnapshotId: 'snapshot-2',
    });
    expect(h.stored[2]?.idempotencyKey).not.toBe(h.stored[1]?.idempotencyKey);
    expect(JSON.stringify(h.stored[1])).toBe(first);
  });

  it.each(['缺失持仓', '缺失现金', '无效数量', '未知币种'])(
    '旧冻结输入%s时保持待补齐，不用当前数据代替',
    async (kind) => {
      const h = harness();
      const payload = h.estimate.payload as Record<string, unknown>;
      if (kind === '缺失持仓') delete payload.positions;
      else if (kind === '缺失现金') delete payload.cashByCurrency;
      else if (kind === '无效数量') h.estimate.payload.positions[0]!.quantity = Number.NaN;
      else h.estimate.payload.positions[0]!.currency = 'UNKNOWN';
      const result = await h.service.reconcileOfficial();
      expect(result.reconciled).toEqual([]);
      expect(result.pending).toEqual([
        { snapshotId: 'estimated-1', reason: expect.stringContaining('冻结') },
      ]);
      expect(h.stored).toHaveLength(1);
      expect(h.prisma.position.findMany).not.toHaveBeenCalled();
      expect(h.bars.readV3).not.toHaveBeenCalled();
    },
  );

  it('零数量不依赖证券行情，冻结现金仍可正式化', async () => {
    const h = harness();
    h.estimate.payload.positions[0]!.quantity = 0;
    h.estimate.payload.positions[0]!.nativeCostValue = 0;
    h.currentPositions[0]!.quantity = 0;
    h.bars.readV3.mockRejectedValue(new Error('行情不可用'));
    await expect(h.service.reconcileOfficial()).resolves.toMatchObject({ pending: [] });
    expect(h.stored.at(-1)).toMatchObject({
      marketValue: 0,
      costValue: 0,
      cashValue: 500,
      valuationStatus: 'COMPLETE',
      pricedCoverage: 1,
    });
    expect(h.bars.readV3).not.toHaveBeenCalled();
  });

  it('保留原披露覆盖率，历史汇率陈旧时不写正式修订', async () => {
    const h = harness();
    h.estimate.disclosureCoverage = new Prisma.Decimal('0.14');
    await h.service.reconcileOfficial();
    expect(h.stored.at(-1)?.disclosureCoverage).toBe(0.14);
    const stale = harness();
    const fx = await stale.data.resolveFx();
    fx.meta.status = 'stale';
    stale.data.resolveFx.mockResolvedValue(fx);
    const result = await stale.service.reconcileOfficial();
    expect(result.reconciled).toEqual([]);
    expect(result.pending).toHaveLength(1);
    expect(stale.stored).toHaveLength(1);
  });
});
