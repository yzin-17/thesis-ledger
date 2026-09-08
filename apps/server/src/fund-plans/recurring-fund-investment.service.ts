import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  confirmRecurringFundInvestmentOccurrenceSchema,
  createRecurringFundInvestmentPlanSchema,
  recurringFundInvestmentOccurrenceQuerySchema,
  recurringFundInvestmentPlanQuerySchema,
  recurringFundInvestmentStateCommandSchema,
  reopenRecurringFundInvestmentOccurrenceSchema,
  skipRecurringFundInvestmentOccurrenceSchema,
  updateRecurringFundInvestmentPlanSchema,
} from '@thesis-ledger/schemas';
import { LedgerCommandService } from '../ledger/ledger-command.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import {
  dueFundInvestments,
  fundPeriodKeyAtShanghai,
  nextFundInvestmentAtOrAfter,
  scheduledFundInvestmentForPeriod,
} from './recurring-fund-investment.schedule.js';

const versionConflict = () =>
  new ConflictException({
    errorCode: 'FUND_INVESTMENT_PLAN_VERSION_CONFLICT',
    message: '计划或待确认记录已变化，请刷新后重试',
  });

@Injectable()
export class RecurringFundInvestmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerCommands: LedgerCommandService,
  ) {}

  async create(rawInput: unknown) {
    const input = createRecurringFundInvestmentPlanSchema.parse(rawInput);
    const account = await this.requireFundAccount(input.accountId);
    const asset = await this.requireFundAsset(input.symbol);
    return this.prisma.recurringFundInvestmentPlan.create({
      data: {
        accountId: account.id,
        name: input.name,
        symbol: asset.symbol,
        fundName: asset.name,
        expectedAmount: input.expectedAmount,
        currency: account.currency,
        dayOfMonth: input.dayOfMonth,
        timezone: input.timezone,
        startPeriod: input.startPeriod,
        nextDueAt: scheduledFundInvestmentForPeriod(input.startPeriod, input.dayOfMonth),
      },
    });
  }

  list(rawQuery: unknown = {}) {
    const query = recurringFundInvestmentPlanQuerySchema.parse(rawQuery);
    return this.prisma.recurringFundInvestmentPlan.findMany({
      where: {
        ...(query.accountId === undefined ? {} : { accountId: query.accountId }),
        ...(query.status === undefined ? {} : { status: query.status }),
      },
      orderBy: [{ status: 'asc' }, { nextDueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async update(id: string, rawInput: unknown) {
    const input = updateRecurringFundInvestmentPlanSchema.parse(rawInput);
    const plan = await this.requirePlan(id);
    if (plan.status === 'ENDED') throw new BadRequestException('已结束计划不能修改');
    let nextDueAt = plan.nextDueAt;
    if (plan.status === 'ACTIVE' && input.dayOfMonth !== undefined) {
      const periodKey = plan.nextDueAt
        ? fundPeriodKeyAtShanghai(plan.nextDueAt)
        : fundPeriodKeyAtShanghai(new Date());
      nextDueAt = scheduledFundInvestmentForPeriod(periodKey, input.dayOfMonth);
    }
    const updated = await this.prisma.recurringFundInvestmentPlan.updateMany({
      where: { id, version: input.expectedVersion },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.expectedAmount === undefined ? {} : { expectedAmount: input.expectedAmount }),
        ...(input.dayOfMonth === undefined ? {} : { dayOfMonth: input.dayOfMonth, nextDueAt }),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw versionConflict();
    return this.requirePlan(id);
  }

  pause(id: string, rawInput: unknown) {
    return this.changePlanState(id, rawInput, 'PAUSED');
  }

  resume(id: string, rawInput: unknown, now = new Date()) {
    return this.changePlanState(id, rawInput, 'ACTIVE', now);
  }

  end(id: string, rawInput: unknown) {
    return this.changePlanState(id, rawInput, 'ENDED');
  }

  listOccurrences(rawQuery: unknown = {}) {
    const query = recurringFundInvestmentOccurrenceQuerySchema.parse(rawQuery);
    return this.prisma.recurringFundInvestmentOccurrence.findMany({
      where: {
        ...(query.accountId === undefined ? {} : { accountId: query.accountId }),
        ...(query.planId === undefined ? {} : { planId: query.planId }),
        ...(query.status === undefined ? {} : { status: query.status }),
      },
      orderBy: [{ scheduledFor: 'desc' }, { id: 'desc' }],
    });
  }

  async confirmOccurrence(id: string, rawInput: unknown) {
    const input = confirmRecurringFundInvestmentOccurrenceSchema.parse(rawInput);
    const occurrence = await this.requireOccurrence(id);
    if (occurrence.status === 'CONFIRMED') return occurrence;
    if (occurrence.status !== 'PENDING') throw new BadRequestException('只有待确认定投可以确认');
    if (occurrence.version !== input.expectedVersion) throw versionConflict();
    await this.requireFundAccount(occurrence.accountId);
    await this.requireFundAsset(occurrence.symbol);

    const charges = input.commission
      ? [
          {
            category: 'COMMISSION' as const,
            amount: input.commission,
            currency: occurrence.currency,
            description: '基金定投手续费',
          },
        ]
      : [];
    await this.ledgerCommands.createExecutionWithEffect(
      {
        command: 'CREATE_EXECUTION',
        accountId: occurrence.accountId,
        occurredAt: input.occurredAt,
        timePrecision: 'DATE',
        sourceTimezone: 'Asia/Shanghai',
        economicOrderKey: `recurring-fund-investment:${occurrence.id}`,
        side: 'BUY',
        payload: {
          symbol: occurrence.symbol,
          quantity: input.actualQuantity,
          price: input.unitPrice,
          currency: occurrence.currency,
          capabilityVerification: 'UNVERIFIED',
          charges,
          note: `${occurrence.planName} · ${occurrence.periodKey}`,
        },
        source: {
          category: 'MANUAL',
          channel: 'recurring-fund-investment',
          externalId: `fund-investment-occurrence:${occurrence.id}`,
        },
        actorId: 'desktop-user',
      },
      async (transaction, event) => {
        const updated = await transaction.recurringFundInvestmentOccurrence.updateMany({
          where: { id, status: 'PENDING', version: input.expectedVersion },
          data: {
            status: 'CONFIRMED',
            actualQuantity: input.actualQuantity,
            unitPrice: input.unitPrice,
            commission: input.commission ?? null,
            occurredAt: new Date(`${input.occurredAt}T00:00:00.000Z`),
            ledgerEventId: event.eventId,
            ledgerFactId: event.factId,
            confirmedAt: new Date(),
            skippedAt: null,
            skippedReason: null,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw versionConflict();
      },
    );
    return this.requireOccurrence(id);
  }

  async skipOccurrence(id: string, rawInput: unknown) {
    const input = skipRecurringFundInvestmentOccurrenceSchema.parse(rawInput);
    const updated = await this.prisma.recurringFundInvestmentOccurrence.updateMany({
      where: { id, status: 'PENDING', version: input.expectedVersion },
      data: {
        status: 'SKIPPED',
        skippedReason: input.reason,
        skippedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw versionConflict();
    return this.requireOccurrence(id);
  }

  async reopenOccurrence(id: string, rawInput: unknown) {
    const input = reopenRecurringFundInvestmentOccurrenceSchema.parse(rawInput);
    const updated = await this.prisma.recurringFundInvestmentOccurrence.updateMany({
      where: { id, status: 'SKIPPED', version: input.expectedVersion },
      data: {
        status: 'PENDING',
        skippedReason: null,
        skippedAt: null,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw versionConflict();
    return this.requireOccurrence(id);
  }

  async materializeDue(now = new Date()) {
    const plans = await this.prisma.recurringFundInvestmentPlan.findMany({
      where: { status: 'ACTIVE', nextDueAt: { lte: now } },
      orderBy: [{ nextDueAt: 'asc' }, { id: 'asc' }],
    });
    const results = [];
    for (const plan of plans) results.push(await this.materializePlan(plan.id, now));
    return { planCount: plans.length, results };
  }

  private async materializePlan(id: string, now: Date) {
    return this.prisma.$transaction(async (transaction) => {
      const plan = await transaction.recurringFundInvestmentPlan.findUnique({ where: { id } });
      if (!plan || plan.status !== 'ACTIVE' || !plan.nextDueAt || plan.nextDueAt > now)
        return { planId: id, createdCount: 0, periods: [] as string[] };
      const schedule = dueFundInvestments(plan.nextDueAt, now, plan.dayOfMonth);
      const periodKeys = schedule.due.map((item) => item.periodKey);
      const existing = await transaction.recurringFundInvestmentOccurrence.findMany({
        where: { planId: plan.id, periodKey: { in: periodKeys } },
        select: { periodKey: true },
      });
      const existingKeys = new Set(existing.map((item) => item.periodKey));
      const created = schedule.due.filter((item) => !existingKeys.has(item.periodKey));
      if (created.length > 0) {
        await transaction.recurringFundInvestmentOccurrence.createMany({
          data: created.map((item) => ({
            planId: plan.id,
            accountId: plan.accountId,
            periodKey: item.periodKey,
            planName: plan.name,
            symbol: plan.symbol,
            fundName: plan.fundName,
            scheduledFor: item.scheduledFor,
            expectedAmount: plan.expectedAmount,
            currency: plan.currency,
          })),
          skipDuplicates: true,
        });
      }
      const advanced = await transaction.recurringFundInvestmentPlan.updateMany({
        where: { id: plan.id, status: 'ACTIVE', version: plan.version, nextDueAt: plan.nextDueAt },
        data: { nextDueAt: schedule.nextDueAt, version: { increment: 1 } },
      });
      if (advanced.count !== 1) throw versionConflict();
      return {
        planId: plan.id,
        createdCount: created.length,
        periods: created.map((item) => item.periodKey),
      };
    });
  }

  private async changePlanState(
    id: string,
    rawInput: unknown,
    status: 'ACTIVE' | 'PAUSED' | 'ENDED',
    now = new Date(),
  ) {
    const input = recurringFundInvestmentStateCommandSchema.parse(rawInput);
    const plan = await this.requirePlan(id);
    if (plan.version !== input.expectedVersion) throw versionConflict();
    if (plan.status === 'ENDED') {
      if (status === 'ENDED') return plan;
      throw new BadRequestException('已结束计划不能恢复');
    }
    if (status === 'PAUSED' && plan.status !== 'ACTIVE')
      throw new BadRequestException('只有启用计划可以暂停');
    if (status === 'ACTIVE' && plan.status !== 'PAUSED')
      throw new BadRequestException('只有暂停计划可以恢复');
    const nextDueAt =
      status === 'ACTIVE'
        ? nextFundInvestmentAtOrAfter(now, plan.dayOfMonth, plan.startPeriod)
        : null;
    const updated = await this.prisma.recurringFundInvestmentPlan.updateMany({
      where: { id, version: input.expectedVersion },
      data: {
        status,
        nextDueAt,
        pausedAt: status === 'PAUSED' ? now : null,
        endedAt: status === 'ENDED' ? now : null,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw versionConflict();
    return this.requirePlan(id);
  }

  private async requireFundAccount(accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('账户不存在');
    if (!account.active || account.mode !== 'actual' || account.type !== 'fund')
      throw new BadRequestException('基金定投只支持启用的真实基金账户');
    return account;
  }

  private async requireFundAsset(symbol: string) {
    const asset = await this.prisma.asset.findUnique({ where: { symbol } });
    if (!asset || asset.identityStatus !== 'confirmed' || asset.assetType !== 'fund')
      throw new BadRequestException('基金标的必须先完成身份确认');
    if (!asset.symbol.endsWith('.OF')) throw new BadRequestException('基金定投只支持场外基金');
    return asset;
  }

  private async requirePlan(id: string) {
    const plan = await this.prisma.recurringFundInvestmentPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('基金定投计划不存在');
    return plan;
  }

  private async requireOccurrence(id: string) {
    const occurrence = await this.prisma.recurringFundInvestmentOccurrence.findUnique({
      where: { id },
    });
    if (!occurrence) throw new NotFoundException('待确认定投不存在');
    return occurrence;
  }
}
