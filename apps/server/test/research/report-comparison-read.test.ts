import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AiResearchReportsQuery } from '../../src/ai/ai-research-reports.query.js';
import { compareResearchReports } from '../../src/research/research-report-comparison.js';
import { comparisonOwner, comparisonReport } from './research-comparison.fixture.js';

type Report = ReturnType<typeof comparisonReport>;
function reader(current: Report, candidates: Report[] = []) {
  const reports = new Map([current, ...candidates].map((report) => [report.row.id, report]));
  let offset = 0;
  const access = { assertSnapshot: vi.fn(async () => {}), assertLegacy: vi.fn(async () => {}) };
  const transaction = {
    aiRun: {
      findFirst: vi.fn(async ({ where }) => {
        const id = where.id ?? where.AND.find((entry: { id?: string }) => entry.id)?.id;
        const report = reports.get(id);
        if (
          !report ||
          (report.row.researchOwnerId && report.row.researchOwnerId !== comparisonOwner)
        )
          return null;
        return report.row;
      }),
      // 返回指定数据库页；排序、键集条件和 owner 过滤另检查实际 Prisma 查询。
      findMany: vi.fn(async ({ take }) => {
        const page = candidates.slice(offset, offset + take).map((report) => report.row);
        offset += take - 1;
        return page;
      }),
    },
    aiToolCall: {
      findMany: vi.fn(async ({ where }) =>
        [...reports.values()]
          .flatMap((report) => report.calls)
          .filter((call) => call.aiRunId === where.aiRunId && where.id.in.includes(call.id)),
      ),
    },
    $queryRaw: vi.fn(async () => [{ internal: false }]),
  };
  const prisma = {
    $transaction: vi.fn(async (work, options?: unknown) => {
      expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return work(transaction);
    }),
  };
  const query = new AiResearchReportsQuery(prisma as never);
  return {
    query,
    transaction,
    prisma,
    access,
    read: (beforeId?: string) =>
      query.comparisonInputs(
        comparisonOwner,
        current.row.id,
        {
          view: 'scoped',
          mode: current.source.frozen.scopeSnapshot.mode,
          ...(beforeId ? { beforeId } : {}),
        },
        access,
      ),
  };
}

