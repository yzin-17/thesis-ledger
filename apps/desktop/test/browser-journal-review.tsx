import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { journalAnalyze, journalAnalyzePeriod } from '@thesis-ledger/domain';
import {
  journalDeterministicReviewSchema,
  journalPeriodReviewRequestSchema,
  journalReviewSnapshotRequestSchema,
  type JournalStoredSnapshotView,
} from '@thesis-ledger/schemas';
import { JournalReviewWorkspace } from '../src/features/journal/review/JournalReviewWorkspace.js';
import { Button } from '../src/components/ui/button.js';
import { journalUiEvidenceFixture } from './journal-review.fixture.js';
import {
  browserJournalCandidate,
  browserJournalLegacy,
} from './browser-journal-candidate.fixture.js';
import '../src/ui/styles.css';
import {
  browserJournalAiResponse,
  browserJournalAiMetadata,
  journalBrowserAiFixture,
} from './browser-journal-ai.fixture.js';
import {
  browserJournalFailure,
  JournalBrowserStateControls,
  journalBrowserStateFixture,
  type JournalBrowserState,
} from './browser-journal-state.fixture.js';
import {
  browserJournalCandidateForObject,
  browserJournalCandidatePage,
  browserJournalHoldCandidateResponse,
  browserJournalReleaseCandidateResponses,
  browserJournalScenarioCandidates,
} from './browser-journal-scenario.fixture.js';

