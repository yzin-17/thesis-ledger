import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  confirmRecurringCashDepositOccurrenceSchema,
  createRecurringCashDepositPlanSchema,
  recurringCashDepositOccurrenceQuerySchema,
  recurringCashDepositPlanQuerySchema,
  recurringCashDepositPlanStateCommandSchema,
  reopenRecurringCashDepositOccurrenceSchema,
  skipRecurringCashDepositOccurrenceSchema,
  updateRecurringCashDepositPlanSchema,
} from '@thesis-ledger/schemas';
import { CashLedgerCommandService } from '../ledger/cash-ledger-command.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import {
  buildRecurringCashDepositNotification,
  recurringCashDepositNotificationPolicy,
} from './recurring-cash-deposit-notification.js';
import {
  dueOccurrences,
  nextScheduledAtOrAfter,
  periodKeyAtShanghai,
  scheduledForPeriod,
} from './recurring-cash-deposit.schedule.js';

const versionConflict = () =>
  new ConflictException({
    errorCode: 'CASH_DEPOSIT_PLAN_VERSION_CONFLICT',
    message: '计划或待确认记录已变化，请刷新后重试',
  });

@Injectable()
export class RecurringCashDepositService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashCommands: CashLedgerCommandService,
    private readonly notifications: NotificationService,
  ) {}

  async create(rawInput: unknown) {
    const input = createRecurringCashDepositPlanSchema.parse(rawInput);
    const account = await this.requireCashAccount(input.accountId);
    return this.prisma.recurringCashDepositPlan.create({
      data: {
        accountId: account.id,
        name: input.name,
        expectedAmount: input.expectedAmount,
        currency: account.currency,
        dayOfMonth: input.dayOfMonth,
        timezone: input.timezone,
        startPeriod: input.startPeriod,
        status: 'ACTIVE',
        nextDueAt: scheduledForPeriod(input.startPeriod, input.dayOfMonth),
      },
    });
  }

  list(rawQuery: unknown = {}) {
    const query = recurringCashDepositPlanQuerySchema.parse(rawQuery);
    return this.prisma.recurringCashDepositPlan.findMany({
      where: {
        ...(query.accountId === undefined ? {} : { accountId: query.accountId }),
        ...(query.status === undefined ? {} : { status: query.status }),
      },
      orderBy: [{ status: 'asc' }, { nextDueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async update(id: string, rawInput: unknown) {
    const input = updateRecurringCashDepositPlanSchema.parse(rawInput);
    const plan = await this.requirePlan(id);
    if (plan.status === 'ENDED') throw new BadRequestException('已结束计划不能修改');
    let nextDueAt = plan.nextDueAt;
    if (plan.status === 'ACTIVE' && input.dayOfMonth !== undefined) {
      const periodKey = plan.nextDueAt
        ? periodKeyAtShanghai(plan.nextDueAt)
        : periodKeyAtShanghai(new Date());
      nextDueAt = scheduledForPeriod(periodKey, input.dayOfMonth);
    }
    const updated = await this.prisma.recurringCashDepositPlan.updateMany({
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
    const query = recurringCashDepositOccurrenceQuerySchema.parse(rawQuery);
    return this.prisma.recurringCashDepositOccurrence.findMany({
      where: {
        ...(query.accountId === undefined ? {} : { accountId: query.accountId }),
        ...(query.planId === undefined ? {} : { planId: query.planId }),
        ...(query.status === undefined ? {} : { status: query.status }),
      },
      orderBy: [{ scheduledFor: 'desc' }, { id: 'desc' }],
    });
  }

  async confirmOccurrence(id: string, rawInput: unknown) {
    const input = confirmRecurringCashDepositOccurrenceSchema.parse(rawInput);
    const occurrence = await this.requireOccurrence(id);
    if (occurrence.status === 'CONFIRMED') return occurrence;
    if (occurrence.status !== 'PENDING') throw new BadRequestException('只有待确认入账可以确认');
    if (occurrence.version !== input.expectedVersion) throw versionConflict();
    await this.requireCashAccount(occurrence.accountId);

    await this.cashCommands.createCashFlowWithEffect(
      {
        command: 'CREATE_CASH_FLOW',
        accountId: occurrence.accountId,
        occurredAt: input.occurredAt,
        timePrecision: 'INSTANT',
        sourceTimezone: 'Asia/Shanghai',
        economicOrderKey: `recurring-deposit:${occurrence.periodKey}:${input.occurredAt}`,
        payload: {
          direction: 'INFLOW',
          category: 'DEPOSIT',
          amount: input.actualAmount,
          currency: occurrence.currency,
          settledAt: input.occurredAt,
          note: occurrence.planName,
        },
        source: {
          category: 'MANUAL',
          channel: 'recurring-cash-deposit',
          externalId: `cash-deposit-occurrence:${occurrence.id}`,
        },
        actorId: 'desktop-user',
      },
      async (transaction, event) => {
        const updated = await transaction.recurringCashDepositOccurrence.updateMany({
          where: { id, status: 'PENDING', version: input.expectedVersion },
          data: {
            status: 'CONFIRMED',
            actualAmount: input.actualAmount,
            occurredAt: new Date(input.occurredAt),
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
    const input = skipRecurringCashDepositOccurrenceSchema.parse(rawInput);
    const updated = await this.prisma.recurringCashDepositOccurrence.updateMany({
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
    const input = reopenRecurringCashDepositOccurrenceSchema.parse(rawInput);
    const updated = await this.prisma.recurringCashDepositOccurrence.updateMany({
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
    const plans = await this.prisma.recurringCashDepositPlan.findMany({
      where: { status: 'ACTIVE', nextDueAt: { lte: now } },
      orderBy: [{ nextDueAt: 'asc' }, { id: 'asc' }],
    });
    const results = [];
    for (const plan of plans) results.push(await this.materializePlan(plan.id, now));
    return { planCount: plans.length, results };
  }

  private async materializePlan(id: string, now: Date) {
    const materialized = await this.prisma.$transaction(async (transaction) => {
      const plan = await transaction.recurringCashDepositPlan.findUnique({ where: { id } });
      if (!plan || plan.status !== 'ACTIVE' || !plan.nextDueAt || plan.nextDueAt > now)
        return { plan, created: [] as Array<{ periodKey: string; scheduledFor: Date }> };
      const schedule = dueOccurrences(plan.nextDueAt, now, plan.dayOfMonth);
      const periodKeys = schedule.due.map((item) => item.periodKey);
      const existing = await transaction.recurringCashDepositOccurrence.findMany({
        where: { planId: plan.id, periodKey: { in: periodKeys } },
        select: { periodKey: true },
      });
      const existingKeys = new Set(existing.map((item) => item.periodKey));
      const created = schedule.due.filter((item) => !existingKeys.has(item.periodKey));
      if (created.length > 0) {
        await transaction.recurringCashDepositOccurrence.createMany({
          data: created.map((item) => ({
            planId: plan.id,
            accountId: plan.accountId,
            periodKey: item.periodKey,
            planName: plan.name,
            scheduledFor: item.scheduledFor,
            expectedAmount: plan.expectedAmount,
            currency: plan.currency,
            status: 'PENDING',
          })),
          skipDuplicates: true,
        });
      }
      const advanced = await transaction.recurringCashDepositPlan.updateMany({
        where: { id: plan.id, status: 'ACTIVE', version: plan.version, nextDueAt: plan.nextDueAt },
        data: { nextDueAt: schedule.nextDueAt, version: { increment: 1 } },
      });
      if (advanced.count !== 1) throw versionConflict();
      return { plan, created };
    });

    if (!materialized.plan || materialized.created.length === 0)
      return { planId: id, createdCount: 0, periods: [] as string[] };
    const periods = materialized.created.map((item) => item.periodKey);
    const notification = buildRecurringCashDepositNotification({
      planId: materialized.plan.id,
      planName: materialized.plan.name,
      periods,
      traceId: crypto.randomUUID(),
    });
    let notificationQueued = true;
    try {
      await this.notifications.enqueue(
        notification.subject,
        notification.message,
        recurringCashDepositNotificationPolicy,
        now,
      );
    } catch {
      notificationQueued = false;
    }
    return {
      planId: id,
      createdCount: materialized.created.length,
      periods,
      notificationQueued,
    };
  }

  private async changePlanState(
    id: string,
    rawInput: unknown,
    status: 'ACTIVE' | 'PAUSED' | 'ENDED',
    now = new Date(),
  ) {
    const input = recurringCashDepositPlanStateCommandSchema.parse(rawInput);
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
      status === 'ACTIVE' ? nextScheduledAtOrAfter(now, plan.dayOfMonth, plan.startPeriod) : null;
    const updated = await this.prisma.recurringCashDepositPlan.updateMany({
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

  private async requireCashAccount(accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('账户不存在');
    if (!account.active || account.mode !== 'actual' || account.type !== 'cash')
      throw new BadRequestException('定期入账计划只支持启用的真实现金账户');
    return account;
  }

  private async requirePlan(id: string) {
    const plan = await this.prisma.recurringCashDepositPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('定期入账计划不存在');
    return plan;
  }

  private async requireOccurrence(id: string) {
    const occurrence = await this.prisma.recurringCashDepositOccurrence.findUnique({
      where: { id },
    });
    if (!occurrence) throw new NotFoundException('待确认入账不存在');
    return occurrence;
  }
}
