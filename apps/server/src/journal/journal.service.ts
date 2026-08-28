import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import {
  journalReviewCandidateSchema,
  journalReviewCandidatesQuerySchema,
  journalReviewSnapshotInputSchema,
  journalReviewSnapshotResponseSchema,
  type JournalReviewCandidate,
  type JournalReviewCandidatesInput,
  type JournalReviewSnapshotInput,
  type TradeDetailResponseV2,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { TradeQueryService } from '../ledger/trade-query.service.js';

type PlanRow = {
  id: string;
  accountId: string | null;
  tradeId: string | null;
  symbol: string;
  plannedEntry: unknown;
  plannedExit: unknown;
  stopLoss: unknown;
  takeProfit: unknown;
  targetWeight: unknown;
  expectedHoldingDays: number | null;
  plannedEntryAt: Date | null;
  plannedExitAt: Date | null;
  status: string;
  createdAt: Date;
};

type JournalRow = {
  id: string;
  ledgerEventId: string | null;
  tradePlanId: string | null;
  symbol: string | null;
  side: string | null;
};

type SnapshotRow = {
  tradeId: string;
  closeSliceId: string | null;
  projectionFingerprint: string | null;
  projectionGeneration: bigint;
  createdAt: Date;
};

const optionalNumber = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const optionalDate = (value: Date | null | undefined) =>
  value === null || value === undefined ? undefined : value.toISOString();

const toReviewPlan = (plan: PlanRow) => {
  const plannedEntry = optionalNumber(plan.plannedEntry);
  const plannedExit = optionalNumber(plan.plannedExit);
  const stopLoss = optionalNumber(plan.stopLoss);
  const takeProfit = optionalNumber(plan.takeProfit);
  const targetWeight = optionalNumber(plan.targetWeight);
  const plannedEntryAt = optionalDate(plan.plannedEntryAt);
  const plannedExitAt = optionalDate(plan.plannedExitAt);
  return {
    id: plan.id,
    ...(plannedEntry === undefined ? {} : { plannedEntry }),
    ...(plannedExit === undefined ? {} : { plannedExit }),
    ...(stopLoss === undefined ? {} : { stopLoss }),
    ...(takeProfit === undefined ? {} : { takeProfit }),
    ...(targetWeight === undefined ? {} : { targetWeight }),
    ...(plan.expectedHoldingDays === null ? {} : { expectedHoldingDays: plan.expectedHoldingDays }),
    ...(plannedEntryAt === undefined ? {} : { plannedEntryAt }),
    ...(plannedExitAt === undefined ? {} : { plannedExitAt }),
    status: plan.status,
  };
};

const unique = (values: string[]) => [...new Set(values)];

const numberValue = (value: string | null | undefined) => optionalNumber(value);

const weightedAverage = (values: Array<{ value: number; weight: number }>) => {
  if (values.length === 0) return undefined;
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return undefined;
  const total = values.reduce((sum, item) => sum + item.value * item.weight, 0);
  return Number.isFinite(total) ? total / totalWeight : undefined;
};

const dateValues = (detail: TradeDetailResponseV2) =>
  [
    detail.openedAt,
    detail.closedAt,
    detail.earliestEvidenceAt,
    ...detail.entryLegs.map((item) => item.occurredAt),
    ...detail.baselineComponents.map((item) => item.occurredAt),
    ...detail.corporateActions.map((item) => item.occurredAt),
    ...detail.closeSlices.map((item) => item.occurredAt),
    ...detail.dividendAttributions.map((item) => item.occurredAt),
  ].filter((value): value is string => value !== null);

const firstDate = (values: string[]) => [...values].sort()[0];
const lastDate = (values: string[]) => [...values].sort().at(-1);

const projectionEventIds = (detail: TradeDetailResponseV2) =>
  unique([
    ...detail.entryLegs.map((item) => item.eventId),
    ...detail.baselineComponents.map((item) => item.eventId),
    ...detail.corporateActions.map((item) => item.eventId),
    ...detail.closeSlices.map((item) => item.eventId),
    ...detail.dividendAttributions.map((item) => item.eventId),
    ...detail.evidenceSources.map((item) => item.eventId),
  ]);

const projectionFactIds = (detail: TradeDetailResponseV2) =>
  unique([
    ...detail.entryLegs.map((item) => item.factId),
    ...detail.baselineComponents.map((item) => item.factId),
    ...detail.corporateActions.map((item) => item.factId),
    ...detail.closeSlices.map((item) => item.factId),
    ...detail.dividendAttributions.map((item) => item.factId),
    ...detail.evidenceSources.map((item) => item.factId),
  ]);

const entryEventIds = (detail: TradeDetailResponseV2) =>
  unique([
    ...detail.entryLegs.map((item) => item.eventId),
    ...detail.baselineComponents.map((item) => item.eventId),
  ]);

const entryPrice = (
  detail: TradeDetailResponseV2,
  slice?: TradeDetailResponseV2['closeSlices'][number],
) => {
  const allocations = slice?.allocations ?? detail.closeSlices.flatMap((item) => item.allocations);
  const allocationValues = allocations.flatMap((allocation) => {
    const cost = numberValue(allocation.originalCost);
    const quantity = numberValue(allocation.quantity);
    return cost === undefined || quantity === undefined || quantity <= 0
      ? []
      : [{ value: cost / quantity, weight: quantity }];
  });
  const allocationAverage = weightedAverage(allocationValues);
  if (allocationAverage !== undefined) return allocationAverage;
  return weightedAverage(
    detail.entryLegs.flatMap((entry) => {
      const price = numberValue(entry.price);
      const quantity = numberValue(entry.originalQuantity);
      return price === undefined || quantity === undefined || quantity <= 0
        ? []
        : [{ value: price, weight: quantity }];
    }),
  );
};

const cycleExitPrice = (detail: TradeDetailResponseV2) =>
  weightedAverage(
    detail.closeSlices.flatMap((slice) => {
      const price = numberValue(slice.price);
      const quantity = numberValue(slice.quantity);
      return price === undefined || quantity === undefined || quantity <= 0
        ? []
        : [{ value: price, weight: quantity }];
    }),
  );

const planForTrade = (detail: TradeDetailResponseV2, plans: PlanRow[], entries: JournalRow[]) => {
  const directPlans = plans
    .filter((plan) => plan.accountId === detail.accountId && plan.tradeId === detail.id)
    .sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
    );
  if (directPlans[0]) return directPlans[0];

  const eventIds = new Set(projectionEventIds(detail));
  const linkedPlanIds = unique(
    entries
      .filter((entry) => entry.tradePlanId !== null && eventIds.has(entry.ledgerEventId ?? ''))
      .map((entry) => entry.tradePlanId!)
      .filter((planId) => plans.some((plan) => plan.id === planId)),
  );
  if (linkedPlanIds.length !== 1) return undefined;
  return plans.find((plan) => plan.id === linkedPlanIds[0]);
};

