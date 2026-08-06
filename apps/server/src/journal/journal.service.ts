import { Injectable, NotFoundException } from '@nestjs/common';
import {
  behaviorMetrics,
  counterfactualReplay,
  plannedVsActual,
  plannedVsActualStop,
  reviewWindow,
  type CompletedTrade,
  type JournalEntry,
  type RiskTriggerFact,
  type TradePlan,
} from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';

@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  createEntry(input: Omit<JournalEntry, 'id' | 'createdAt'>) {
    return this.prisma.journalEntry.create({ data: input });
  }

  listEntries(symbol?: string, accountId?: string) {
    return this.prisma.journalEntry.findMany({
      ...(symbol || accountId
        ? { where: { ...(symbol ? { symbol } : {}), ...(accountId ? { accountId } : {}) } }
        : {}),
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateEntry(id: string, input: Partial<Omit<JournalEntry, 'id' | 'createdAt'>>) {
    const exists = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('交易日志不存在');
    return this.prisma.journalEntry.update({ where: { id }, data: input });
  }

  createPlan(input: Omit<TradePlan, 'id'>) {
    return this.prisma.tradePlan.create({ data: input });
  }

  listPlans(symbol?: string, accountId?: string) {
    return this.prisma.tradePlan.findMany({
      ...(symbol || accountId
        ? { where: { ...(symbol ? { symbol } : {}), ...(accountId ? { accountId } : {}) } }
        : {}),
      orderBy: { createdAt: 'desc' },
    });
  }

  plannedVsActual(input: CompletedTrade) {
    return plannedVsActual(input);
  }

  plannedStopReview(fact: RiskTriggerFact, actualPnl?: number) {
    return plannedVsActualStop(fact, actualPnl);
  }

  counterfactual(input: { trades: CompletedTrade[]; enforceStop: boolean; stopPrice?: number }) {
    return counterfactualReplay(input);
  }

  review(input: { trades: CompletedTrade[]; start: string; end: string }) {
    return reviewWindow(input);
  }

  behavior(input: { trades: CompletedTrade[] }) {
    return behaviorMetrics(input.trades);
  }

  async exportEntries(symbol?: string, accountId?: string) {
    const entries = await this.listEntries(symbol, accountId);
    return {
      exportedAt: new Date().toISOString(),
      scope: { ...(symbol ? { symbol } : {}), ...(accountId ? { accountId } : {}) },
      entries,
    };
  }
}
