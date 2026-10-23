import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { performanceSummaryResponseSchema } from '@thesis-ledger/schemas';
import {
  correctnessDatabaseUrl,
  createCorrectnessHttpFixture,
  type CorrectnessHttpFixture,
} from './correctness-http-postgres.fixture.js';

describe.skipIf(!correctnessDatabaseUrl)('收益正确性：真实 HTTP/业务服务/PostgreSQL', () => {
  let fixture: CorrectnessHttpFixture;
  let prisma: CorrectnessHttpFixture['prisma'];
  beforeAll(async () => {
    fixture = await createCorrectnessHttpFixture();
    prisma = fixture.prisma;
  });
  afterAll(async () => {
    await fixture?.close();
  });
  const request = (path: string, body?: unknown) => fixture.request(path, body);
  const account = () => fixture.account();
  const snapshotsFor = (id: string, value: number) => fixture.snapshotsFor(id, value);
  const flow = (id: string, direction: 'INFLOW' | 'OUTFLOW', amount: string) =>
    fixture.flow(id, direction, amount);

  it('真实 targets HTTP 保存、读取及拒绝失败后保留原版本', async () => {
    const id = await account();
    const saved = await request('/targets', {
      scope: 'account',
      accountId: id,
      targets: { stock: 0.5, cash: 0.5 },
    });
    expect(saved.status).toBe(201);
    const read = await request(`/targets?scope=account&accountId=${id}&mode=actual`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      id: saved.body.id,
      version: 1,
      active: true,
      targets: { stock: 0.5, cash: 0.5 },
    });
    const invalid = await request('/targets', {
      scope: 'portfolio',
      accountId: id,
      targets: { stock: 1 },
    });
    expect(invalid.status).toBe(400);
    expect((await request(`/targets?scope=account&accountId=${id}`)).body.id).toBe(saved.body.id);
    expect(await prisma.targetAllocation.count({ where: { accountId: id, active: true } })).toBe(1);
  });

  it('持久快照/现金流经真实 summary HTTP 返回缺边界原因及独立可用 XIRR，读取不改历史', async () => {
    const id = await account();
    await snapshotsFor(id, 220);
    await flow(id, 'INFLOW', '100');
    const before = await prisma.portfolioSnapshot.findMany({
      where: { accountId: id },
      orderBy: { capturedAt: 'asc' },
    });
    const result = await request(`/summary?accountId=${id}&mode=actual`);
    expect(result.status).toBe(200);
    expect(performanceSummaryResponseSchema.parse(result.body)).toMatchObject({
      accountId: id,
      ttwror: null,
      ttwrorReason: expect.stringContaining('边界'),
      xirr: expect.any(Number),
      xirrReason: null,
    });
    expect(Number.isFinite(result.body.xirr)).toBe(true);
    expect(
      await prisma.portfolioSnapshot.findMany({
        where: { accountId: id },
        orderBy: { capturedAt: 'asc' },
      }),
    ).toEqual(before);
  });

  it('真实零净额流量仍不可伪装为无流量；严重亏损通过实际读取保持有限解', async () => {
    const id = await account();
    await snapshotsFor(id, 110);
    await flow(id, 'INFLOW', '100');
    await flow(id, 'OUTFLOW', '100');
    const netZero = await request(`/summary?accountId=${id}&mode=actual`);
    expect(netZero.status).toBe(200);
    expect(netZero.body.ttwror).toBeNull();
    expect(netZero.body.ttwrorReason).toEqual(expect.stringContaining('边界'));
    const loss = await account();
    await snapshotsFor(loss, 10);
    const result = await request(`/summary?accountId=${loss}&mode=actual`);
    expect(result.status).toBe(200);
    expect(result.body.ttwror).toBeCloseTo(-0.9, 12);
    expect(result.body.xirrReason).toBeNull();
    const rate = Number(result.body.xirr);
    expect(Number.isFinite(rate)).toBe(true);
    expect(Math.abs(-100 + 10 / (1 + rate) ** (365 / 365.25))).toBeLessThan(1e-7);
  });

  it('计算/配置 HTTP 保持精确分段、完整现金来源和 partial 拒绝建议', async () => {
    const calculated = await request('/calculate', {
      valuations: [
        { date: '2025-01-01T00:00:00Z', value: 100 },
        {
          date: '2025-01-02T00:00:00Z',
          value: 200,
          externalFlow: 100,
          flowBoundary: { before: 100, after: 200 },
        },
        { date: '2025-01-03T00:00:00Z', value: 220 },
      ],
      cashFlows: [
        { date: '2025-01-01T00:00:00Z', amount: -100 },
        { date: '2026-01-01T00:00:00Z', amount: 110 },
      ],
    });
    expect(calculated.status).toBe(201);
    expect(calculated.body.ttwror).toBeCloseTo(0.1, 12);
    const input = {
      positions: [
        { category: 'stock', marketValue: 500 },
        { category: 'cash', marketValue: 500 },
      ],
      targets: { stock: 1 },
    };
    const allocated = await request('/allocation', input);
    expect(allocated.status).toBe(201);
    expect(allocated.body.rebalance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'stock', amountGap: 500 }),
        expect.objectContaining({ category: 'cash', amountGap: -500 }),
      ]),
    );
    const partial = await request('/allocation', {
      ...input,
      dataQuality: { partial: true, missingSymbols: ['SYNTHETIC'] },
    });
    expect(partial.status).toBe(201);
    expect(partial.body.rebalance).toEqual([]);
  });
});
