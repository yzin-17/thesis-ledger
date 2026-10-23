import { randomUUID } from 'node:crypto';
import { type Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { researchReportDetailSchema, researchReportPageSchema } from '@thesis-ledger/schemas';
import { databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { useResearchReportFixture, reportScope } from './research-report-postgres.fixture.js';

describe.skipIf(!databaseUrl)('研究产物读取：真实 HTTP、范围与保存事实', () => {
  const { ctx, completed, get } = useResearchReportFixture();
  it('列表、详情和引用消费原冻结材料，读取不取数、不运行模型、不改写任务', async () => {
    const { row, result } = await completed();
    const before = await ctx.prisma.aiRun.findUniqueOrThrow({ where: { id: row.id } });
    const dataCalls = ctx.harness.data.calls.length,
      modelCalls = ctx.harness.models.requests.length;
    await ctx.prisma.instrument.updateMany({ data: { active: false, generation: 99 } });
    const listed = await get();
    expect(listed.headers.get('cache-control')).toBe('no-store');
    expect(researchReportPageSchema.parse(await listed.json()).items).toMatchObject([
      { id: row.id, availability: 'available' },
    ]);
    const detail = researchReportDetailSchema.parse(await (await get('/' + row.id)).json());
    expect(detail.result).toEqual(result);
    expect(detail.submission).toEqual(
      (before.modelMetadata as { frozenResearch: { request: unknown } }).frozenResearch.request,
    );
    const reference = result.evidenceBindings[0]!;
    const evidence = await get(`/${row.id}/evidence/${reference.audit.evidenceId}`);
    expect(evidence.status).toBe(200);
    expect(await evidence.json()).toMatchObject({
      version: 2,
      runId: row.id,
      toolCallId: reference.toolCallId,
      evidence: { audit: reference.audit, data: { price: 100 } },
    });
    expect(await ctx.prisma.aiRun.findUniqueOrThrow({ where: { id: row.id } })).toEqual(before);
    expect(ctx.harness.data.calls).toHaveLength(dataCalls);
    expect(ctx.harness.models.requests).toHaveLength(modelCalls);
  });
  it('其他模式、对象或身份不能按报告/引用标识读取', async () => {
    const { row, result } = await completed();
    const ref = result.evidenceBindings[0]!.audit.evidenceId;
    for (const query of [
      { view: 'scoped', mode: 'actual' },
      { ...reportScope, scope: 'account', accountId: ctx.rows.primary.id },
    ]) {
      expect((await get('/' + row.id, query)).status).toBe(404);
      expect((await get(`/${row.id}/evidence/${ref}`, query)).status).toBe(404);
    }
    await ctx.prisma.aiRun.update({
      where: { id: row.id },
      data: { researchOwnerId: randomUUID() },
    });
    expect((await get('/' + row.id)).status).toBe(404);
    expect((await get(`/${row.id}/evidence/${ref}`)).status).toBe(404);
    expect(researchReportPageSchema.parse(await (await get()).json()).items).toEqual([]);
  });
  it('范围权限变化后列表隐藏，详情与引用拒绝；不扩展当前账户集合', async () => {
    const saved = await ctx.saved(
      await ctx.harness.post({
        ...ctx.input,
        scope: { scope: 'account', accountId: ctx.rows.primary.id },
      }),
    );
    expect((await get('/' + saved.run.id)).status).toBe(200);
    await ctx.prisma.account.update({
      where: { id: ctx.rows.primary.id },
      data: { mode: 'actual' },
    });
    expect(researchReportPageSchema.parse(await (await get()).json()).items).toEqual([]);
    expect((await get('/' + saved.run.id)).status).toBe(403);
    expect((await get(`/${saved.run.id}/evidence/${randomUUID()}`)).status).toBe(403);
  });
  it('同模式账户和持仓筛选只返回冻结对象；旧持仓关闭仍可读取已存报告', async () => {
    const first = await ctx.saved(
      await ctx.harness.post({
        ...ctx.input,
        submissionId: randomUUID(),
        scope: { scope: 'account', accountId: ctx.rows.primary.id },
      }),
    );
    await ctx.saved(
      await ctx.harness.post({
        ...ctx.input,
        submissionId: randomUUID(),
        scope: { scope: 'account', accountId: ctx.rows.second.id },
      }),
    );
    const position = await ctx.saved(
      await ctx.harness.post({
        ...ctx.input,
        submissionId: randomUUID(),
        scope: { scope: 'position', accountId: ctx.rows.primary.id, symbol: '600519.SH' },
      }),
    );
    const query = { ...reportScope, scope: 'account', accountId: ctx.rows.primary.id };
    const page = researchReportPageSchema.parse(await (await get('', query)).json());
    expect(page.items.map((row) => row.id)).toEqual([first.run.id]);
    const grouped = researchReportPageSchema.parse(
      await (await get('', { ...reportScope, kind: 'account' })).json(),
    );
    expect(grouped.items).toHaveLength(2);
    expect(
      grouped.items.every(
        (row) =>
          row.historicalScope.status === 'known' &&
          row.historicalScope.snapshot.scope === 'account',
      ),
    ).toBe(true);
    await ctx.prisma.position.deleteMany({
      where: { accountId: ctx.rows.primary.id, symbol: '600519.SH' },
    });
    expect((await get('/' + position.run.id)).status).toBe(200);
  });
  it('组合和策略筛选保持原范围，策略转让后撤销读取', async () => {
    const portfolio = await ctx.saved(
      await ctx.harness.post({
        ...ctx.input,
        submissionId: randomUUID(),
        scope: { scope: 'portfolio' },
      }),
    );
    const strategy = await ctx.saved(
      await ctx.harness.post({
        ...ctx.input,
        submissionId: randomUUID(),
        scope: { scope: 'strategy', strategyVersionId: ctx.rows.version.id },
      }),
    );
    const page = researchReportPageSchema.parse(
      await (await get('', { ...reportScope, scope: 'portfolio' })).json(),
    );
    expect(page.items.map((row) => row.id)).toEqual([portfolio.run.id]);
    expect(
      (
        await get('/' + strategy.run.id, {
          ...reportScope,
          scope: 'strategy',
          strategyVersionId: ctx.rows.version.id,
        })
      ).status,
    ).toBe(200);
    await ctx.prisma.strategy.update({
      where: { id: ctx.rows.strategy.id },
      data: { ownerId: randomUUID() },
    });
    expect((await get('/' + strategy.run.id)).status).toBe(404);
    const listed = researchReportPageSchema.parse(await (await get()).json());
    expect(listed.items.map((row) => row.id)).toEqual([portfolio.run.id]);
  });
  it('分页稳定推进；游标不能跨模式或范围重用', async () => {
    for (const account of [ctx.rows.primary, ctx.rows.second])
      await ctx.saved(
        await ctx.harness.post({
          ...ctx.input,
          submissionId: randomUUID(),
          scope: { scope: 'account', accountId: account.id },
        }),
      );
    const first = researchReportPageSchema.parse(
      await (await get('', { ...reportScope, limit: 1 })).json(),
    );
    expect(first.hasMore).toBe(true);
    const next = researchReportPageSchema.parse(
      await (await get('', { ...reportScope, limit: 1, cursor: first.nextCursor! })).json(),
    );
    expect(next.items[0]!.id).not.toBe(first.items[0]!.id);
    expect(next.hasMore).toBe(false);
    expect(
      (await get('', { view: 'scoped', mode: 'actual', cursor: first.nextCursor! })).status,
    ).toBe(400);
    expect(
      (
        await get('', {
          ...reportScope,
          scope: 'account',
          accountId: ctx.rows.primary.id,
          cursor: first.nextCursor!,
        })
      ).status,
    ).toBe(400);
  });
  it.each(['number', 'tool', 'fingerprint', 'result-scope', 'model', 'root-question'] as const)(
    '损坏 %s 的报告不返回伪造正文或引用',
    async (kind) => {
      const { row, result } = await completed();
      const metadata = structuredClone(row.modelMetadata) as Record<string, unknown>;
      if (kind === 'number') {
        const claim = result.inference.numericClaims[0]!;
        if (claim.kind === 'field') claim.source.value += 1;
      } else if (kind === 'fingerprint')
        (metadata.frozenResearch as { inputFingerprint: string }).inputFingerprint = '0'.repeat(64);
      else if (kind === 'result-scope') result.scopeSnapshot.mode = 'actual';
      else if (kind === 'model') result.model.modelId = 'forged';
      else if (kind === 'tool')
        await ctx.prisma.aiToolCall.updateMany({
          where: { aiRunId: row.id },
          data: { inputSummary: '{}' },
        });
      await ctx.prisma.aiRun.update({
        where: { id: row.id },
        data: {
          result: result as Prisma.InputJsonValue,
          modelMetadata: metadata as Prisma.InputJsonValue,
          ...(kind === 'root-question' ? { question: '改写的问题' } : {}),
        },
      });
      const detail = researchReportDetailSchema.parse(await (await get('/' + row.id)).json());
      expect(detail).toMatchObject({ availability: 'invalid', result: null, summary: null });
      expect(
        (await get(`/${row.id}/evidence/${result.evidenceBindings[0]!.audit.evidenceId}`)).status,
      ).toBe(404);
    },
  );
  it('严格身份与参数校验不扩权', async () => {
    expect((await get('', { ...reportScope, ownerId: randomUUID() })).status).toBe(400);
    expect((await get('/not-a-uuid')).status).toBe(400);
    vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account');
    expect((await get()).status).toBe(401);
  });
});