describe('冻结比较只读授权与默认前序', () => {
  it('真实冻结/数字/Tool 关联投影后分别授权，两端在同一只读快照读取', async () => {
    const current = comparisonReport(),
      previous = comparisonReport();
    const h = reader(current, [previous]);
    const input = await h.read(previous.row.id);
    expect(input.previous?.detail.availability).toBe('available');
    expect(compareResearchReports(input).status).toBe('compared');
    expect(h.access.assertSnapshot).toHaveBeenCalledTimes(2);
    expect(h.transaction.aiToolCall.findMany).toHaveBeenCalledTimes(2);
    expect(h.prisma.$transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  });

  it('显式另一端用自身模式授权，随后返回不可比维度', async () => {
    const current = comparisonReport();
    const previous = comparisonReport({
      frozen: (value) => {
        value.request.mode = 'actual';
        value.scopeSnapshot.mode = 'actual';
      },
    });
    const h = reader(current, [previous]);
    const result = compareResearchReports(await h.read(previous.row.id));
    expect(result.status).toBe('incompatible');
    expect(result.issues.map((issue) => issue.code)).toContain('mode');
    expect(h.access.assertSnapshot).toHaveBeenCalledTimes(2);
  });

  it('其他 owner 的 UUID 与不存在一致，不返回部分报告', async () => {
    const current = comparisonReport(),
      previous = comparisonReport();
    previous.row.researchOwnerId = '30000000-0000-4000-8000-000000000001';
    const h = reader(current, [previous]);
    await expect(h.read(previous.row.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.access.assertSnapshot).toHaveBeenCalledTimes(1);
    const where = h.transaction.aiRun.findFirst.mock.calls[1]?.[0].where;
    expect(where.OR).toContainEqual({ researchOwnerId: comparisonOwner });
  });

  it('owner 相同仍不能绕过另一端当前权限', async () => {
    const current = comparisonReport(),
      previous = comparisonReport();
    const h = reader(current, [previous]);
    h.access.assertSnapshot
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ForbiddenException());
    await expect(h.read(previous.row.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.transaction.aiToolCall.findMany).toHaveBeenCalledTimes(1);
  });

  it('默认跳过权限撤回及损坏报告，完成时间/UUID 稳定排序不读取可变更新时间', async () => {
    const current = comparisonReport(),
      denied = comparisonReport(),
      invalid = comparisonReport(),
      previous = comparisonReport();
    invalid.row.result = null;
    previous.row.updatedAt = new Date('2099-01-01T00:00:00Z');
    const h = reader(current, [denied, invalid, previous]);
    h.access.assertSnapshot
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ForbiddenException());
    const result = await h.read();
    expect(result.previous?.detail.id).toBe(previous.row.id);
    const args = h.transaction.aiRun.findMany.mock.calls[0]?.[0];
    expect(args.orderBy).toEqual([{ completedAt: 'desc' }, { id: 'desc' }]);
    expect(args.where.AND).toContainEqual({ status: 'succeeded', completedAt: { not: null } });
    expect(args.where.AND).toContainEqual({
      OR: [
        { completedAt: { lt: current.row.completedAt } },
        { completedAt: current.row.completedAt, id: { lt: current.row.id } },
      ],
    });
    expect(args.take).toBe(51);
    expect(JSON.stringify(args.where)).toContain(comparisonOwner);
  });

  it.each([200, 201])('扫描 %s 个损坏候选时区分穷尽与未完成，最多核验 200 个', async (count) => {
    const current = comparisonReport();
    const candidates = Array.from({ length: count }, () => {
      const value = comparisonReport();
      value.row.result = null;
      return value;
    });
    const h = reader(current, candidates);
    const result = await h.read();
    expect(result.searchStatus).toBe(count === 200 ? 'complete' : 'truncated');
    expect(h.transaction.aiRun.findMany).toHaveBeenCalledTimes(4);
    expect(h.access.assertSnapshot).toHaveBeenCalledTimes(201);
    expect(compareResearchReports(result).status).toBe(
      count === 200 ? 'no_previous' : 'search_incomplete',
    );
  });

  it('完成时间未知不能猜测默认前序', async () => {
    const current = comparisonReport();
    current.row.completedAt = null;
    const h = reader(current);
    expect((await h.read()).searchStatus).toBe('completion_unrecorded');
    expect(h.transaction.aiRun.findMany).not.toHaveBeenCalled();
  });

  it('没有成功结果时只返回不可用状态', async () => {
    const current = comparisonReport();
    current.row.status = 'running';
    current.row.result = null;
    const h = reader(current);
    expect(compareResearchReports(await h.read()).status).toBe('unavailable');
    expect(h.transaction.aiRun.findMany).not.toHaveBeenCalled();
  });

  it('数据库查询失败不冒充没有前序', async () => {
    const h = reader(comparisonReport());
    h.transaction.aiRun.findMany.mockRejectedValueOnce(new Error('controlled read failure'));
    await expect(h.read()).rejects.toThrow('controlled read failure');
  });

  it('冻结材料损坏不会重算摘要，也不误标成旧 V1 缺范围', async () => {
    const current = comparisonReport();
    current.row.modelMetadata = {
      frozenResearch: { ...current.source.frozen, inputFingerprint: '0'.repeat(64) },
    } as never;
    const h = reader(current);
    const value = compareResearchReports(await h.read());
    expect(value.status).toBe('unavailable');
    expect(value.issues[0]?.code).toBe('result_unavailable');
    expect(h.transaction.aiRun.findMany).not.toHaveBeenCalled();
    expect(
      (current.row.modelMetadata as { frozenResearch: { inputFingerprint: string } }).frozenResearch
        .inputFingerprint,
    ).toBe('0'.repeat(64));
  });

  it('严格拒绝自身比较及夹带 owner 参数', async () => {
    const current = comparisonReport(),
      h = reader(current);
    expect(() => h.read(current.row.id.toUpperCase())).toThrow('请选择另一份研究报告');
    expect(() =>
      h.query.comparisonInputs(
        comparisonOwner,
        current.row.id,
        { view: 'scoped', mode: 'shadow', ownerId: comparisonOwner },
        h.access,
      ),
    ).toThrow();
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('历史内部优化任务不能通过比较入口访问', async () => {
    const current = comparisonReport(),
      previous = comparisonReport();
    previous.row.researchOwnerId = null;
    previous.row.promptVersion = 'research-v1';
    const h = reader(current, [previous]);
    h.transaction.$queryRaw.mockResolvedValueOnce([{ internal: true }]);
    await expect(h.read(previous.row.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.access.assertLegacy).not.toHaveBeenCalled();
  });
});
