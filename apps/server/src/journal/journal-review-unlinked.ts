import { journalReviewObjectReference } from '@thesis-ledger/domain';
import {
  journalUnlinkedReviewSchema,
  type JournalReviewEvidenceInput,
  type TradeDetailResponse,
} from '@thesis-ledger/schemas';

export function journalUnlinkedReviews(input: {
  accountId: string;
  mode: 'actual' | 'shadow';
  symbol?: string;
  trades: readonly TradeDetailResponse[];
  entries: JournalReviewEvidenceInput['journalEntries'];
}) {
  const slices = input.trades
    .filter((trade) => trade.accountId === input.accountId && trade.accountMode === input.mode)
    .flatMap((trade) => trade.closeSlices.map((slice) => ({ trade, slice })));
  return input.entries
    .filter(
      (entry) =>
        entry.accountId === input.accountId &&
        entry.side === 'SELL' &&
        (input.symbol === undefined || entry.symbol === null || entry.symbol === input.symbol),
    )
    .flatMap((entry) => {
      const matches = slices.filter((row) => row.slice.eventId === entry.ledgerEventId);
      if (matches.length === 1) return [];
      return [
        journalUnlinkedReviewSchema.parse({
          id: `unlinked:${entry.id}`,
          accountId: input.accountId,
          accountMode: matches.length === 0 ? null : input.mode,
          reviewStatus: 'NEEDS_REVIEW_ASSOCIATION',
          reason: matches.length === 0 ? 'SELL_MAPPING_MISSING' : 'SELL_MAPPING_AMBIGUOUS',
          journalEntry: entry,
          possibleReferences: matches.map((row) =>
            journalReviewObjectReference(row.trade, row.slice.id),
          ),
          statisticsEligibility: { eligible: false, reasons: ['UNLINKED_JOURNAL_ENTRY'] },
        }),
      ];
    });
}
