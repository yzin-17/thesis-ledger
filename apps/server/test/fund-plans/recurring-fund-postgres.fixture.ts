import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AutomationRuntimeHandlers } from '../../src/automation/automation-runtime.service.js';
import { AutomationScheduler } from '../../src/automation/automation.scheduler.js';
import { AutomationService } from '../../src/automation/automation.service.js';
import {
  RecurringFundInvestmentOccurrenceController,
  RecurringFundInvestmentPlanController,
} from '../../src/fund-plans/recurring-fund-investment.controller.js';
import { RecurringFundInvestmentService } from '../../src/fund-plans/recurring-fund-investment.service.js';
import { LedgerCommandService } from '../../src/ledger/ledger-command.service.js';
import { LedgerV2Repository } from '../../src/ledger/ledger-v2.repository.js';
import { LedgerQueryService } from '../../src/ledger/ledger-query.service.js';
import { InstrumentDirectoryService } from '../../src/market/instruments/instrument-directory.service.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';

export const fundDatabaseUrl = process.env.FUND_INVESTMENT_DATABASE_URL;
export const fundConfirmation = {
  expectedVersion: 1,
  actualQuantity: '100',
  unitPrice: '1.25',
  commission: '1',
  occurredAt: '2026-01-31',
};

export async function createFundPostgresFixture() {
  const url = new URL(fundDatabaseUrl ?? '');
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/fund_investment_fixture')
    throw new Error('仅允许基金定投专用本机隔离数据库');
  const prisma = new PrismaClient({ datasourceUrl: url.toString() });
  const identity = await prisma.$queryRaw<Array<{ database: string; owner: string }>>`
    SELECT current_database() AS database, current_user AS owner
  `;
  if (identity[0]?.database !== 'fund_investment_fixture' || identity[0].owner !== 'fixture_owner')
    throw new Error('基金定投隔离数据库身份不符');
  await prisma.automationJob.updateMany({ data: { enabled: false } });
  await prisma.asset.upsert({
    where: { symbol: '000001.OF' },
    update: {},
    create: {
      symbol: '000001.OF',
      name: '定投隔离基金',
      market: 'CN',
      assetType: 'fund',
      currency: 'CNY',
      identityStatus: 'confirmed',
    },
  });
  const repository = new LedgerV2Repository(prisma as never);
  const plans = new RecurringFundInvestmentService(
    prisma as never,
    new LedgerCommandService(repository),
  );
  const queries = new LedgerQueryService(
    prisma as never,
    repository,
    new InstrumentDirectoryService(prisma as never),
  );
  const notifications = {
    enqueue: () => {
      throw new Error('定投成功路径不应发送通知');
    },
  };
  const automations = new AutomationService(prisma as never, {} as never, notifications as never);
  const handlers = new AutomationRuntimeHandlers(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    plans,
  );
  const scheduler = new AutomationScheduler(prisma as never, automations, handlers);
  for (const controller of [
    RecurringFundInvestmentPlanController,
    RecurringFundInvestmentOccurrenceController,
  ])
    Reflect.defineMetadata('design:paramtypes', [RecurringFundInvestmentService], controller);
  @Module({
    controllers: [
      RecurringFundInvestmentPlanController,
      RecurringFundInvestmentOccurrenceController,
    ],
    providers: [{ provide: RecurringFundInvestmentService, useValue: plans }],
  })
  class FundHttpModule {}
  const app = await NestFactory.create(FundHttpModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const http = async (path: string, body?: unknown, method = 'POST') => {
    const response = await fetch(`${origin}/api/v1/${path}`, {
      method: body === undefined ? 'GET' : method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    return { status: response.status, body: (await response.json()) as unknown };
  };
  const account = (overrides: { type?: string; mode?: string; active?: boolean } = {}) =>
    prisma.account.create({
      data: { name: '基金定投隔离验收', type: 'fund', mode: 'actual', ...overrides },
    });
  const createPlan = async (accountId: string, overrides: Record<string, unknown> = {}) => {
    const result = await http('fund-investment-plans', {
      accountId,
      name: '每月定投隔离验收',
      symbol: '000001.OF',
      expectedAmount: '1000',
      dayOfMonth: 31,
      startPeriod: '2026-01',
      ...overrides,
    });
    if (result.status !== 201) throw new Error(`计划创建失败: ${JSON.stringify(result)}`);
    return prisma.recurringFundInvestmentPlan.findFirstOrThrow({ where: { accountId } });
  };
  const pending = async () => {
    const owner = await account();
    const plan = await createPlan(owner.id);
    await plans.materializeDue(new Date('2026-01-31T01:00:00Z'));
    const occurrence = await prisma.recurringFundInvestmentOccurrence.findFirstOrThrow({
      where: { planId: plan.id },
    });
    return { account: owner, plan, occurrence };
  };
  return {
    prisma,
    plans,
    queries,
    scheduler,
    http,
    account,
    createPlan,
    pending,
    close: async () => {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

export type FundPostgresFixture = Awaited<ReturnType<typeof createFundPostgresFixture>>;
