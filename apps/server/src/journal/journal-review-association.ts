import type { JournalEntry, TradePlan } from '@prisma/client';
import { uniq } from 'es-toolkit';
import {
  journalDecimalPlanSchema,
  journalReviewNoteSchema,
  type JournalReviewEvidenceInput,
  type TradeDetailResponse,
} from '@thesis-ledger/schemas';

const objectEvents = (trade: TradeDetailResponse) =>
  new Set(
    [
      ...trade.entryLegs,
      ...trade.baselineComponents,
      ...trade.corporateActions,
      ...trade.closeSlices,
      ...trade.dividendAttributions,
      ...trade.evidenceSources,
    ]
      .map((row) => row.eventId)
      .concat(
        trade.closeSlices.flatMap((slice) => slice.allocations.map((row) => row.sourceEventId)),
      ),
  );

type PlanAssociation = NonNullable<JournalReviewEvidenceInput['plan']>['association'];

function planView(plan: TradePlan, association: PlanAssociation) {
  return journalDecimalPlanSchema.parse({
    id: plan.id,
    accountId: plan.accountId,
    tradeId: plan.tradeId,
    symbol: plan.symbol,
    side: plan.side,
    plannedEntry: plan.plannedEntry?.toString() ?? null,
    plannedExit: plan.plannedExit?.toString() ?? null,
    stopLoss: plan.stopLoss?.toString() ?? null,
    takeProfit: plan.takeProfit?.toString() ?? null,
    targetWeight: plan.targetWeight?.toString() ?? null,
    expectedHoldingDays: plan.expectedHoldingDays,
    plannedEntryAt: plan.plannedEntryAt?.toISOString() ?? null,
    plannedExitAt: plan.plannedExitAt?.toISOString() ?? null,
    reason: plan.reason,
    thesis: plan.thesis,
    status: plan.status,
    association,
  });
}

export function journalReviewNoteView(note: JournalEntry) {
  return journalReviewNoteSchema.parse({
    id: note.id,
    accountId: note.accountId,
    entryType: note.entryType,
    ledgerEventId: note.ledgerEventId,
    tradePlanId: note.tradePlanId,
    symbol: note.symbol,
    side: note.side,
    reason: note.reason,
    content: note.content,
    thesis: note.thesis,
    catalyst: note.catalyst,
    risk: note.risk,
    exitReason: note.exitReason,
    emotion: note.emotion,
    notes: note.notes,
    tags: note.tags,
    createdAt: note.createdAt.toISOString(),
  });
}

export function journalReviewAssociation(input: {
  trade: TradeDetailResponse;
  plans: readonly TradePlan[];
  entries: readonly JournalEntry[];
}) {
  const events = objectEvents(input.trade);
  const plans = input.plans.filter((row) => row.accountId === input.trade.accountId);
  const entries = input.entries.filter((row) => row.accountId === input.trade.accountId);
  const direct = plans.filter((row) => row.tradeId === input.trade.id);
  const linked = entries.filter(
    (row) =>
      row.tradePlanId !== null && row.ledgerEventId !== null && events.has(row.ledgerEventId),
  );
  const linkedPlanIds = uniq(linked.map((row) => row.tradePlanId!));
  const candidateIds = uniq([
    ...direct.map((row) => row.id),
    ...plans
      .filter(
        (row) =>
          linkedPlanIds.includes(row.id) &&
          (row.tradeId === null || row.tradeId === input.trade.id),
      )
      .map((row) => row.id),
  ]);
  const candidates = plans.filter((row) => candidateIds.includes(row.id));
  let selected: TradePlan | undefined;
  let proof: PlanAssociation = {
    kind: 'DIRECT_TRADE',
    journalEntryIds: [],
    eventIds: [],
    references: [],
  };
  const missingEvidence: string[] = [];
  if (candidates.length === 1) {
    selected = candidates[0];
    if (selected!.symbol !== input.trade.symbol) {
      selected = undefined;
      missingEvidence.push('PLAN_SYMBOL_CONFLICT');
    }
    if (selected?.tradeId === null) {
      const notes = linked.filter((row) => row.tradePlanId === selected!.id);
      proof = {
        kind: 'JOURNAL_EVENT',
        journalEntryIds: uniq(notes.map((row) => row.id)).sort(),
        eventIds: uniq(notes.map((row) => row.ledgerEventId!)).sort(),
        references: notes.map((row) => ({
          journalEntryId: row.id,
          ledgerEventId: row.ledgerEventId!,
          tradePlanId: row.tradePlanId!,
          accountId: row.accountId!,
        })),
      };
    }
  } else if (candidates.length > 1) missingEvidence.push('PLAN_ASSOCIATION_AMBIGUOUS');
  else if (linkedPlanIds.length > 0) missingEvidence.push('PLAN_ASSOCIATION_UNCONFIRMED');
  const related = entries.filter((row) => {
    if (row.ledgerEventId !== null && !events.has(row.ledgerEventId)) return false;
    if (row.ledgerEventId !== null) return true;
    return selected !== undefined && row.tradePlanId === selected.id;
  });
  return {
    plan: selected === undefined ? null : planView(selected, proof),
    journalEntries: related.map(journalReviewNoteView),
    missingEvidence,
  };
}
