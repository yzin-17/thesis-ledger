import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AiResearchReportsQuery } from '../../src/ai/ai-research-reports.query.js';
import { readResearchReportTools } from '../../src/ai/ai-research-report-tools.js';
import { comparisonOwner, comparisonReport } from './research-comparison.fixture.js';

function harness() {
  const report = comparisonReport();
  const calls = report.calls.map((call) => ({ ...call, createdAt: report.row.createdAt }));
  calls.push({
    ...calls[0]!,
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    status: 'denied',
    tool: 'deniedCapability',
  });
  const access = { assertSnapshot: vi.fn(async () => {}), assertLegacy: vi.fn(async () => {}) };
  const transaction = {
    aiRun: { findFirst: vi.fn(async () => report.row) },
    aiToolCall: {
      findMany: vi.fn(async ({ where, take }) => {
        if (where.id) return calls.filter((call) => where.id.in.includes(call.id));
        const after = where.OR?.[1]?.id.gt;
        return calls.filter((call) => !after || call.id > after).slice(0, take);
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (read, options?: unknown) => {
      expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return read(transaction);
    }),
  };
  const query = new AiResearchReportsQuery(prisma as never);
  const locator = { view: 'scoped' as const, mode: report.source.frozen.scopeSnapshot.mode };
  const read = (input = { ...locator, limit: 1 }) =>
    query.tools(comparisonOwner, report.row.id, input, access);
  return { report, calls, access, transaction, prisma, query, locator, read };
}

describe('报告所属范围的持久化工具审计', () => {
  it('同事务授权后稳定分页，保留拒绝状态且响应不含内部 run 字段', async () => {
    const h = harness();
    const first = await h.read();
    expect(first).toMatchObject({ runId: h.report.row.id, hasMore: true });
    const second = await h.query.tools(
      comparisonOwner,
      h.report.row.id,
      { ...h.locator, limit: 1, cursor: first.nextCursor! },
      h.access,
    );
    expect(second.items[0]).toMatchObject({ status: 'denied', tool: 'deniedCapability' });
    expect(second.items[0]).not.toHaveProperty('aiRunId');
    expect(second.hasMore).toBe(false);
    expect(h.prisma.$transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(h.transaction.aiToolCall.findMany.mock.calls.at(-1)?.[0]).toMatchObject({
      where: { aiRunId: h.report.row.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 2,
    });
  });

  it.each(['owner', 'mode', 'revoked'] as const)('%s 不可访问时不读取审计', async (reason) => {
    const h = harness();
    if (reason === 'owner') h.report.row.researchOwnerId = '20000000-0000-4000-8000-000000000001';
    if (reason === 'mode')
      h.report.row.researchScopeSnapshot = {
        ...h.report.source.frozen.scopeSnapshot,
        mode: 'actual',
      };
    if (reason === 'revoked')
      h.access.assertSnapshot.mockRejectedValueOnce(new ForbiddenException('权限已撤回'));
    await expect(h.read()).rejects.toBeInstanceOf(
      reason === 'revoked' ? ForbiddenException : NotFoundException,
    );
    expect(h.transaction.aiToolCall.findMany).not.toHaveBeenCalled();
  });

  it('报告缺失与畸形定位器不能读取审计', async () => {
    const h = harness();
    h.transaction.aiRun.findFirst.mockResolvedValueOnce(null as never);
    await expect(h.read()).rejects.toBeInstanceOf(NotFoundException);
    expect(() =>
      h.query.tools(comparisonOwner, h.report.row.id, { ...h.locator, status: 'failed' }, h.access),
    ).toThrow();
    expect(h.transaction.aiToolCall.findMany).not.toHaveBeenCalled();
  });

  it('不能用其他对象或历史兼容入口读取同一 V2 报告', async () => {
    const h = harness();
    for (const locator of [
      { ...h.locator, scope: 'instrument', instrumentId: '20000000-0000-4000-8000-000000000001' },
      { view: 'legacy' },
    ]) {
      await expect(
        h.query.tools(comparisonOwner, h.report.row.id, locator, h.access),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(h.transaction.aiToolCall.findMany).not.toHaveBeenCalled();
  });

  it('拒绝跨报告、owner、范围及畸形游标，且不查询工具表', async () => {
    const h = harness();
    const first = await h.read();
    for (const [owner, run, locator, cursor] of [
      [comparisonOwner, '20000000-0000-4000-8000-000000000001', h.locator, first.nextCursor],
      ['20000000-0000-4000-8000-000000000001', h.report.row.id, h.locator, first.nextCursor],
      [comparisonOwner, h.report.row.id, { ...h.locator, mode: 'actual' }, first.nextCursor],
      [comparisonOwner, h.report.row.id, h.locator, 'invalid'],
    ] as const) {
      h.transaction.aiToolCall.findMany.mockClear();
      await expect(
        readResearchReportTools(h.transaction as never, owner, run, {
          ...locator,
          scope: 'all',
          limit: 1,
          cursor: cursor!,
        }),
      ).rejects.toThrow('游标无效');
      expect(h.transaction.aiToolCall.findMany).not.toHaveBeenCalled();
    }
  });
});
