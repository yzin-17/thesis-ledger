import type { Dispatch, SetStateAction } from 'react';
import { useJournalReviewActions } from './useJournalReviewActions.js';
import { toReviewTrade, latestWindow } from './journal-review-input.js';

import { useEffect, useMemo, useState } from 'react';

import type { Account } from '../portfolio/portfolio.types.js';

import { useReviewCandidatesQuery } from './journal.queries.js';
import type {
  BehaviorReviewResult,
  DeterministicJournalReviewResult,
  JournalReviewCandidate,
  JournalReviewResult,
  ReviewEvidenceDraft,
  ReviewTrade,
  ReviewWindow,
  ReviewWindowPreset,
} from './journal.types.js';

export type JournalDashboardProps = {
  accounts?: Account[];
  accountsReady?: boolean;
  accountsPending?: boolean;
  accountsError?: boolean;
  onRetry?: () => void;
  onNavigateAccounts?: () => void;
  onNavigatePosition?: () => void;
  search?: string;
};

export function useJournalReview({
  accounts = [],
  accountsReady = true,
  accountsPending = false,
  accountsError = false,
  onRetry,
  onNavigateAccounts,
  onNavigatePosition,
  search = '',
}: JournalDashboardProps) {
  const requestedReview = useRequestedReviewTarget(search);

  const [tab, setTab] = useState<'single' | 'period'>('single');

  const [accountId, setAccountId] = useState('');

  const [symbolFilter, setSymbolFilter] = useState('');

  const [singleStartDate, setSingleStartDate] = useState('');

  const [singleEndDate, setSingleEndDate] = useState('');

  const [selectedCandidate, setSelectedCandidate] = useState<JournalReviewCandidate | null>(null);

  const [manualTrade, setManualTrade] = useState<ReviewTrade | null>(null);

  const [evidenceDraft, setEvidenceDraft] = useState<ReviewEvidenceDraft>({});

  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [advancedMode, setAdvancedMode] = useState<'single' | 'period'>('single');

  const [periodPreset, setPeriodPreset] = useState<ReviewWindowPreset>('7d');

  const [periodWindow, setPeriodWindow] = useState<ReviewWindow>(() => latestWindow('7d'));

  const [periodTradesOverride, setPeriodTradesOverride] = useState<ReviewTrade[] | null>(null);

  const [singleResult, setSingleResult] = useState<DeterministicJournalReviewResult | null>(null);

  const [periodResult, setPeriodResult] = useState<Omit<BehaviorReviewResult, 'aiRun'> | null>(
    null,
  );

  const [singleAiRun, setSingleAiRun] = useState<JournalReviewResult['aiRun']>(null);

  const [periodAiRun, setPeriodAiRun] = useState<BehaviorReviewResult['aiRun']>(null);

  useReviewAccountSelection(accounts, requestedReview, accountId, setAccountId);

  const selectedAccount = accounts.find((account) => account.id === accountId);

  const candidateParams = useMemo(
    () => ({
      accountId,
      mode: selectedAccount?.mode ?? requestedReview.mode,
      ...(symbolFilter.trim() ? { symbol: symbolFilter.trim() } : {}),
      limit: 100,
      ...(tab === 'period'
        ? { start: periodWindow.start, end: periodWindow.end }
        : {
            ...(singleStartDate ? { start: `${singleStartDate}T00:00:00.000Z` } : {}),
            ...(singleEndDate ? { end: `${singleEndDate}T23:59:59.999Z` } : {}),
          }),
    }),
    [
      accountId,
      periodWindow.end,
      periodWindow.start,
      requestedReview.mode,
      selectedAccount?.mode,
      singleEndDate,
      singleStartDate,
      symbolFilter,
      tab,
    ],
  );

  const candidateQuery = useReviewCandidatesQuery(
    candidateParams,
    Boolean(accountId && accountsReady && !accountsError),
  );

  const candidates = candidateQuery.data?.items ?? [];

  const periodCandidates = candidates.filter(
    (candidate) =>
      candidate.reviewObjectType === 'TRADE_CYCLE' &&
      candidate.statisticsEligible &&
      !candidate.stale &&
      candidate.pnl !== null,
  );

  useEffect(() => {
    if (selectedCandidate || !requestedReview.tradeId || candidates.length === 0) return;
    const target = candidates.find(
      (candidate) =>
        candidate.tradeId === requestedReview.tradeId &&
        candidate.reviewObjectType === requestedReview.reviewObjectType &&
        (requestedReview.reviewObjectType !== 'CLOSE_SLICE' ||
          candidate.closeSliceId === requestedReview.closeSliceId),
    );
    if (!target) return;
    setSelectedCandidate(target);
    setManualTrade(null);
    setEvidenceDraft({});
    setSingleResult(null);
    setSingleAiRun(null);
  }, [candidates, requestedReview, selectedCandidate]);

  const currentSingleTrade = useMemo(() => {
    if (manualTrade) return manualTrade;
    if (selectedCandidate) return toReviewTrade(selectedCandidate, evidenceDraft);
    return null;
  }, [evidenceDraft, manualTrade, selectedCandidate]);

  const periodTrades =
    periodTradesOverride ??
    periodCandidates.flatMap((candidate) => {
      const trade = toReviewTrade(candidate);
      return trade ? [trade] : [];
    });

  const periodWindowInvalid = periodWindow.start >= periodWindow.end;

  const singleWorkspaceVisible = Boolean(
    candidates.length > 0 || selectedCandidate || currentSingleTrade || manualOpen,
  );

  const {
    singleAnalysis,
    periodAnalysis,
    singleExplanation,
    periodExplanation,
    persistReviewSnapshot,
    startSingleReview,
    startPeriodReview,
    applyAdvancedJson,
  } = useJournalReviewActions({
    selectedCandidate,
    currentSingleTrade,
    periodTrades,
    periodWindowInvalid,
    periodWindow,
    advancedMode,
    setSingleAiRun,
    setSingleResult,
    setPeriodAiRun,
    setPeriodResult,
    setSelectedCandidate,
    setManualTrade,
    setEvidenceDraft,
    setManualOpen,
    setPeriodTradesOverride,
  });

  const resetReviewState = () => {
    setSelectedCandidate(null);
    setManualTrade(null);
    setEvidenceDraft({});
    setSingleResult(null);
    setPeriodResult(null);
    setSingleAiRun(null);
    setPeriodAiRun(null);
    setPeriodTradesOverride(null);
  };

  const selectAccount = (nextAccountId: string) => {
    if (nextAccountId === accountId) return;
    setAccountId(nextAccountId);
    setSymbolFilter('');
    setSingleStartDate('');
    setSingleEndDate('');
    resetReviewState();
  };

  const selectCandidate = (candidate: JournalReviewCandidate) => {
    setSelectedCandidate(candidate);
    setManualTrade(null);
    setEvidenceDraft({});
    setSingleResult(null);
    setSingleAiRun(null);
  };

  return {
    accounts,
    accountsPending,
    accountsError,
    onRetry,
    onNavigateAccounts,
    onNavigatePosition,
    tab,
    setTab,
    accountId,
    symbolFilter,
    setSymbolFilter,
    singleStartDate,
    setSingleStartDate,
    singleEndDate,
    setSingleEndDate,
    selectedCandidate,
    setSelectedCandidate,
    setManualTrade,
    evidenceDraft,
    setEvidenceDraft,
    evidenceOpen,
    setEvidenceOpen,
    manualOpen,
    setManualOpen,
    advancedOpen,
    setAdvancedOpen,
    advancedMode,
    setAdvancedMode,
    periodPreset,
    setPeriodPreset,
    periodWindow,
    setPeriodWindow,
    periodTradesOverride,
    setPeriodTradesOverride,
    singleResult,
    setSingleResult,
    periodResult,
    setPeriodResult,
    singleAiRun,
    setSingleAiRun,
    periodAiRun,
    setPeriodAiRun,
    candidateQuery,
    candidates,
    periodCandidates,
    currentSingleTrade,
    periodTrades,
    periodWindowInvalid,
    singleWorkspaceVisible,
    singleAnalysis,
    periodAnalysis,
    singleExplanation,
    periodExplanation,
    selectAccount,
    selectCandidate,
    persistReviewSnapshot,
    startSingleReview,
    startPeriodReview,
    applyAdvancedJson,
  };
}

