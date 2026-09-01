import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class DataExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportAccount(accountId?: string) {
    const [accounts, ledger, positions, journal, plans, strategies, rules, events] =
      await Promise.all([
        this.prisma.account.findMany({ ...(accountId ? { where: { id: accountId } } : {}) }),
        this.prisma.ledgerEvent.findMany({ ...(accountId ? { where: { accountId } } : {}) }),
        this.prisma.position.findMany({ ...(accountId ? { where: { accountId } } : {}) }),
        this.prisma.journalEntry.findMany({ ...(accountId ? { where: { accountId } } : {}) }),
        this.prisma.tradePlan.findMany({ ...(accountId ? { where: { accountId } } : {}) }),
        this.prisma.strategy.findMany({ include: { versions: true } }),
        this.prisma.riskRule.findMany({ ...(accountId ? { where: { accountId } } : {}) }),
        this.prisma.riskEvent.findMany({ ...(accountId ? { where: { accountId } } : {}) }),
      ]);
    const notifications = accountId
      ? events.length === 0
        ? []
        : await this.prisma.notificationDelivery.findMany({
            where: {
              subjectType: 'risk-event',
              subjectId: { in: events.map((event) => event.id) },
            },
          })
      : await this.prisma.notificationDelivery.findMany();

    return {
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      scope: accountId
        ? { kind: 'account' as const, accountId, globalSections: ['strategies'] }
        : { kind: 'full' as const, accountId: null, globalSections: ['strategies'] },
      accountId: accountId ?? null,
      data: {
        accounts,
        ledger,
        positions,
        journal,
        plans,
        rules,
        events,
        notifications,
      },
      global: { strategies },
      omitted: ['Provider credentials', 'AI API keys', 'Feishu Webhook'],
    };
  }
}
