import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { useResearchPrivatePostgresFixture } from './research-private-postgres.fixture.js';

describe.skipIf(!databaseUrl)('研究其余范围：单连接真实 PostgreSQL 与 HTTP', () => {
  const ctx = useResearchPrivatePostgresFixture();
  it('账户范围只冻结本账户，未知标的和已核对现金代次原样保留', async () => {
    const result = await ctx.saved(
      await ctx.harness.post({
        ...ctx.input,
        scope: { scope: 'account', accountId: ctx.rows.primary.id },
      }),
    );
    const data = result.frozen.evidence.find((entry) => entry.audit.kind === 'portfolio')!;
    expect(data.data).toMatchObject({
      accounts: [{ accountId: ctx.rows.primary.id }],
      unresolvedSymbols: ['UNKNOWN_RESEARCH'],
      cashBalances: [
        {
          settledAmount: '100',
          projectionGeneration: '2',
          asOfProjectionGeneration: '2',
          projectionStatus: 'current',
        },
      ],
    });
    const text = JSON.stringify(data.data);
    expect(text).not.toContain(ctx.rows.second.id);
    expect(text).not.toContain(ctx.rows.actual.id);
    expect(data.numericFields.some((field) => field.fieldPath.startsWith('/cashBalances/'))).toBe(
      true,
    );
    expect(result.frozen.scopeSnapshot).toMatchObject({
      scope: 'account',
      mode: 'shadow',
      accountId: ctx.rows.primary.id,
    });
    expect(ctx.harness.models.requests).toHaveLength(0);
  });
  it('组合固定当次实际模拟账户集合，不混入实际模式或编造未记录现金', async () => {
    const result = await ctx.saved(
      await ctx.harness.post({ ...ctx.input, scope: { scope: 'portfolio' } }),
    );
    if (result.frozen.scopeSnapshot.scope !== 'portfolio') throw new Error('组合范围缺失');
    expect(result.frozen.scopeSnapshot.accountIds.sort()).toEqual(
      [ctx.rows.primary.id, ctx.rows.second.id].sort(),
    );
    const data = result.frozen.evidence.find((entry) => entry.audit.kind === 'portfolio')!;
    expect(data.reasons).toContain('cash_balance_unrecorded');
    expect(JSON.stringify(data.data)).not.toContain(ctx.rows.actual.id);
  });
  it('持仓只读取选定记录，不附带同账户其他持仓或整账户现金', async () => {
    const result = await ctx.saved(
      await ctx.harness.post({
        ...ctx.input,
        scope: { scope: 'position', accountId: ctx.rows.primary.id, symbol: '600519.SH' },
      }),
    );
    expect(result.frozen.evidence[0]!.data).toMatchObject({
      scope: 'position',
      positions: [{ symbol: '600519.SH', quantity: '2.0000001' }],
      cashBalances: [],
    });
    expect(JSON.stringify(result.frozen.evidence[0]!.data)).not.toContain('UNKNOWN_RESEARCH');
    expect(result.frozen.evidence[0]!.numericFields).toHaveLength(2);
  });
  it('错误账户模式、未知命名组合或额外 query 在公开取数前拒绝', async () => {
    expect(
      (
        await ctx.harness.post({
          ...ctx.input,
          scope: { scope: 'account', accountId: ctx.rows.actual.id },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await ctx.harness.post({
          ...ctx.input,
          scope: { scope: 'portfolio', portfolioId: 'not-a-workspace' },
        })
      ).status,
    ).toBe(400);
    expect((await ctx.harness.post(ctx.input, `?accountId=${ctx.rows.actual.id}`)).status).toBe(
      400,
    );
    expect(ctx.harness.data.calls).toHaveLength(0);
    expect(await ctx.prisma.aiRun.count()).toBe(0);
  });
  it('策略按真实 owner 和不可变定义读取，不能读取他人版本或触发回测', async () => {
    expect(
      (
        await ctx.harness.post({
          ...ctx.input,
          scope: { scope: 'strategy', strategyVersionId: ctx.rows.foreignVersion.id },
        })
      ).status,
    ).toBe(404);
    expect(ctx.harness.data.calls).toHaveLength(0);
    const result = await ctx.saved(
      await ctx.harness.post({
        ...ctx.input,
        scope: { scope: 'strategy', strategyVersionId: ctx.rows.version.id },
      }),
    );
    expect(result.frozen.evidence[0]!.data).toMatchObject({
      version: 'research-strategy-material-v2',
      strategyVersionId: ctx.rows.version.id,
      definition: { name: '受控策略定义' },
    });
    expect(result.frozen.evidence.some((entry) => entry.audit.kind === 'portfolio')).toBe(false);
    expect(await ctx.prisma.backtestJob.count()).toBe(0);
    expect(ctx.harness.models.requests).toHaveLength(0);
  });
  it('现金投影陈旧时保留原始记录与未知，不开放为当前余额引用', async () => {
    await ctx.prisma.accountLedgerState.update({
      where: { accountId: ctx.rows.primary.id },
      data: { projectionGeneration: 3n },
    });
    const result = await ctx.saved(
      await ctx.harness.post({
        ...ctx.input,
        scope: { scope: 'account', accountId: ctx.rows.primary.id },
      }),
    );
    const data = result.frozen.evidence[0]!;
    expect(data.data).toMatchObject({
      cashBalances: [{ settledAmount: '100', projectionStatus: 'stale' }],
    });
    expect(data.numericFields.some((field) => field.fieldPath.startsWith('/cashBalances/'))).toBe(
      false,
    );
    expect(data.reasons).toContain('cash_projection_unverified');
  });
  it('找回已关闭持仓使用原冻结材料，不查询最新持仓重写旧报告', async () => {
    const body = {
      ...ctx.input,
      scope: { scope: 'position', accountId: ctx.rows.primary.id, symbol: '600519.SH' },
    };
    const original = await ctx.saved(await ctx.harness.post(body));
    const calls = ctx.harness.data.calls.length;
    await ctx.prisma.position.deleteMany({
      where: { accountId: ctx.rows.primary.id, symbol: '600519.SH' },
    });
    const found = await ctx.saved(await ctx.harness.post(body, '/find'));
    expect(found.frozen).toEqual(original.frozen);
    expect(ctx.harness.data.calls).toHaveLength(calls);
  });
  it('真实登录身份不自动获得共享账本权限；合法策略归属仍可读取', async () => {
    const session = await ctx.harness.identities.register({
      username: `research_${randomUUID().slice(0, 8)}`,
      displayName: '受控登录用户',
      password: 'controlled-password-123',
    });
    ctx.users.push(session.principal.id);
    vi.stubEnv('STRATEGY_IDENTITY_MODE', 'account');
    expect(
      (
        await ctx.harness.post(
          { ...ctx.input, scope: { scope: 'account', accountId: ctx.rows.primary.id } },
          '',
          undefined,
          session.token,
        )
      ).status,
    ).toBe(403);
    expect(ctx.harness.data.calls).toHaveLength(0);
    await ctx.prisma.strategy.update({
      where: { id: ctx.rows.strategy.id },
      data: { ownerId: session.principal.id },
    });
    const result = await ctx.saved(
      await ctx.harness.post(
        { ...ctx.input, scope: { scope: 'strategy', strategyVersionId: ctx.rows.version.id } },
        '',
        undefined,
        session.token,
      ),
    );
    expect(result.run.researchOwnerId).toBe(session.principal.id);
    expect(ctx.harness.models.requests).toHaveLength(0);
  });
  it('准备期间默认模型修订变化时不提交任务，范围读取不修改账本原始字段', async () => {
    const before = await ctx.prisma.position.findMany({
      orderBy: [{ accountId: 'asc' }, { symbol: 'asc' }],
    });
    ctx.harness.data.setMode('hold-quote');
    const pending = ctx.harness.post({
      ...ctx.input,
      scope: { scope: 'account', accountId: ctx.rows.primary.id },
    });
    await ctx.harness.data.quoteStarted();
    await ctx.prisma.aiRoutingSettings.update({
      where: { id: 'global' },
      data: { revision: { increment: 1 } },
    });
    ctx.harness.data.release();
    const response = await pending;
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'RESEARCH_SETTINGS_REVISION_CHANGED' });
    expect(await ctx.prisma.aiRun.count()).toBe(0);
    expect(
      await ctx.prisma.position.findMany({ orderBy: [{ accountId: 'asc' }, { symbol: 'asc' }] }),
    ).toEqual(before);
    expect(await ctx.prisma.trade.count()).toBe(0);
    expect(await ctx.prisma.ledgerEvent.count()).toBe(0);
  });
});
