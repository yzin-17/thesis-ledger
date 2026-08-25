import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  behaviorMetrics,
  counterfactualReplay,
  plannedVsActual,
  plannedVsActualStop,
  projectCompletedTrades,
  reviewWindow,
  type CompletedLedgerTrade,
  type CompletedTrade,
  type JournalReviewCostMethod,
  type LedgerEvent,
  type JournalEntry,
  type RiskTriggerFact,
  type TradePlan,
} from '@thesis-ledger/domain';
import {
  journalReviewCandidatesQuerySchema,
  type JournalReviewCandidate,
  type JournalReviewCandidatesInput,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';

type StoredLedgerEvent = {
  id: string;
  accountId: string;
  type: string;
  occurredAt: Date;
  symbol: string | null;
  quantity: unknown;
  price: unknown;
  amount: unknown;
  fee: unknown;
  tax: unknown;
  metadata?: unknown;
};

const toReviewLedgerEvent = (event: StoredLedgerEvent): LedgerEvent => ({
  id: event.id,
  accountId: event.accountId,
  type: event.type as LedgerEvent['type'],
  occurredAt: event.occurredAt.toISOString(),
  ...(event.symbol === null ? {} : { symbol: event.symbol }),
  ...(event.quantity === null ? {} : { quantity: Number(event.quantity) }),
  ...(event.price === null ? {} : { price: Number(event.price) }),
  ...(event.amount === null ? {} : { amount: Number(event.amount) }),
  ...(event.fee === null ? {} : { fee: Number(event.fee) }),
  ...(event.tax === null ? {} : { tax: Number(event.tax) }),
  ...(event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
    ? { metadata: event.metadata as Record<string, unknown> }
    : {}),
});

const optionalNumber = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const optionalDate = (value: Date | null | undefined) =>
  value === null || value === undefined ? undefined : value.toISOString();

const toReviewPlan = (plan: {
  id: string;
  plannedEntry: unknown;
  plannedExit: unknown;
  stopLoss: unknown;
  takeProfit: unknown;
  targetWeight: unknown;
  expectedHoldingDays: number | null;
  plannedEntryAt: Date | null;
  plannedExitAt: Date | null;
  status: string;
}) => ({
  id: plan.id,
  ...(optionalNumber(plan.plannedEntry) === undefined
    ? {}
    : { plannedEntry: optionalNumber(plan.plannedEntry) }),
  ...(optionalNumber(plan.plannedExit) === undefined
    ? {}
    : { plannedExit: optionalNumber(plan.plannedExit) }),
  ...(optionalNumber(plan.stopLoss) === undefined
    ? {}
    : { stopLoss: optionalNumber(plan.stopLoss) }),
  ...(optionalNumber(plan.takeProfit) === undefined
    ? {}
    : { takeProfit: optionalNumber(plan.takeProfit) }),
  ...(optionalNumber(plan.targetWeight) === undefined
    ? {}
    : { targetWeight: optionalNumber(plan.targetWeight) }),
  ...(plan.expectedHoldingDays === null ? {} : { expectedHoldingDays: plan.expectedHoldingDays }),
  ...(optionalDate(plan.plannedEntryAt) === undefined
    ? {}
    : { plannedEntryAt: optionalDate(plan.plannedEntryAt) }),
  ...(optionalDate(plan.plannedExitAt) === undefined
    ? {}
    : { plannedExitAt: optionalDate(plan.plannedExitAt) }),
  status: plan.status,
});

const toCandidate = (
  trade: CompletedLedgerTrade,
  input: {
    plans: Array<{
      id: string;
      accountId: string | null;
      plannedEntry: unknown;
      plannedExit: unknown;
      stopLoss: unknown;
      takeProfit: unknown;
      targetWeight: unknown;
      expectedHoldingDays: number | null;
      plannedEntryAt: Date | null;
      plannedExitAt: Date | null;
      status: string;
    }>;
    journalEntries: Array<{
      id: string;
      ledgerEventId: string | null;
      tradePlanId: string | null;
    }>;
  },
): JournalReviewCandidate => {
  const eventIds = new Set([...trade.entryEventIds, ...trade.exitEventIds]);
  const relatedEntries = input.journalEntries.filter(
    (entry) => entry.ledgerEventId !== null && eventIds.has(entry.ledgerEventId),
  );
  const planIds = [
    ...new Set(
      relatedEntries
        .map((entry) => entry.tradePlanId)
        .filter((planId): planId is string => planId !== null),
    ),
  ];
  const linkedPlan =
    planIds.length === 1
      ? input.plans.find((plan) => plan.id === planIds[0] && plan.accountId === trade.accountId)
      : undefined;
  const plan = linkedPlan ? toReviewPlan(linkedPlan) : null;
  const missingEvidence: string[] = [];
  if (!plan) missingEvidence.push('交易计划');
  else {
    if (plan.plannedEntry === undefined) missingEvidence.push('计划入场价');
    if (plan.plannedExit === undefined) missingEvidence.push('计划退出价');
    if (plan.stopLoss === undefined) missingEvidence.push('计划止损价');
    if (plan.expectedHoldingDays === undefined) missingEvidence.push('计划持有天数');
    if (plan.targetWeight === undefined) missingEvidence.push('目标仓位');
  }
  let evidenceCompleteness: JournalReviewCandidate['evidenceCompleteness'] = 'partial';
  if (!plan) evidenceCompleteness = 'actual-only';
  else if (missingEvidence.length === 0) evidenceCompleteness = 'complete';
  const candidate = {
    id: trade.id,
    accountId: trade.accountId,
    symbol: trade.symbol,
    entryAt: trade.entryAt,
    exitAt: trade.exitAt,
    pnl: trade.pnl,
    quantity: trade.quantity,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    actualExit: trade.actualExit,
    turnover: trade.turnover,
    ...(plan?.stopLoss === undefined ? {} : { plannedStop: plan.stopLoss }),
    ...(plan?.expectedHoldingDays === undefined
      ? {}
      : { plannedHoldingDays: plan.expectedHoldingDays }),
    ...(plan?.plannedEntry === undefined ? {} : { plannedEntry: plan.plannedEntry }),
    ...(plan?.plannedExit === undefined ? {} : { plannedExit: plan.plannedExit }),
    ...(plan?.targetWeight === undefined ? {} : { targetWeight: plan.targetWeight }),
    plan,
    evidenceCompleteness,
    missingEvidence,
    sources: {
      entryEventIds: trade.entryEventIds,
      exitEventIds: trade.exitEventIds,
      journalEntryIds: relatedEntries.map((entry) => entry.id),
      ...(linkedPlan ? { planId: linkedPlan.id } : {}),
    },
  };
  return candidate;
};

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

  async listReviewCandidates(input: JournalReviewCandidatesInput) {
    const query = journalReviewCandidatesQuerySchema.parse(input);
    const [storedEvents, plans, journalEntries] = await Promise.all([
      this.prisma.ledgerEvent.findMany({
        where: { accountId: query.accountId, ...(query.symbol ? { symbol: query.symbol } : {}) },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.tradePlan.findMany({
        where: { accountId: query.accountId, ...(query.symbol ? { symbol: query.symbol } : {}) },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.journalEntry.findMany({
        where: { accountId: query.accountId },
        select: { id: true, ledgerEventId: true, tradePlanId: true },
      }),
    ]);
    const method: JournalReviewCostMethod = 'AVG';
    const trades = projectCompletedTrades(
      (storedEvents as StoredLedgerEvent[]).map(toReviewLedgerEvent),
      method,
    );
    const candidates = trades
      .map((trade) => toCandidate(trade, { plans, journalEntries }))
      .filter((candidate) => {
        if (query.symbol && candidate.symbol !== query.symbol) return false;
        if (query.start && candidate.exitAt < query.start) return false;
        if (query.end && candidate.exitAt > query.end) return false;
        return true;
      });
    let startIndex = 0;
    if (query.cursor !== undefined) {
      const cursorIndex = candidates.findIndex((item) => item.id === query.cursor);
      if (cursorIndex < 0) throw new BadRequestException('复盘候选 cursor 不存在');
      startIndex = cursorIndex + 1;
    }
    const items = candidates.slice(startIndex, startIndex + query.limit);
    const hasMore = startIndex + items.length < candidates.length;
    return {
      items,
      total: candidates.length,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
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
