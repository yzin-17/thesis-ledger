import type { JournalReviewEvidenceInput } from '@thesis-ledger/schemas';
import type { JournalBrowserState } from './browser-journal-state.fixture.js';

export function browserJournalEvidenceScenario(
  input: JournalReviewEvidenceInput,
  state: JournalBrowserState,
) {
  if (!['planned', 'cost-missing', 'fx-missing', 'cost-conflict'].includes(state)) return;
  input.projection.evidenceFingerprint += `:${state}`;
  input.plan = {
    id: '00000000-0000-4000-8000-000000000080',
    accountId: input.trade.accountId,
    tradeId: input.trade.id,
    symbol: input.trade.symbol,
    side: 'buy',
    plannedEntry: '10',
    plannedExit: '13',
    stopLoss: '9',
    takeProfit: null,
    targetWeight: null,
    expectedHoldingDays: 3,
    plannedEntryAt: null,
    plannedExitAt: null,
    reason: '固定验收：按原计划退出并核对实际偏差',
    thesis: '固定验收：关联计划保留，草稿独立',
    association: { kind: 'DIRECT_TRADE', journalEntryIds: [], eventIds: [], references: [] },
    status: 'executed',
  };
  if (state === 'planned') return;
  input.trade.netRealizedPnl = null;
  input.trade.realizedNetReturnRate = null;
  for (const slice of input.trade.closeSlices) {
    slice.netRealizedPnl = null;
    slice.realizedNetReturnRate = null;
  }
  if (state === 'cost-missing') {
    for (const leg of input.trade.entryLegs) leg.rawCost = null;
    for (const slice of input.trade.closeSlices)
      for (const allocation of slice.allocations) allocation.originalCost = null;
  } else if (state === 'fx-missing') {
    input.trade.entryLegs[0]!.currency = 'CNY';
  } else if (state === 'cost-conflict') {
    input.trade.completeness = 'CONFLICTED';
    input.trade.costIssues = ['BASELINE_COST_CONFLICT'];
  }
}
