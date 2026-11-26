import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { researchReportPageSchema } from '@thesis-ledger/schemas';
import { databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { useResearchReportFixture } from './research-report-postgres.fixture.js';

describe.skipIf(!databaseUrl)('具名研究报告读取与退役入口边界', () => {
  const { ctx, legacy, completed, get } = useResearchReportFixture();
  const retired = { view: 'legacy' };
  it('只读创建资格随已验证主体和开关返回，不读取来源或创建模型任务', async () => {
    const local = await ctx.harness.get('/research/capabilities');
    expect(local.headers.get('cache-control')).toBe('no-store');
    expect(await local.json()).toMatchObject({
      version: 'research-capabilities-v1',
      canCreate: true,
      scopes: ['instrument', 'portfolio', 'account', 'position', 'strategy'],
    });
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'false');
    const user = await ctx.harness.identities.register({
      username: 'scope_' + randomUUID().slice(0, 8),
      displayName: '受控范围用户',
      password: 'Controlled-fixture-password-42',
    });
    ctx.users.push(user.principal.id);
    vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account');
    const current = await ctx.harness.get('/research/capabilities', {}, user.token);
    expect(await current.json()).toMatchObject({
      canCreate: false,
      scopes: ['instrument', 'strategy'],
    });
    expect(
      (await ctx.harness.get('/research/capabilities', { ownerId: randomUUID() }, user.token))
        .status,
    ).toBe(400);
    expect(ctx.harness.data.calls).toHaveLength(0);
    expect(ctx.harness.models.requests).toHaveLength(0);
    expect(await ctx.prisma.aiRun.count()).toBe(0);
  });
  it('旧 context.mode 不进入模式列表，退役查询也不改写原报告和引用', async () => {
    const old = await legacy();
    expect(researchReportPageSchema.parse(await (await get()).json()).items).toEqual([]);
    expect((await get('', retired)).status).toBe(400);
    expect((await get('/' + old.id, retired)).status).toBe(400);
    expect((await get(`/${old.id}/evidence/${old.callId}`, retired)).status).toBe(400);
    expect((await get('/' + old.id)).status).toBe(404);
    expect((await get(`/${old.id}/evidence/${old.callId}`)).status).toBe(404);
    expect((await get('', { ...retired, mode: 'actual' })).status).toBe(400);
    expect((await ctx.prisma.aiRun.findUniqueOrThrow({ where: { id: old.id } })).result).toEqual(old.result);
    expect(await ctx.prisma.aiToolCall.findUnique({ where: { id: old.callId } })).toMatchObject({
      aiRunId: old.id, status: 'ok',
    });
    expect(ctx.harness.models.requests).toHaveLength(0);
  });
  it('没有冻结范围和引用归属的旧报告不可从具名入口读取', async () => {
    const old = await legacy(false);
    expect((await get('/' + old.id)).status).toBe(404);
    expect((await get(`/${old.id}/evidence/${old.callId}`)).status).toBe(404);
  });
  it('不能将别人任务的 Tool 标识作为旧报告引用', async () => {
    const first = await legacy(),
      second = await legacy();
    const result = structuredClone(first.result);
    result.evidence[0]!.citations[0]!.toolCallId = second.callId;
    await ctx.prisma.aiRun.update({
      where: { id: first.id },
      data: { result: result as Prisma.InputJsonValue },
    });
    expect((await get('/' + first.id)).status).toBe(404);
    expect((await get(`/${first.id}/evidence/${second.callId}`)).status).toBe(404);
  });
  it('无具名根绑定的研究和日记记录均不进入报告列表', async () => {
    const old = await legacy();
    await ctx.prisma.aiRun.update({ where: { id: old.id }, data: { result: { version: 2 } } });
    expect((await get('/' + old.id)).status).toBe(404);
    await ctx.prisma.aiRun.update({
      where: { id: old.id },
      data: { promptVersion: 'journal-period-review-v1' },
    });
    expect((await get('/' + old.id)).status).toBe(404);
    expect(researchReportPageSchema.parse(await (await get()).json()).items).toEqual([]);
  });
  it('实际优化尝试关系与未知元数据都阻止通用历史误收内部报告', async () => {
    const old = await legacy();
    const experimentId = randomUUID(),
      attemptId = randomUUID();
    await ctx.prisma.$executeRaw(
      Prisma.sql`INSERT INTO "OptimizationExperiment" ("id", "ownerKey", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds", "idempotencyKey") VALUES (${experimentId}::uuid, 'research-read-test', ${ctx.rows.version.id}::uuid, 'succeeded', 'complete', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'controlled', '{}'::jsonb, '{}'::jsonb, 1, ${experimentId})`,
    );
    try {
      await ctx.prisma.$executeRaw(
        Prisma.sql`INSERT INTO "OptimizationAttempt" ("id", "experimentId", "modelKey", "aiRunId", "attempt", "status") VALUES (${attemptId}::uuid, ${experimentId}::uuid, 'controlled-model', ${old.id}::uuid, 1, 'succeeded')`,
      );
      expect((await get('/' + old.id)).status).toBe(404);
      expect(researchReportPageSchema.parse(await (await get()).json()).items).toEqual([]);
    } finally {
      await ctx.prisma.$executeRaw(
        Prisma.sql`DELETE FROM "OptimizationAttempt" WHERE "id"=${attemptId}::uuid`,
      );
      await ctx.prisma.$executeRaw(
        Prisma.sql`DELETE FROM "OptimizationExperiment" WHERE "id"=${experimentId}::uuid`,
      );
    }
    await ctx.prisma.aiRun.update({
      where: { id: old.id },
      data: { modelMetadata: { optimizationExperimentId: randomUUID() } },
    });
    expect((await get('/' + old.id)).status).toBe(404);
  });
  it('注册身份与当前策略所有权均不能补造历史报告的冻结范围', async () => {
    const ledger = await legacy();
    const strategy = await legacy(true, {
      scope: 'strategy',
      strategyVersionId: ctx.rows.version.id,
    });
    const registered = await ctx.harness.identities.register({
      displayName: '受控读取身份',
      username: 'research_read_' + randomUUID().slice(0, 8),
      password: 'Controlled-fixture-password-42',
    });
    ctx.users.push(registered.principal.id);
    vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account');
    const session = registered.token;
    expect((await get('/' + ledger.id, undefined, session)).status).toBe(404);
    expect((await get('/' + strategy.id, undefined, session)).status).toBe(404);
    await ctx.prisma.strategy.update({
      where: { id: ctx.rows.strategy.id },
      data: { ownerId: registered.principal.id },
    });
    expect((await get('/' + strategy.id, undefined, session)).status).toBe(404);
    const page = researchReportPageSchema.parse(await (await get('', undefined, session)).json());
    expect(page.items).toEqual([]);
  });
  it('V2 不能经旧任务列表、详情、Tool、预填或冻结入口绕过范围验证', async () => {
    const { row } = await completed();
    for (const path of [
      '/ai/runs',
      '/ai/runs/' + row.id,
      '/ai/runs/' + row.id + '?view=research',
    ]) {
      const [pathname, search] = path.split('?');
      const response = await ctx.harness.get(pathname!, search ? { view: 'research' } : {});
      expect(await response.text()).not.toContain(row.id);
    }
    expect((await ctx.harness.get(`/ai/runs/${row.id}/tool-calls`)).status).toBe(404);
    expect((await ctx.harness.get(`/ai/runs/${row.id}/retry-prefill`)).status).toBe(404);
    await expect(
      ctx.harness.models.runs.checkpoint(row.id, { forged: true }),
    ).rejects.toMatchObject({ code: 'P2025' });
    expect((await get('/' + row.id)).status).toBe(200);
  });
});
