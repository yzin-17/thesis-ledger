import { useQueryClient } from '@tanstack/react-query';
import { draftReviewKeys } from '../src/features/import/draft-review.queries.js';
import { drawerLongRun, drawerImportDraft } from './browser-drawer-samples.js';
import { useRef, useState } from 'react';
import { NewResearchSheet } from '../src/features/ai/NewResearchSheet.js';
import { ResearchSubmissionSheet } from '../src/features/ai/ResearchSubmissionSheet.js';
import { ResearchDetailSheet } from '../src/features/ai/AiResearchDetailView.js';
import { EvidenceChainSheet } from '../src/features/ai/EvidenceChainSheet.js';
import { ImportDraftReviewSheet } from '../src/features/import/ImportDraftReviewSheet.js';
import { ImportReview } from '../src/features/import/ImportReview.js';
import { RawEvidenceSheet } from './fixtures/journal/RawEvidenceSheet.js';
import { JournalDraftSheet } from '../src/features/journal/review/JournalDraftSheet.js';
import { MarketReferenceSheet } from '../src/features/market-data/MarketReferenceSheet.js';
import { MarketNewsSheet } from '../src/features/market-data/MarketNewsSheet.js';
import { LocalHistoryDocumentsSheet } from '../src/features/market-data/LocalHistoryDocumentsSheet.js';
import { InstrumentReadingSheet } from '../src/features/market-detail/MarketDetailReading.js';
import {
  drawerAccount as account,
  drawerPosition as position,
  drawerJournalCandidate as candidate,
  drawerProvider as provider,
} from './browser-drawer-samples.js';

export function DrawerContentCases({ scenario }: { scenario: string }) {
  const [open, setOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  useState(() => {
    if (scenario === 'import-draft-success')
      qc.setQueryData(draftReviewKeys.account(account.id), [drawerImportDraft]);
  });
  const props = { open, onOpenChange: setOpen };
  if (!open) return null;
  if (scenario === 'research-new')
    return (
      <NewResearchSheet
        {...props}
        initialQuestion={'隔离验收研究问题。'.repeat(16)}
        onCreated={() => {}}
      />
    );
  if (scenario === 'research-submit')
    return (
      <ResearchSubmissionSheet
        {...props}
        initialQuestion={'隔离验收研究问题。'.repeat(16)}
        onCreated={() => {}}
      />
    );
  if (scenario.startsWith('research-detail'))
    return (
      <ResearchDetailSheet
        open={open}
        onClose={() => setOpen(false)}
        onRead={() => {}}
        detailTitle={'隔离研究详情标题。'.repeat(6)}
        selectedRun={scenario === 'research-detail-long' ? (drawerLongRun as never) : null}
        detailPending={false}
        detailError
        navigationIds={['fixture-run']}
        selectedIndex={0}
        contentRef={contentRef}
        toolCalls={[]}
        onSwitch={() => {}}
        onRetry={() => {}}
        onOpenSource={() => {}}
      />
    );
  if (scenario === 'research-evidence')
    return (
      <EvidenceChainSheet
        {...props}
        evidence={
          Array.from({ length: 15 }, (_, i) => ({
            claim: `隔离证据 ${i + 1}：` + '来源说明。'.repeat(12),
            citations: [
              {
                source: 'fixture',
                toolName: 'fixture-tool',
                summary: '隔离来源摘要。'.repeat(8),
                timestamp: '2026-11-01T00:00:00Z',
                url: 'https://example.invalid/evidence',
              },
            ],
          })) as never
        }
        toolCalls={[]}
        toolCallsError
      />
    );
  if (scenario.startsWith('import-draft'))
    return (
      <ImportDraftReviewSheet
        {...props}
        accountId={account.id}
        ledgerRevision="1"
        ledgerReady
        onDirtyChange={() => {}}
        onBusyChange={() => {}}
        onPortfolioChanged={() => {}}
        onReadLedger={async () => {}}
      />
    );
  if (scenario === 'import-screenshot')
    return (
      <ImportReview accounts={[account]} positions={[position]} onPortfolioChanged={() => {}} />
    );
  if (scenario === 'journal-raw')
    return (
      <RawEvidenceSheet
        {...props}
        value={Array.from({ length: 80 }, (_, i) => ({
          index: i,
          symbol: position.symbol,
          reason: '隔离只读原始证据。'.repeat(8),
        }))}
      />
    );
  if (scenario === 'journal-draft')
    return (
      <JournalDraftSheet
        {...props}
        candidate={candidate}
        value={{
          plannedEntry: '10.123456789',
          plannedExit: '12',
          stopLoss: '9.9',
          expectedHoldingDays: 30,
        }}
        onApply={() => {}}
      />
    );
  if (scenario === 'market-reference') return <MarketReferenceSheet />;
  if (scenario === 'market-news') return <MarketNewsSheet />;
  if (scenario === 'market-documents')
    return (
      <LocalHistoryDocumentsSheet
        provider={provider as never}
        onClose={() => setOpen(false)}
        onReadCheck={() => {}}
      />
    );
  if (scenario === 'market-reading')
    return <InstrumentReadingSheet position={{ ...position, mode: 'actual' }} />;
  return null;
}
