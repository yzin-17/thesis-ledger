import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { researchReportDetailSchema, researchReportPageSchema } from '@thesis-ledger/schemas';
import { databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { useResearchReportFixture } from './research-report-postgres.fixture.js';

describe.skipIf(!databaseUrl)('研究历史兼容读取与旧入口边界', () => {
  const { ctx, legacy, completed, get } = useResearchReportFixture();
  const query = { view: 'legacy' };
  it('只读创建资格随已验证主体和开关返回，不读取来源或创建模型任务', async () => {
    const local = await ctx.harness.get('/research/capabilities');
    expect(local.headers.get('cache-control')).toBe('no-store');
    expect(await local.json()).toMatchObject({
      version: 'research-capabilities-v2',
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
  it('旧 context.mode 不进入模式列表；显式历史入口保留原 V1 和引用审计', async () => {
    const old = await legacy();
    expect(researchReportPageSchema.parse(await (await get()).json()).items).toEqual([]);
    const page = researchReportPageSchema.parse(await (await get('', query)).json());
    expect(page.items).toMatchObject([
      {
        id: old.id,
        historicalScope: { status: 'unrecorded', snapshot: null, label: '历史范围未记录' },
      },
    ]);
    const detail = researchReportDetailSchema.parse(await (await get('/' + old.id, query)).json());
    expect(detail.result).toEqual(old.result);
    expect(detail.availability).toBe('available');
    const reference = await get(`/${old.id}/evidence/${old.callId}`, query);
    expect(await reference.json()).toMatchObject({
      version: 1,
      runId: old.id,
      toolCall: { id: old.callId, status: 'ok' },
    });
    expect((await get('/' + old.id)).status).toBe(404);
    expect((await get('', { ...query, mode: 'actual' })).status).toBe(400);
    expect(ctx.harness.models.requests).toHaveLength(0);
  });
  it('缺少引用归属的旧正文仍可查看，但待核验并拒绝引用明细', async () => {
    const old = await legacy(false);
    const detail = researchReportDetailSchema.parse(await (await get('/' + old.id, query)).json());
    expect(detail).toMatchObject({
      availability: 'pending_verification',
      result: { conclusion: old.result.conclusion },
    });
    expect((await get(`/${old.id}/evidence/${old.callId}`, query)).status).toBe(404);
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
    expect(await (await get('/' + first.id, query)).json()).toMatchObject({
      availability: 'pending_verification',
    });
    expect((await get(`/${first.id}/evidence/${second.callId}`, query)).status).toBe(404);
  });
  it('无 V2 根绑定的其他版本不升级为可信报告；Journal 不混入历史', async () => {
    const old = await legacy();
    await ctx.prisma.aiRun.update({ where: { id: old.id }, data: { result: { version: 2 } } });
    expect(await (await get('/' + old.id, query)).json()).toMatchObject({
      availability: 'unsupported',
      resultVersion: null,
      result: null,
    });
    await ctx.prisma.aiRun.update({
      where: { id: old.id },
      data: { promptVersion: 'journal-period-review-v1' },
    });
    expect((await get('/' + old.id, query)).status).toBe(404);
    expect(researchReportPageSchema.parse(await (await get('', query)).json()).items).toEqual([]);
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
      expect((await get('/' + old.id, query)).status).toBe(404);
      expect(researchReportPageSchema.parse(await (await get('', query)).json()).items).toEqual([]);
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
    expect((await get('/' + old.id, query)).status).toBe(404);
  });
  it('注册身份不自动获得本机历史账本；策略仍按当前版本归属读取', async () => {
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
    expect((await get('/' + ledger.id, query, session)).status).toBe(403);
    expect((await get('/' + strategy.id, query, session)).status).toBe(404);
    await ctx.prisma.strategy.update({
      where: { id: ctx.rows.strategy.id },
      data: { ownerId: registered.principal.id },
    });
    expect((await get('/' + strategy.id, query, session)).status).toBe(200);
    const page = researchReportPageSchema.parse(await (await get('', query, session)).json());
    expect(page.items.map((row) => row.id)).toEqual([strategy.id]);
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
    expect(await ctx.harness.models.runs.frozenEvidence(row.id)).toBeNull();
    await expect(
      ctx.harness.models.runs.checkpoint(row.id, { forged: true }),
    ).rejects.toMatchObject({ code: 'P2025' });
    expect((await get('/' + row.id)).status).toBe(200);
  });
});
