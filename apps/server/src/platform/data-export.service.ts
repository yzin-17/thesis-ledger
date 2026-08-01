import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class DataExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportAccount(accountId?: string) {
    const [accounts, ledger, positions, journal, plans, strategies, rules, events, notifications] =
      await Promise.all([
        this.prisma.account.findMany({ ...(accountId ? { where: { id: accountId } } : {}) }),
        this.prisma.ledgerEvent.findMany({ ...(accountId ? { where: { accountId } } : {}) }),
        this.prisma.position.findMany({ ...(accountId ? { where: { accountId } } : {}) }),
        this.prisma.journalEntry.findMany({ ...(accountId ? { where: { accountId } } : {}) }),
        this.prisma.tradePlan.findMany({ ...(accountId ? { where: { accountId } } : {}) }),
        this.prisma.strategy.findMany({ include: { versions: true } }),
        this.prisma.riskRule.findMany({ ...(accountId ? { where: { accountId } } : {}) }),
        this.prisma.riskEvent.findMany({ ...(accountId ? { where: { accountId } } : {}) }),
        this.prisma.notificationDelivery.findMany(),
      ]);
    return {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      accountId: accountId ?? null,
      data: {
        accounts,
        ledger,
        positions,
        journal,
        plans,
        strategies,
        rules,
        events,
        notifications,
      },
      omitted: ['Provider credentials', 'AI API keys', 'Feishu Webhook'],
    };
  }
}
