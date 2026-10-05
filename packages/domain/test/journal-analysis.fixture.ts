import type { JournalAnalysisCandidate } from '../src/journal-analysis-contract.js';

export const journalAnalysisFixture = (): JournalAnalysisCandidate => ({
  input: {
    reference: {
      reviewObjectType: 'TRADE_CYCLE',
      reviewObjectId: 'TRADE_CYCLE:trade-1',
      tradeId: 'trade-1',
    },
    trade: {
      id: 'trade-1',
      symbol: 'AAPL.US',
      lifecycle: 'ENDED',
      openedAt: '2026-01-01T09:00:00Z',
      closedAt: '2026-01-03T09:00:00Z',
      netRealizedPnl: '4',
      realizedNetReturnRate: '0.2',
      entryLegs: [{ factId: 'buy-1', currency: 'USD', price: '10', originalQuantity: '2' }],
      baselineComponents: [],
      corporateActions: [],
      closeSlices: ['slice-1', 'slice-2'].map((id, index) => ({
        id,
        occurredAt: `2026-01-0${index + 2}T09:00:00Z`,
        currency: 'USD',
        price: '12',
        quantity: '1',
        netRealizedPnl: '2',
        realizedNetReturnRate: '0.2',
        allocations: [{ source: 'ENTRY_LEG', sourceFactId: 'buy-1', quantity: '1' }],
      })),
    },
    plan: {
      symbol: 'AAPL.US',
      plannedEntry: '10',
      plannedExit: '13',
      stopLoss: '9',
      expectedHoldingDays: 3,
    },
  },
  statisticsEligibility: { eligible: true, reasons: [] },
});

export const journalSliceAnalysisFixture = () => {
  const candidate = journalAnalysisFixture();
  candidate.input.reference = {
    reviewObjectType: 'CLOSE_SLICE',
    reviewObjectId: 'CLOSE_SLICE:slice-1',
    tradeId: 'trade-1',
    closeSliceId: 'slice-1',
  };
  return candidate;
};
