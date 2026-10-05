import { journalReviewObjectTimes, journalStatisticsEligibility } from '@thesis-ledger/domain';
import {
  journalReviewCandidateContractSchema,
  journalLegacyReviewContractSchema,
  type JournalReviewEvidenceInput,
} from '@thesis-ledger/schemas';
import { journalBrowserStateFixture } from './browser-journal-state.fixture.js';
import { browserJournalEvidenceScenario } from './browser-journal-evidence.fixture.js';

export function browserJournalLegacy(accountId: string, mode: 'actual' | 'shadow') {
  const ambiguous = journalBrowserStateFixture.state === 'legacy-ambiguous';
  return journalLegacyReviewContractSchema.parse({
    id: 'legacy:00000000-0000-4000-8000-000000000070',
    accountId,
    accountMode: mode,
    reviewStatus: 'LEGACY_REVIEW_NEEDS_CONFIRMATION',
    reason: ambiguous ? 'SELL_MAPPING_AMBIGUOUS' : 'SELL_MAPPING_MISSING',
    possibleReferences: ambiguous
      ? ['slice-one', 'slice-two'].map((closeSliceId) => ({
          reviewObjectType: 'CLOSE_SLICE',
          reviewObjectId: 'CLOSE_SLICE:' + closeSliceId,
          tradeId: 'browser-trade-' + closeSliceId,
          closeSliceId,
        }))
      : [],
    statisticsEligibility: { eligible: false, reasons: ['LEGACY_UNCONFIRMED'] },
    journalEntry: {
      id: '00000000-0000-4000-8000-000000000070',
      accountId,
      entryType: 'trade',
      ledgerEventId: ambiguous ? '00000000-0000-4000-8000-000000000030' : null,
      tradePlanId: null,
      symbol: 'AAPL.US',
      side: 'sell',
      reason: ambiguous ? '固定旧记录：同一来源存在多个减仓候选' : '固定旧记录：缺少明确减仓关联',
      content: null,
      thesis: null,
      catalyst: null,
      risk: null,
      exitReason: null,
      emotion: null,
      notes: null,
      tags: null,
      createdAt: '2026-01-03T09:00:00Z',
    },
  });
}

export function browserJournalCandidate(input: JournalReviewEvidenceInput) {
  const state = journalBrowserStateFixture.state;
  const trade = input.trade;
  browserJournalEvidenceScenario(input, state);
  if (['active', 'unknown-time', 'baseline', 'close-slice'].includes(state))
    input.projection.evidenceFingerprint += `:${state}`;
  if (state === 'active') {
    trade.lifecycle = 'ACTIVE';
    trade.closedAt = null;
    trade.endEvidence = 'UNKNOWN';
    trade.exitProgress = 'PARTIAL';
    trade.remainingQuantity = '1';
  } else if (state === 'unknown-time') {
    trade.openedAt = null;
  } else if (state === 'baseline') {
    trade.openedAt = null;
    trade.costEstimated = true;
    trade.entryLegs = [];
    trade.baselineComponents = [
      {
        id: 'browser-baseline',
        eventId: '00000000-0000-4000-8000-000000000030',
        factId: '00000000-0000-4000-8000-000000000031',
        batchId: '00000000-0000-4000-8000-000000000032',
        batchScope: 'PARTIAL',
        occurredAt: '2026-01-01T09:00:00Z',
        currency: 'USD',
        observedQuantity: '2',
        quantity: '2',
        remainingQuantity: '0',
        averageCost: '10',
        rawCost: '20',
        remainingCost: '0',
        rawCostEstimated: true,
        costIncludesFees: 'UNKNOWN',
        reconciledExecutionFactIds: [],
        reconciliationFactIds: [],
      },
    ];
    trade.closeSlices[0]!.allocations[0]!.source = 'BASELINE_COMPONENT';
    trade.closeSlices[0]!.allocations[0]!.sourceEventId = trade.baselineComponents[0]!.eventId;
    trade.closeSlices[0]!.allocations[0]!.sourceFactId = trade.baselineComponents[0]!.factId;
    trade.closeSlices[0]!.costEstimated = true;
  } else if (state === 'close-slice') {
    input.reference = {
      reviewObjectType: 'CLOSE_SLICE',
      reviewObjectId: 'CLOSE_SLICE:slice-1',
      tradeId: trade.id,
      closeSliceId: 'slice-1',
    };
  }
  const times = journalReviewObjectTimes(trade, input.reference);
  return journalReviewCandidateContractSchema.parse({
    input,
    ...times,
    reviewStatus: 'CURRENT',
    missingEvidence: input.plan === null ? ['PLAN_MISSING'] : [],
    statisticsEligibility: journalStatisticsEligibility({
      reviewObjectType: input.reference.reviewObjectType,
      lifecycle: trade.lifecycle,
      endEvidence: trade.endEvidence,
      openedAt: trade.openedAt,
      statisticsAt: times.executedAt ?? times.effectiveClosedAt,
      costEstimated: trade.costEstimated,
      costConflict: state === 'cost-conflict',
      fxMissing: state === 'fx-missing',
      evidenceComplete: trade.netRealizedPnl !== null,
      stale: false,
      legacyUnconfirmed: false,
    }),
  });
}
