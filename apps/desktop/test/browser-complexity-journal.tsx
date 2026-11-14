import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { Toaster } from '../src/components/ui/toast';
import { JournalDashboard } from '../src/features/journal/JournalDashboard';
import { SingleReviewResult } from '../src/features/journal/JournalReviewResults';
import { journalKeys } from '../src/features/journal/journal.queries';
import type { JournalReviewCandidate } from '../src/features/journal/journal.types';
import '../src/ui/styles.css';

const account = {
  id: 'account-1',
  name: '示例账户',
  type: 'securities' as const,
  mode: 'actual' as const,
  currency: 'CNY' as const,
};

const candidate: JournalReviewCandidate = {
  id: 'review:account-1:600519.SH:entry:sell',
  accountId: account.id,
  accountMode: 'actual',
  reviewObjectType: 'TRADE_CYCLE',
  reviewObjectId: 'trade:account-1:600519.SH:entry',
  tradeId: 'trade:account-1:600519.SH:entry',
  reviewStatus: 'CURRENT',
  stale: false,
  statisticsEligible: true,
  excludedReasons: [],
  symbol: '600519.SH',
  entryAt: '2026-01-02T09:30:00.000Z',
  exitAt: '2026-01-06T09:30:00.000Z',
  pnl: -120,
  quantity: 100,
  entryPrice: 1450,
  exitPrice: 1388,
  actualExit: 1388,
  plannedEntry: 1440,
  plannedExit: 1510,
  plannedStop: 1400,
  plannedHoldingDays: 2,
  targetWeight: 0.1,
  peakWeight: 0.18,
  evidenceCompleteness: 'complete',
  missingEvidence: [],
  plan: { id: 'plan-1', plannedEntry: 1440, plannedExit: 1510, plannedStop: 1400 },
  projection: {
    ledgerRevision: '1',
    projectionGeneration: '1',
    projectionFingerprint: 'fingerprint-1',
    factIds: [],
    eventIds: [],
    fxEvidenceVersion: null,
    conversionFingerprint: null,
  },
  sources: {
    entryEventIds: ['entry'],
    exitEventIds: ['sell'],
    journalEntryIds: ['journal-1'],
    planId: 'plan-1',
  },
};

const sample = { items: [candidate], total: 1, nextCursor: null, legacyItems: [] };
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
client.setQueryDefaults(journalKeys.root, { initialData: sample });
const scenario = new URLSearchParams(window.location.search).get('case') ?? 'populated';

function Harness() {
  useEffect(() => {
    const publish = () => {
      document.documentElement.dataset.journalQueries = JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.queryKey),
      );
    };
    const unsubscribe = client.getQueryCache().subscribe(publish);
    publish();
    document.documentElement.dataset.journalReady = scenario;
    return unsubscribe;
  }, []);
  return (
    <QueryClientProvider client={client}>
      <Toaster>
        <ConfirmDialogProvider>
          <main className="mx-auto max-w-7xl p-4">
            {scenario === 'single-result' ? (
              <SingleReviewResult
                trade={candidate}
                candidate={candidate}
                result={{
                  plannedVsActual: {
                    entryDeviation: 10,
                    exitDeviation: -122,
                    holdingDayDeviation: 2,
                  },
                  behavior: { missedStops: 1 },
                  counterfactual: {
                    actualPnl: -120,
                    counterfactualPnl: -50,
                    difference: 70,
                    assumption: '受控反事实样本，未计滑点。',
                  },
                }}
                aiRun={null}
                aiPending={false}
                aiError={null}
                onExplain={() => {
                  throw new Error('受控验收不调用模型');
                }}
              />
            ) : (
              <JournalDashboard
                accounts={scenario === 'empty' ? [] : [account]}
                accountsPending={scenario === 'loading'}
                accountsReady={false}
                search="?accountId=account-1&tradeId=trade:account-1:600519.SH:entry&reviewObjectType=TRADE_CYCLE&mode=actual"
                onNavigateAccounts={() => {
                  document.documentElement.dataset.journalNavigation = 'accounts';
                }}
              />
            )}
          </main>
        </ConfirmDialogProvider>
      </Toaster>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