const account = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '实际验收账户',
  type: 'securities' as const,
  mode: 'actual' as const,
  currency: 'USD' as const,
};
const shadow = {
  ...account,
  id: '00000000-0000-4000-8000-000000000090',
  name: '模拟验收账户',
  mode: 'shadow' as const,
};
let version = 'source-1';
let snapshotCount = 0;
const history: JournalStoredSnapshotView[] = [];
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function candidate(accountId: string, objectId?: string) {
  const input = journalUiEvidenceFixture();
  input.trade.accountId = accountId;
  input.trade.accountMode = accountId === shadow.id ? 'shadow' : 'actual';
  input.projection.evidenceFingerprint = version;
  const current = browserJournalCandidate(input);
  if (!objectId) return current;
  return browserJournalCandidateForObject(current, objectId);
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  const failure = browserJournalFailure(url, init?.method);
  if (failure) return failure;
  const scope = url.searchParams.get('accountId') ?? account.id;
  if (init?.method === 'POST') {
    const raw: unknown = JSON.parse(String(init.body));
    const ai = browserJournalAiResponse(url, raw, candidate);
    if (ai) return ai;
    if (url.pathname.endsWith('/analysis/period')) {
      const request = journalPeriodReviewRequestSchema.parse(raw);
      const candidates = browserJournalScenarioCandidates(candidate(request.accountId));
      return json({
        accountId: request.accountId,
        mode: request.mode,
        symbol: request.symbol ?? null,
        ledgerRevision: '12',
        projectionGeneration: '7',
        candidates,
        result: journalAnalyzePeriod(candidates, request),
      });
    }
    const request = journalReviewSnapshotRequestSchema.parse(raw);
    const current = candidate(request.accountId, request.reference.reviewObjectId);
    if (request.evidenceFingerprint !== current.input.projection.evidenceFingerprint)
      return json(
        { errorCode: 'JOURNAL_EVIDENCE_CHANGED', message: '复盘证据已变化，请刷新' },
        409,
      );
    current.input.analysisDraft = request.analysisDraft ?? null;
    const result = journalDeterministicReviewSchema.parse(journalAnalyze(current));
    if (url.pathname.endsWith('/analysis/object')) return json({ candidate: current, result });
    if (url.pathname.endsWith('/review-snapshots')) {
      result.aiExplanation = browserJournalAiMetadata(request.aiRunId);
      const saved: JournalStoredSnapshotView = {
        compatibility: 'CURRENT_CONTRACT',
        accountId: request.accountId,
        mode: request.mode,
        snapshot: {
          id: `00000000-0000-4000-8000-${String(++snapshotCount).padStart(12, '0')}`,
          inputSnapshot: current.input,
          outputSnapshot: result,
          status: 'CURRENT',
          createdAt: new Date().toISOString(),
        },
      };
      history.unshift(saved);
      return json(saved);
    }
  }
  const ai = browserJournalAiResponse(url, undefined, candidate);
  if (ai) return ai;
  if (url.pathname.endsWith('/review-candidates')) {
    const page = browserJournalCandidatePage(
      url,
      browserJournalScenarioCandidates(candidate(scope)),
    );
    if (page instanceof Response) return page;
    const response = json({
      ...page,
      legacyItems: ['legacy', 'legacy-ambiguous'].includes(journalBrowserStateFixture.state)
        ? [browserJournalLegacy(scope, scope === shadow.id ? 'shadow' : 'actual')]
        : [],
      ledgerRevision: '12',
      projectionGeneration: '7',
      instrumentDirectory: { generation: 1, items: [], unresolvedSymbols: ['AAPL.US'] },
    });
    return browserJournalHoldCandidateResponse(response);
  }
  if (url.pathname.endsWith('/review-object-reference')) {
    const type = url.searchParams.get('reviewObjectType') ?? 'TRADE_CYCLE';
    const sourceId = url.searchParams.get(type === 'CLOSE_SLICE' ? 'closeSliceId' : 'tradeId');
    return json(candidate(scope, `${type}:${sourceId}`));
  }
  if (url.pathname.includes('/review-objects/'))
    return json(candidate(scope, decodeURIComponent(url.pathname.split('/').at(-1) ?? '')));
  const views = history
    .filter((row) => row.accountId === scope)
    .map((row) =>
      row.compatibility === 'CURRENT_CONTRACT'
        ? {
            ...row,
            snapshot: {
              ...row.snapshot,
              status:
                row.snapshot.inputSnapshot.projection.evidenceFingerprint ===
                candidate(scope, row.snapshot.inputSnapshot.reference.reviewObjectId).input
                  .projection.evidenceFingerprint
                  ? 'CURRENT'
                  : 'STALE',
            },
          }
        : row,
    );
  if (url.pathname.endsWith('/review-snapshots')) return json({ items: views, nextCursor: null });
  if (url.pathname.includes('/review-snapshots/'))
    return json(
      views.find(
        (row) =>
          row.compatibility === 'CURRENT_CONTRACT' &&
          row.snapshot.id === url.pathname.split('/').at(-1),
      ),
    );
  return json({ message: '固定验收页未提供此接口' }, 404);
};
function BrowserJournalReview() {
  const [state, setState] = useState<JournalBrowserState>('ready');
  return (
    <QueryClientProvider client={queryClient}>
      <main className="flex min-w-0 flex-col gap-4 p-4">
        <p>本页使用固定复盘输入验证实际组件交互。请求均在此页处理，不访问或写入业务服务。</p>
        <JournalBrowserStateControls
          onChange={(next) => {
            setState(next);
            void queryClient.invalidateQueries();
          }}
        />
        <Button
          variant="outline"
          className="self-start"
          onClick={() => browserJournalReleaseCandidateResponses()}
        >
          释放已延迟的候选响应
        </Button>
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            version = 'source-2';
            void queryClient.invalidateQueries();
          }}
        >
          模拟相关证据变化
        </Button>
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            journalBrowserAiFixture.enabled = true;
          }}
        >
          启用固定 AI 终态验收
        </Button>
        <JournalReviewWorkspace
          accounts={state === 'no-accounts' ? [] : [account, shadow]}
          accountsPending={state === 'accounts-pending'}
          accountsError={state === 'accounts-error'}
          onRetry={() => {
            journalBrowserStateFixture.state = 'ready';
            setState('ready');
          }}
        />
      </main>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<BrowserJournalReview />);
