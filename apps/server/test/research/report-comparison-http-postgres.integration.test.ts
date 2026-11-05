import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { researchReportComparisonSchema, type ResearchSubmissionV2 } from '@thesis-ledger/schemas';
import { databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { useResearchReportFixture, reportScope } from './research-report-postgres.fixture.js';
import { localIdentityPrincipal } from '../../src/identity/local-workspace.js';
import { comparisonReport } from './research-comparison.fixture.js';

describe.skipIf(!databaseUrl)('冻结比较：真实 HTTP 与隔离 PostgreSQL', () => {
  const { ctx, completed, legacy, get } = useResearchReportFixture();

  // 直接保存已核验的合成冻结产物与原始 Tool 行，读取仍经过真实 ORM/HTTP 投影。
  async function stored(
    mode: 'actual' | 'shadow',
    templateId: NonNullable<ResearchSubmissionV2['templateId']> = 'counter-evidence',
  ) {
    const fixture = comparisonReport({
      frozen: (value) => {
        value.request.mode = mode;
        value.scopeSnapshot.mode = mode;
        value.request.templateId = templateId;
      },
    });
    const row = fixture.row;
    await ctx.prisma.aiRun.create({
      data: {
        id: row.id,
        status: 'succeeded',
        provider: row.provider,
        model: row.model,
        question: row.question,
        promptVersion: row.promptVersion,
        researchOwnerId: localIdentityPrincipal()!.id,
        researchSubmissionId: row.researchSubmissionId,
        researchInputDigest: row.researchInputDigest,
        researchScopeSnapshot: row.researchScopeSnapshot as Prisma.InputJsonValue,
        context: {},
        modelMetadata: row.modelMetadata as Prisma.InputJsonValue,
        result: row.result as Prisma.InputJsonValue,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        completedAt: row.completedAt,
      },
    });
    await ctx.prisma.aiToolCall.createMany({
      data: fixture.calls.map((call) => ({
        id: call.id,
        aiRunId: row.id,
        status: 'ok',
        tool: call.tool,
        permission: call.permission,
        provider: call.provider,
        inputSummary: call.inputSummary,
        outputSummary: '受控历史引用',
      })),
    });
    return row;
  }

  it('真实完成时间/UUID 全序选择前序，更新时间、不同模板和显式选择分别处理', async () => {
    const a = await completed(),
      b = await completed();
    const other = await stored('shadow', 'primary-risks');
    const current = await completed();
    const time = Date.parse(current.result.createdAt);
    await ctx.prisma.aiRun.updateMany({
      where: { id: { in: [a.row.id, b.row.id] } },
      data: { completedAt: new Date(time + 1000) },
    });
    await ctx.prisma.aiRun.update({
      where: { id: other.id },
      data: { completedAt: new Date(time + 2000) },
    });
    await ctx.prisma.aiRun.update({
      where: { id: current.row.id },
      data: { completedAt: new Date(time + 3000) },
    });
    const [low, high] = [a.row.id, b.row.id].sort();
    await ctx.prisma.aiRun.update({
      where: { id: low! },
      data: { updatedAt: new Date('2099-01-01T00:00:00Z') },
    });
    const ids = [a.row.id, b.row.id, other.id, current.row.id];
    const before = await ctx.prisma.aiRun.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
    });
    const calls = [ctx.harness.data.calls.length, ctx.harness.models.requests.length];
    const response = await get(`/${current.row.id}/comparison`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const value = researchReportComparisonSchema.parse(await response.json());
    expect(value.status).toBe('compared');
    expect(value.previous?.id).toBe(high);
    const chosen = await get(`/${current.row.id}/comparison`, { ...reportScope, beforeId: low! });
    expect(researchReportComparisonSchema.parse(await chosen.json()).previous?.id).toBe(low);
    expect([ctx.harness.data.calls.length, ctx.harness.models.requests.length]).toEqual(calls);
    expect(
      await ctx.prisma.aiRun.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } }),
    ).toEqual(before);
  });

  it('显式前序的 owner 隔离与不存在一致', async () => {
    const previous = await completed(),
      current = await completed();
    await ctx.prisma.aiRun.update({
      where: { id: previous.row.id },
      data: { researchOwnerId: randomUUID() },
    });
    const hidden = await get(`/${current.row.id}/comparison`, {
      ...reportScope,
      beforeId: previous.row.id,
    });
    const absent = await get(`/${current.row.id}/comparison`, {
      ...reportScope,
      beforeId: randomUUID(),
    });
    expect(hidden.status).toBe(404);
    expect(absent.status).toBe(404);
    expect(await hidden.json()).toEqual(await absent.json());
  });

  it('显式另一端即使 owner 相同，也要重新检查当前账户权限', async () => {
    const previous = await ctx.saved(
      await ctx.harness.post({
        ...ctx.input,
        submissionId: randomUUID(),
        scope: { scope: 'account', accountId: ctx.rows.primary.id },
      }),
    );
    const current = await completed();
    await ctx.prisma.account.update({
      where: { id: ctx.rows.primary.id },
      data: { mode: 'actual' },
    });
    expect(
      (await get(`/${current.row.id}/comparison`, { ...reportScope, beforeId: previous.run.id }))
        .status,
    ).toBe(403);
  });

  it('两个有权限的模式可以显式选取，但不能产生跨模式字段差异', async () => {
    const current = await completed();
    const previous = await stored('actual');
    const response = await get(`/${current.row.id}/comparison`, {
      ...reportScope,
      beforeId: previous.id,
    });
    expect(response.status).toBe(200);
    const value = researchReportComparisonSchema.parse(await response.json());
    expect(value.status).toBe('incompatible');
    expect(value.issues.map((issue) => issue.code)).toContain('mode');
    expect(value.groups.every((group) => group.status === 'unavailable')).toBe(true);
  });

  it('旧 V1 原报告保留且缺少可比范围时明确未知', async () => {
    const current = await completed(),
      previous = await legacy(false);
    const before = await ctx.prisma.aiRun.findUniqueOrThrow({ where: { id: previous.id } });
    const response = await get(`/${current.row.id}/comparison`, {
      ...reportScope,
      beforeId: previous.id,
    });
    expect(response.status).toBe(200);
    const value = researchReportComparisonSchema.parse(await response.json());
    expect(value.status).toBe('unavailable');
    expect(value.issues[0]?.code).toBe('legacy_fields_missing');
    expect(await ctx.prisma.aiRun.findUniqueOrThrow({ where: { id: previous.id } })).toEqual(
      before,
    );
  });

  it('无前序与查找失败分别处理，拒绝自身比较和夹带参数', async () => {
    const current = await completed();
    const response = await get(`/${current.row.id}/comparison`);
    expect(researchReportComparisonSchema.parse(await response.json()).status).toBe('no_previous');
    expect(
      (await get(`/${current.row.id}/comparison`, { ...reportScope, beforeId: current.row.id }))
        .status,
    ).toBe(400);
    expect(
      (await get(`/${current.row.id}/comparison`, { ...reportScope, ownerId: randomUUID() }))
        .status,
    ).toBe(400);
  });
});
