import { createHash } from 'node:crypto';
import { omit, sortBy, uniq } from 'es-toolkit';
import { DecimalValue, journalReviewWindow } from '@thesis-ledger/domain';
import {
  journalReviewEvidenceInputSchema,
  type JournalReviewEvidenceInput,
  type TradeDetailResponse,
  type JournalAnalysisDraft,
} from '@thesis-ledger/schemas';

const ordered = <T extends object>(items: readonly T[]) =>
  sortBy(items, [(item) => JSON.stringify(item)]);

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(sortBy(Object.entries(item), [([key]) => key]));
  });

const fact = <T extends { id: string }>(row: T) => omit(row, ['id']);

function cycleEvidence(trade: TradeDetailResponse) {
  return {
    ...omit(trade, [
      'assetName',
      'projectionGeneration',
      'projectionFingerprint',
      'excludedReasons',
      'entryLegs',
      'baselineComponents',
      'corporateActions',
      'closeSlices',
      'dividendAttributions',
      'evidenceSources',
    ]),
    entryLegs: ordered(trade.entryLegs.map(fact)),
    baselineComponents: ordered(trade.baselineComponents.map(fact)),
    corporateActions: ordered(trade.corporateActions.map(fact)),
    closeSlices: ordered(
      trade.closeSlices.map((slice) => ({
        ...fact(slice),
        allocations: ordered(slice.allocations.map(fact)),
      })),
    ),
    dividendAttributions: ordered(trade.dividendAttributions.map(fact)),
    evidenceSources: ordered(trade.evidenceSources.map(fact)),
  };
}

function sliceEvidence(input: JournalReviewEvidenceInput) {
  if (input.reference.reviewObjectType !== 'CLOSE_SLICE') throw new Error('需要减仓片段引用');
  const sliceId = input.reference.closeSliceId;
  const trade = input.trade;
  const slice = trade.closeSlices.find((row) => row.id === sliceId)!;
  const sourceFacts = new Set(slice.allocations.map((row) => row.sourceFactId));
  const entries = trade.entryLegs.filter((row) => sourceFacts.has(row.factId));
  const baselines = trade.baselineComponents.filter((row) => sourceFacts.has(row.factId));
  const corporateActions = trade.corporateActions.filter(
    (row) =>
      row.occurredAt === null ||
      slice.occurredAt === null ||
      DecimalValue.from(
        journalReviewWindow({ start: row.occurredAt }).startEpochSeconds!,
      ).compareTo(journalReviewWindow({ start: slice.occurredAt }).startEpochSeconds!) <= 0,
  );
  const openingFacts = trade.evidenceSources.filter(
    (row) => row.kind === 'OPENING_BOUNDARY_ASSERTION',
  );
  const factIds = uniq([
    slice.factId,
    ...sourceFacts,
    ...baselines.flatMap((row) => [
      ...row.reconciledExecutionFactIds,
      ...row.reconciliationFactIds,
    ]),
    ...corporateActions.map((row) => row.factId),
    ...openingFacts.map((row) => row.factId),
  ]);
  const evidenceSources = trade.evidenceSources.filter((row) => factIds.includes(row.factId));
  return {
    id: trade.id,
    accountId: trade.accountId,
    accountMode: trade.accountMode,
    symbol: trade.symbol,
    openedAt: trade.openedAt,
    algorithmVersion: trade.algorithmVersion,
    slice: { ...fact(slice), allocations: ordered(slice.allocations.map(fact)) },
    entryLegs: ordered(
      entries.map((row) => omit(row, ['id', 'quantity', 'remainingQuantity', 'remainingCost'])),
    ),
    baselineComponents: ordered(
      baselines.map((row) => omit(row, ['id', 'quantity', 'remainingQuantity', 'remainingCost'])),
    ),
    corporateActions: ordered(corporateActions.map(fact)),
    evidenceSources: ordered(evidenceSources.map(fact)),
    costIssues: slice.netRealizedPnl === null ? trade.costIssues : [],
    factIds: factIds.sort(),
    eventIds: uniq([
      slice.eventId,
      ...slice.allocations.map((row) => row.sourceEventId),
      ...corporateActions.map((row) => row.eventId),
      ...openingFacts.map((row) => row.eventId),
      ...evidenceSources.map((row) => row.eventId),
    ]).sort(),
  };
}

export function journalReviewEvidenceReferences(raw: JournalReviewEvidenceInput): {
  factIds: string[];
  eventIds: string[];
} {
  const input = journalReviewEvidenceInputSchema.parse(raw);
  if (input.reference.reviewObjectType === 'CLOSE_SLICE') {
    const scope = sliceEvidence(input);
    return { factIds: scope.factIds, eventIds: scope.eventIds };
  }
  const trade = input.trade;
  const rows = [
    ...trade.entryLegs,
    ...trade.baselineComponents,
    ...trade.corporateActions,
    ...trade.closeSlices,
    ...trade.dividendAttributions,
    ...trade.evidenceSources,
  ];
  return {
    factIds: uniq([
      ...rows.map((row) => row.factId),
      ...trade.baselineComponents.flatMap((row) => [
        ...row.reconciledExecutionFactIds,
        ...row.reconciliationFactIds,
      ]),
      ...trade.closeSlices.flatMap((row) =>
        row.allocations.map((allocation) => allocation.sourceFactId),
      ),
    ]).sort(),
    eventIds: uniq([
      ...rows.map((row) => row.eventId),
      ...trade.closeSlices.flatMap((row) =>
        row.allocations.map((allocation) => allocation.sourceEventId),
      ),
    ]).sort(),
  };
}

export function journalReviewObjectFacts(raw: JournalReviewEvidenceInput) {
  const input = journalReviewEvidenceInputSchema.parse(raw);
  const trade =
    input.reference.reviewObjectType === 'TRADE_CYCLE'
      ? cycleEvidence(input.trade)
      : sliceEvidence(input);
  return {
    reference: input.reference,
    trade,
    plan:
      input.plan === null
        ? null
        : {
            ...input.plan,
            association: {
              ...input.plan.association,
              journalEntryIds: uniq(input.plan.association.journalEntryIds).sort(),
              eventIds: uniq(input.plan.association.eventIds).sort(),
              references: ordered(input.plan.association.references),
            },
          },
    journalEntries: ordered(journalReviewScopedNotes(input)),
    fxEvidence: ordered(input.fxEvidence),
    fxEvidenceVersion: input.projection.fxEvidenceVersion,
    conversionFingerprint: input.projection.conversionFingerprint,
  };
}

export function journalReviewEvidenceFingerprint(raw: JournalReviewEvidenceInput): string {
  return createHash('sha256')
    .update(canonical(journalReviewObjectFacts(raw)))
    .digest('hex');
}

export const journalReviewDraftKey = (draft: JournalAnalysisDraft | null | undefined) =>
  canonical(draft ?? null);

export function journalReviewScopedNotes(input: JournalReviewEvidenceInput) {
  if (input.reference.reviewObjectType === 'TRADE_CYCLE') return input.journalEntries;
  const events = new Set(journalReviewEvidenceReferences(input).eventIds);
  return input.journalEntries.filter((note) => {
    if (note.ledgerEventId !== null) return events.has(note.ledgerEventId);
    return note.tradePlanId !== null && note.tradePlanId === input.plan?.id;
  });
}
