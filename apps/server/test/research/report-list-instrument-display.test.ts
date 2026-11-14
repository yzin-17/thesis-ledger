import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AiResearchReportsQuery } from '../../src/ai/ai-research-reports.query.js';
import { comparisonOwner, comparisonReport } from './research-comparison.fixture.js';

function harness() {
  const report = comparisonReport();
  const calls = report.calls;
  const transaction = {
    aiRun: { findMany: vi.fn(async () => [report.row]) },
    aiToolCall: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        calls.filter((call) => where.id.in.includes(call.id)),
      ),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (read: (db: typeof transaction) => Promise<unknown>, options: unknown) => {
      expect(options).toEqual({
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      });
      return read(transaction);
    }),
  };
  const names = {
    resolveDirectory: vi.fn(async (symbols: string[]) => ({
      generation: 12,
      items: symbols.map((symbol) => ({
        symbol,
        canonicalCode: symbol.split('.')[0]!,
        instrumentType: 'STOCK',
        market: symbol.split('.')[1]!,
        displayName: '受控目录标的',
        active: true,
      })),
      unresolvedSymbols: [],
    })),
  };
  const access = {
    assertSnapshot: vi.fn(async () => {}),
    assertLegacy: vi.fn(async () => {}),
  };
  const query = new AiResearchReportsQuery(prisma as never, names as never);
  const mode =
    report.source.detail.historicalScope.status === 'known'
      ? report.source.detail.historicalScope.snapshot.mode
      : 'shadow';
  return { report, transaction, prisma, names, access, query, mode };
}

describe('研究列表标的展示目录', () => {
  it('仅对已授权可见报告的标的批量解析展示名，不修改冻结范围', async () => {
    const h = harness();
    const before = JSON.stringify(h.report.row.researchScopeSnapshot);
    const page = await h.query.list(
      comparisonOwner,
      { view: 'scoped', mode: h.mode },
      h.access,
    );
    expect(page.items).toHaveLength(1);
    expect(h.names.resolveDirectory).toHaveBeenCalledOnce();
    expect(h.names.resolveDirectory).toHaveBeenCalledWith(['600519.SH'], h.transaction);
    expect(page.instrumentDirectory?.items[0]).toMatchObject({
      symbol: '600519.SH',
      displayName: '受控目录标的',
    });
    expect(page.items[0]?.historicalScope).toEqual(h.report.source.detail.historicalScope);
    expect(JSON.stringify(h.report.row.researchScopeSnapshot)).toBe(before);
  });

  it('未授权的报告不触发名称查询，也不泄露目录信息', async () => {
    const h = harness();
    h.access.assertSnapshot.mockRejectedValueOnce(new (await import('@nestjs/common')).NotFoundException());
    const page = await h.query.list(
      comparisonOwner,
      { view: 'scoped', mode: h.mode },
      h.access,
    );
    expect(page.items).toEqual([]);
    expect(page.instrumentDirectory).toBeUndefined();
    expect(h.names.resolveDirectory).not.toHaveBeenCalled();
  });
});
