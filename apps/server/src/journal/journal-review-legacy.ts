import { journalReviewObjectReference } from '@thesis-ledger/domain';
import {
  journalLegacyReviewContractSchema,
  type JournalReviewEvidenceInput,
  type TradeDetailResponse,
} from '@thesis-ledger/schemas';

export function journalReviewLegacy(input: {
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
        journalLegacyReviewContractSchema.parse({
          id: `legacy:${entry.id}`,
          accountId: input.accountId,
          accountMode: matches.length === 0 ? null : input.mode,
          reviewStatus: 'LEGACY_REVIEW_NEEDS_CONFIRMATION',
          reason: matches.length === 0 ? 'SELL_MAPPING_MISSING' : 'SELL_MAPPING_AMBIGUOUS',
          journalEntry: entry,
          possibleReferences: matches.map((row) =>
            journalReviewObjectReference(row.trade, row.slice.id),
          ),
          statisticsEligibility: { eligible: false, reasons: ['LEGACY_UNCONFIRMED'] },
        }),
      ];
    });
}