export type JournalReviewWorkspace = ReturnType<typeof useJournalReview>;

function useRequestedReviewTarget(search: string) {
  const requestedReview = useMemo(() => {
    const params = new URLSearchParams(search);
    return {
      accountId: params.get('accountId'),
      tradeId: params.get('tradeId'),
      reviewObjectType: params.get('reviewObjectType'),
      closeSliceId: params.get('closeSliceId'),
      mode: params.get('mode') === 'shadow' ? ('shadow' as const) : ('actual' as const),
    };
  }, [search]);
  return requestedReview;
}

function useReviewAccountSelection(
  accounts: Account[],
  requestedReview: ReturnType<typeof useRequestedReviewTarget>,
  accountId: string,
  setAccountId: Dispatch<SetStateAction<string>>,
) {
  useEffect(() => {
    const requestedAccount = accounts.find(
      (account) =>
        account.id === requestedReview.accountId && account.mode === requestedReview.mode,
    );
    if (requestedAccount && accountId !== requestedAccount.id) {
      setAccountId(requestedAccount.id);
      return;
    }
    if (accountId && accounts.some((account) => account.id === accountId)) return;
    const nextAccount =
      requestedAccount ?? accounts.find((account) => account.active !== false) ?? accounts[0];
    setAccountId(nextAccount?.id ?? '');
  }, [accountId, accounts, requestedReview.accountId, requestedReview.mode]);
}
