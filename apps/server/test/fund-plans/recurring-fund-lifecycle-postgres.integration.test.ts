import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  recurringFundInvestmentOccurrenceSchema,
  recurringFundInvestmentPlanSchema,
} from '@thesis-ledger/schemas';
import {
  createFundPostgresFixture,
  fundConfirmation,
  fundDatabaseUrl,
  type FundPostgresFixture,
} from './recurring-fund-postgres.fixture.js';

const isolated = fundDatabaseUrl ? describe : describe.skip;

isolated('基金定投隔离 PostgreSQL 状态机', () => {
  let fixture: FundPostgresFixture;
  beforeAll(async () => {
    fixture = await createFundPostgresFixture();
  });
  afterAll(async () => {
    await fixture?.close();
  });

  it.each([{ type: 'securities' }, { type: 'cash' }, { mode: 'shadow' }, { active: false }])(
    '非真实有效基金账户 %j 拒绝创建',
    async (scope) => {
      const account = await fixture.account(scope);
      const response = await fixture.http('fund-investment-plans', {
        accountId: account.id,
        name: '拒绝创建夹具',
        symbol: '000001.OF',
        expectedAmount: '1000',
        dayOfMonth: 1,
        startPeriod: '2026-01',
      });
      expect(response.status).toBe(400);
      expect(
        await fixture.prisma.recurringFundInvestmentPlan.count({
          where: { accountId: account.id },
        }),
      ).toBe(0);
    },
  );

  it.each([
    { symbol: '000002.OF', assetType: 'fund', identityStatus: 'unresolved' },
    { symbol: '000003.OF', assetType: 'stock', identityStatus: 'confirmed' },
  ])('未确认或非基金资产 %j 拒绝创建', async (asset) => {
    const account = await fixture.account();
    await fixture.prisma.asset.create({
      data: { ...asset, name: '受限资产夹具', market: 'CN', currency: 'CNY' },
    });
    expect(
      (
        await fixture.http('fund-investment-plans', {
          accountId: account.id,
          name: '拒绝创建夹具',
          symbol: asset.symbol,
          expectedAmount: '1000',
          dayOfMonth: 1,
          startPeriod: '2026-01',
        })
      ).status,
    ).toBe(400);
  });

  it('编辑只改变未来记录，旧版本拒绝且历史金额和名称保持冻结', async () => {
    const { plan, occurrence } = await fixture.pending();
    const current = await fixture.prisma.recurringFundInvestmentPlan.findUniqueOrThrow({
      where: { id: plan.id },
    });
    const patch = {
      expectedVersion: current.version,
      name: '新名称',
      expectedAmount: '2000',
      dayOfMonth: 15,
    };
    const changed = await fixture.http(`fund-investment-plans/${plan.id}`, patch, 'PATCH');
    expect(changed.status).toBe(200);
    expect(recurringFundInvestmentPlanSchema.parse(changed.body)).toMatchObject({
      version: current.version + 1,
      name: '新名称',
      expectedAmount: '2000',
    });
    expect((await fixture.http(`fund-investment-plans/${plan.id}`, patch, 'PATCH')).status).toBe(
      409,
    );
    await fixture.plans.materializeDue(new Date('2026-02-15T01:00:00Z'));
    const frozen = await fixture.prisma.recurringFundInvestmentOccurrence.findUniqueOrThrow({
      where: { id: occurrence.id },
    });
    expect(frozen.expectedAmount.toString()).toBe('1000');
    expect(frozen.planName).toBe('每月定投隔离验收');
    const next = await fixture.prisma.recurringFundInvestmentOccurrence.findUniqueOrThrow({
      where: { planId_periodKey: { planId: plan.id, periodKey: '2026-02' } },
    });
    expect(next.expectedAmount.toString()).toBe('2000');
    expect(next.planName).toBe('新名称');
  });

  it('暂停不物化，恢复只从当前到期日起生成，结束拒绝编辑且不再物化', async () => {
    const account = await fixture.account();
    const plan = await fixture.createPlan(account.id, { startPeriod: '2020-01' });
    const path = `fund-investment-plans/${plan.id}`;
    const paused = recurringFundInvestmentPlanSchema.parse(
      (await fixture.http(`${path}/pause`, { expectedVersion: 1 })).body,
    );
    expect(paused).toMatchObject({ status: 'PAUSED', nextDueAt: null, version: 2 });
    expect((await fixture.http(`${path}/resume`, { expectedVersion: 1 })).status).toBe(409);
    await fixture.plans.materializeDue(new Date());
    expect(
      await fixture.prisma.recurringFundInvestmentOccurrence.count({ where: { planId: plan.id } }),
    ).toBe(0);
    const beforeResume = new Date();
    const resumed = recurringFundInvestmentPlanSchema.parse(
      (await fixture.http(`${path}/resume`, { expectedVersion: 2 })).body,
    );
    expect(resumed.status).toBe('ACTIVE');
    expect(new Date(resumed.nextDueAt ?? '').getTime()).toBeGreaterThanOrEqual(
      beforeResume.getTime(),
    );
    await fixture.plans.materializeDue(new Date(resumed.nextDueAt ?? ''));
    const rows = await fixture.prisma.recurringFundInvestmentOccurrence.findMany({
      where: { planId: plan.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.periodKey).toBe(new Date(resumed.nextDueAt ?? '').toISOString().slice(0, 7));
    const current = await fixture.prisma.recurringFundInvestmentPlan.findUniqueOrThrow({
      where: { id: plan.id },
    });
    const ended = recurringFundInvestmentPlanSchema.parse(
      (await fixture.http(`${path}/end`, { expectedVersion: current.version })).body,
    );
    expect(ended).toMatchObject({ status: 'ENDED', nextDueAt: null });
    expect(
      (await fixture.http(path, { expectedVersion: ended.version, name: '不应修改' }, 'PATCH'))
        .status,
    ).toBe(400);
    expect((await fixture.http(`${path}/resume`, { expectedVersion: ended.version })).status).toBe(
      400,
    );
    await fixture.plans.materializeDue(new Date('2040-12-31T01:00:00Z'));
    expect(
      await fixture.prisma.recurringFundInvestmentOccurrence.count({ where: { planId: plan.id } }),
    ).toBe(1);
  });

  it('跳过和恢复不写账，版本冲突拒绝；恢复后确认，已确认不能跳过或恢复', async () => {
    const { account, occurrence } = await fixture.pending();
    const path = `fund-investment-occurrences/${occurrence.id}`;
    const skipped = recurringFundInvestmentOccurrenceSchema.parse(
      (await fixture.http(`${path}/skip`, { expectedVersion: 1, reason: '本月暂缓' })).body,
    );
    expect(skipped).toMatchObject({ status: 'SKIPPED', version: 2, skippedReason: '本月暂缓' });
    expect((await fixture.http(`${path}/confirm`, fundConfirmation)).status).toBe(400);
    expect((await fixture.http(`${path}/reopen`, { expectedVersion: 1 })).status).toBe(409);
    const reopened = recurringFundInvestmentOccurrenceSchema.parse(
      (await fixture.http(`${path}/reopen`, { expectedVersion: 2 })).body,
    );
    expect(reopened).toMatchObject({
      status: 'PENDING',
      version: 3,
      skippedReason: null,
      skippedAt: null,
    });
    expect(await fixture.prisma.ledgerEvent.count({ where: { accountId: account.id } })).toBe(0);
    expect((await fixture.http(`${path}/confirm`, fundConfirmation)).status).toBe(409);
    const confirmed = await fixture.http(`${path}/confirm`, {
      ...fundConfirmation,
      expectedVersion: 3,
    });
    expect(confirmed.status).toBe(201);
    for (const action of ['skip', 'reopen']) {
      const command =
        action === 'skip'
          ? { expectedVersion: 4, reason: '已确认记录不能跳过' }
          : { expectedVersion: 4 };
      expect((await fixture.http(`${path}/${action}`, command)).status).toBe(409);
    }
    expect(await fixture.prisma.ledgerEvent.count({ where: { accountId: account.id } })).toBe(1);
  });

  it('到期后账户停用或资产失去确认状态时拒绝写账', async () => {
    const { account, occurrence } = await fixture.pending();
    await fixture.prisma.account.update({ where: { id: account.id }, data: { active: false } });
    const path = `fund-investment-occurrences/${occurrence.id}/confirm`;
    expect((await fixture.http(path, fundConfirmation)).status).toBe(400);
    await fixture.prisma.account.update({ where: { id: account.id }, data: { active: true } });
    await fixture.prisma.asset.update({
      where: { symbol: occurrence.symbol },
      data: { identityStatus: 'unresolved' },
    });
    try {
      expect((await fixture.http(path, fundConfirmation)).status).toBe(400);
    } finally {
      await fixture.prisma.asset.update({
        where: { symbol: occurrence.symbol },
        data: { identityStatus: 'confirmed' },
      });
    }
    expect(await fixture.prisma.ledgerEvent.count({ where: { accountId: account.id } })).toBe(0);
    expect(
      (
        await fixture.prisma.recurringFundInvestmentOccurrence.findUniqueOrThrow({
          where: { id: occurrence.id },
        })
      ).status,
    ).toBe('PENDING');
  });
});