const candidateJournalEntries = (
  detail: TradeDetailResponseV2,
  plan: PlanRow | undefined,
  entries: JournalRow[],
) => {
  const eventIds = new Set(projectionEventIds(detail));
  return entries.filter(
    (entry) =>
      (entry.ledgerEventId !== null && eventIds.has(entry.ledgerEventId)) ||
      (plan !== undefined && entry.tradePlanId === plan.id),
  );
};

const snapshotKey = (tradeId: string, closeSliceId: string | null) =>
  `${tradeId}:${closeSliceId ?? ''}`;

const snapshotJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;

const legacyItem = (
  entry: JournalRow,
  accountId: string,
  mode: 'actual' | 'shadow',
  matchingSlices: Array<{
    trade: TradeDetailResponseV2;
    slice: TradeDetailResponseV2['closeSlices'][number];
  }>,
) => ({
  id: `legacy:${entry.id}`,
  accountId,
  accountMode: mode,
  reviewObjectType: 'CLOSE_SLICE' as const,
  reviewObjectId: `legacy:${entry.id}`,
  tradeId: matchingSlices.length === 1 ? matchingSlices[0]!.trade.id : null,
  closeSliceId: matchingSlices.length === 1 ? matchingSlices[0]!.slice.id : null,
  reviewStatus: 'LEGACY_REVIEW_NEEDS_CONFIRMATION' as const,
  journalEntryId: entry.id,
  ledgerEventId: entry.ledgerEventId,
  symbol: entry.symbol,
  snapshot: null,
});

const toCandidate = (input: {
  detail: TradeDetailResponseV2;
  slice?: TradeDetailResponseV2['closeSlices'][number];
  plan?: PlanRow;
  journalEntries: JournalRow[];
  ledgerRevision: string;
  snapshot?: SnapshotRow;
}): JournalReviewCandidate | null => {
  const { detail, slice, plan, journalEntries, ledgerRevision, snapshot } = input;
  const reviewObjectType = slice ? 'CLOSE_SLICE' : 'TRADE_CYCLE';
  if (!slice && detail.lifecycle !== 'ENDED') return null;

  const dates = dateValues(detail);
  const entryAt = detail.openedAt ?? firstDate(dates);
  const exitAt = slice?.occurredAt ?? detail.closedAt ?? lastDate(dates);
  if (entryAt === undefined || exitAt === undefined) return null;

  const quantity = numberValue(slice?.quantity ?? detail.closedQuantity);
  const fallbackQuantity = numberValue(detail.sourceQuantity);
  const actualQuantity = quantity !== undefined && quantity > 0 ? quantity : fallbackQuantity;
  if (actualQuantity === undefined || actualQuantity <= 0) return null;

  const pnl = numberValue(slice?.netRealizedPnl ?? detail.netRealizedPnl) ?? null;
  const exitPrice = slice ? numberValue(slice.price) : cycleExitPrice(detail);
  const actualEntry = entryPrice(detail, slice);
  const turnover = exitPrice === undefined ? undefined : Math.abs(exitPrice * actualQuantity);
  const relatedEntries = candidateJournalEntries(detail, plan, journalEntries);
  const planView = plan ? toReviewPlan(plan) : null;
  const missingEvidence: string[] = [];
  const planMissing: string[] = [];
  if (!planView) planMissing.push('交易计划');
  else {
    if (planView.plannedEntry === undefined) planMissing.push('计划入场价');
    if (planView.plannedExit === undefined) planMissing.push('计划退出价');
    if (planView.stopLoss === undefined) planMissing.push('计划止损价');
    if (planView.expectedHoldingDays === undefined) planMissing.push('计划持有天数');
    if (planView.targetWeight === undefined) planMissing.push('目标仓位');
  }
  missingEvidence.push(...planMissing);
  if (detail.openedAt === null || detail.issues.includes('MISSING_OPENING_BOUNDARY'))
    missingEvidence.push('开仓边界');
  if (detail.completeness !== 'COMPLETE') missingEvidence.push('完整交易证据');
  if (detail.costEstimated) missingEvidence.push('完整成本证据');
  if (pnl === null) missingEvidence.push('已实现净收益');
  if (exitPrice === undefined) missingEvidence.push('退出价格');
  if (!slice && detail.endEvidence !== 'SELL_EXECUTION') missingEvidence.push('真实退出成交');

  const excludedReasons: string[] = [];
  if (reviewObjectType === 'CLOSE_SLICE') excludedReasons.push('CLOSE_SLICE_SEPARATE_STATISTICS');
  if (detail.lifecycle !== 'ENDED') excludedReasons.push('LIFECYCLE_ACTIVE');
  if (detail.endEvidence !== 'SELL_EXECUTION') excludedReasons.push('END_EVIDENCE_NOT_SELL');
  if (detail.costEstimated) excludedReasons.push('COST_ESTIMATED');
  if (detail.netRealizedPnl === null || (slice !== undefined && slice.netRealizedPnl === null))
    excludedReasons.push('NET_PNL_UNAVAILABLE');
  if (detail.completeness !== 'COMPLETE') excludedReasons.push('EVIDENCE_INCOMPLETE');
  if (detail.openedAt === null || detail.issues.includes('MISSING_OPENING_BOUNDARY'))
    excludedReasons.push('OPENING_BOUNDARY_UNKNOWN');
  if (actualEntry === undefined) excludedReasons.push('ENTRY_PRICE_UNAVAILABLE');
  if (exitPrice === undefined) excludedReasons.push('EXIT_PRICE_UNAVAILABLE');
  if (detail.projectionFingerprint === null)
    excludedReasons.push('PROJECTION_FINGERPRINT_UNAVAILABLE');

  const stale =
    snapshot !== undefined &&
    snapshot.projectionFingerprint !== null &&
    detail.projectionFingerprint !== null &&
    snapshot.projectionFingerprint !== detail.projectionFingerprint;
  if (stale) {
    excludedReasons.push('STALE_REVIEW_SNAPSHOT');
    missingEvidence.push('当前投影快照');
  }

  const statisticsEligible =
    reviewObjectType === 'TRADE_CYCLE' &&
    detail.lifecycle === 'ENDED' &&
    detail.endEvidence === 'SELL_EXECUTION' &&
    !detail.costEstimated &&
    detail.completeness === 'COMPLETE' &&
    pnl !== null &&
    exitPrice !== undefined &&
    actualEntry !== undefined &&
    detail.projectionFingerprint !== null &&
    !stale;
  let evidenceCompleteness: JournalReviewCandidate['evidenceCompleteness'] = 'partial';
  if (!planView) evidenceCompleteness = 'actual-only';
  else if (planMissing.length === 0) evidenceCompleteness = 'complete';
  const sources = {
    entryEventIds: slice
      ? unique(slice.allocations.map((allocation) => allocation.sourceEventId))
      : entryEventIds(detail),
    exitEventIds: slice ? [slice.eventId] : unique(detail.closeSlices.map((item) => item.eventId)),
    journalEntryIds: relatedEntries.map((entry) => entry.id),
    ...(plan ? { planId: plan.id } : {}),
  };

  return journalReviewCandidateSchema.parse({
    id: slice?.id ?? detail.id,
    accountId: detail.accountId,
    accountMode: detail.accountMode,
    reviewObjectType,
    reviewObjectId: slice?.id ?? detail.id,
    tradeId: detail.id,
    ...(slice ? { closeSliceId: slice.id } : {}),
    reviewStatus: stale ? 'STALE' : 'CURRENT',
    stale,
    statisticsEligible,
    excludedReasons: unique(excludedReasons),
    symbol: detail.symbol,
    entryAt,
    exitAt,
    pnl,
    quantity: actualQuantity,
    ...(actualEntry === undefined ? {} : { entryPrice: actualEntry }),
    ...(exitPrice === undefined ? {} : { exitPrice, actualExit: exitPrice }),
    ...(turnover === undefined ? {} : { turnover }),
    ...(planView?.stopLoss === undefined ? {} : { plannedStop: planView.stopLoss }),
    ...(planView?.expectedHoldingDays === undefined
      ? {}
      : { plannedHoldingDays: planView.expectedHoldingDays }),
    ...(planView?.plannedEntry === undefined ? {} : { plannedEntry: planView.plannedEntry }),
    ...(planView?.plannedExit === undefined ? {} : { plannedExit: planView.plannedExit }),
    ...(planView?.targetWeight === undefined ? {} : { targetWeight: planView.targetWeight }),
    plan: planView,
    evidenceCompleteness,
    missingEvidence: unique(missingEvidence),
    projection: {
      ledgerRevision,
      projectionGeneration: detail.projectionGeneration,
      projectionFingerprint: detail.projectionFingerprint,
      factIds: projectionFactIds(detail),
      eventIds: projectionEventIds(detail),
      fxEvidenceVersion: null,
      conversionFingerprint: null,
    },
    sources,
  });
};

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradeQuery: TradeQueryService,
  ) {}

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
    const [details, plans, journalEntries, version] = await Promise.all([
      this.tradeQuery.listDetails({
        accountId: query.accountId,
        mode: query.mode,
        ...(query.symbol ? { symbol: query.symbol } : {}),
      }),
      this.prisma.tradePlan.findMany({
        where: { accountId: query.accountId, ...(query.symbol ? { symbol: query.symbol } : {}) },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }) as Promise<PlanRow[]>,
      this.prisma.journalEntry.findMany({
        where: { accountId: query.accountId },
        select: { id: true, ledgerEventId: true, tradePlanId: true, symbol: true, side: true },
      }) as Promise<JournalRow[]>,
      this.tradeQuery.readVersion(query.accountId),
    ]);
    const tradeIds = details.map((detail) => detail.id);
    const snapshots = (await this.prisma.journalReviewSnapshot.findMany({
      where: {
        accountId: query.accountId,
        mode: query.mode,
        ...(tradeIds.length === 0 ? {} : { tradeId: { in: tradeIds } }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        tradeId: true,
        closeSliceId: true,
        projectionFingerprint: true,
        projectionGeneration: true,
        createdAt: true,
      },
    })) as SnapshotRow[];
    const latestSnapshots = new Map<string, SnapshotRow>();
    for (const snapshot of snapshots) {
      const key = snapshotKey(snapshot.tradeId, snapshot.closeSliceId);
      if (!latestSnapshots.has(key)) latestSnapshots.set(key, snapshot);
    }

    const candidates = details
      .flatMap((detail) => {
        const plan = planForTrade(detail, plans, journalEntries);
        const common = {
          detail,
          ...(plan ? { plan } : {}),
          journalEntries,
          ledgerRevision: version.ledgerRevision,
        };
        return [
          toCandidate({
            ...common,
            ...(latestSnapshots.has(snapshotKey(detail.id, null))
              ? { snapshot: latestSnapshots.get(snapshotKey(detail.id, null))! }
              : {}),
          }),
          ...detail.closeSlices.map((slice) =>
            toCandidate({
              ...common,
              slice,
              ...(latestSnapshots.has(snapshotKey(detail.id, slice.id))
                ? { snapshot: latestSnapshots.get(snapshotKey(detail.id, slice.id))! }
                : {}),
            }),
          ),
        ];
      })
      .filter((candidate): candidate is JournalReviewCandidate => candidate !== null)
      .filter((candidate) => {
        if (query.start && candidate.exitAt < query.start) return false;
        if (query.end && candidate.exitAt > query.end) return false;
        return true;
      })
      .sort(
        (left, right) =>
          right.exitAt.localeCompare(left.exitAt) ||
          left.reviewObjectId.localeCompare(right.reviewObjectId),
      );

    let startIndex = 0;
    if (query.cursor !== undefined) {
      const cursorIndex = candidates.findIndex(
        (item) => item.reviewObjectId === query.cursor || item.id === query.cursor,
      );
      if (cursorIndex < 0) throw new BadRequestException('复盘候选 cursor 不存在');
      startIndex = cursorIndex + 1;
    }
    const items = candidates.slice(startIndex, startIndex + query.limit);
    const hasMore = startIndex + items.length < candidates.length;

    const slices = details.flatMap((trade) => trade.closeSlices.map((slice) => ({ trade, slice })));
    const currentSellEventIds = new Set(slices.map(({ slice }) => slice.eventId));
    const legacyItems = journalEntries
      .filter(
        (entry) => entry.ledgerEventId !== null && !currentSellEventIds.has(entry.ledgerEventId),
      )
      .map((entry) =>
        legacyItem(
          entry,
          query.accountId,
          query.mode,
          slices.filter(({ slice }) => slice.eventId === entry.ledgerEventId),
        ),
      )
      .filter((item) => item.accountId !== '')
      .filter((item) => !query.symbol || item.symbol === null || item.symbol === query.symbol);

    return {
      items,
      total: candidates.length,
      nextCursor: hasMore ? (items.at(-1)?.reviewObjectId ?? null) : null,
      legacyItems,
    };
  }

  async saveReviewSnapshot(input: JournalReviewSnapshotInput) {
    const query = journalReviewSnapshotInputSchema.parse(input);
    const detail = await this.tradeQuery.get(query.accountId, query.tradeId, query.mode);
    if (query.reviewObjectType === 'CLOSE_SLICE') {
      const slice = detail.closeSlices.find((item) => item.id === query.closeSliceId);
      if (!slice) throw new BadRequestException('复盘快照引用的 Close Slice 不属于当前 Trade');
    }
    const version = await this.tradeQuery.readVersion(query.accountId);
    const snapshot = await this.prisma.journalReviewSnapshot.create({
      data: {
        accountId: query.accountId,
        mode: query.mode,
        reviewObjectType: query.reviewObjectType,
        tradeId: query.tradeId,
        closeSliceId: query.closeSliceId ?? null,
        factIds: snapshotJson(projectionFactIds(detail)),
        eventIds: snapshotJson(projectionEventIds(detail)),
        ledgerRevision: BigInt(version.ledgerRevision),
        projectionGeneration: BigInt(detail.projectionGeneration),
        projectionFingerprint: detail.projectionFingerprint,
        fxEvidenceVersion: query.fxEvidenceVersion ?? null,
        conversionFingerprint: query.conversionFingerprint ?? null,
        inputSnapshot: snapshotJson(query.inputSnapshot),
        outputSnapshot: snapshotJson(query.outputSnapshot),
        status: 'CURRENT',
      },
    });
    return journalReviewSnapshotResponseSchema.parse({
      id: snapshot.id,
      accountId: snapshot.accountId,
      mode: snapshot.mode,
      reviewObjectType: snapshot.reviewObjectType,
      tradeId: snapshot.tradeId,
      ...(snapshot.closeSliceId === null ? {} : { closeSliceId: snapshot.closeSliceId }),
      fxEvidenceVersion: snapshot.fxEvidenceVersion,
      conversionFingerprint: snapshot.conversionFingerprint,
      ledgerRevision: snapshot.ledgerRevision.toString(),
      projectionGeneration: snapshot.projectionGeneration.toString(),
      projectionFingerprint: snapshot.projectionFingerprint,
      factIds: projectionFactIds(detail),
      eventIds: projectionEventIds(detail),
      inputSnapshot: snapshot.inputSnapshot,
      outputSnapshot: snapshot.outputSnapshot,
      status: 'CURRENT',
      createdAt: snapshot.createdAt.toISOString(),
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
