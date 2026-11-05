import { researchComparisonChoices } from './research-comparison-display.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { debounce } from 'es-toolkit';
import { parseAiResearchPageState, serializeAiResearchPageState } from './ai.navigation.js';
import { findAiRun, resolveAiRunsLoadState, useAiCapabilitiesQuery } from './ai.queries.js';
import {
  useResearchReportsQuery,
  useResearchReportQuery,
  useResearchIdentity,
} from './research.queries.js';
import { useOptionalPortfolioMode } from '../portfolio/portfolio-mode-context.js';
import type { AiCapabilitiesResponse, AiRunRecord, AiRunResult } from './ai.types.js';
const uniqueRuns = (pages: Array<{ items: AiRunRecord[] }> | undefined) => {
  const runs = new Map<string, AiRunRecord>();
  for (const page of pages ?? []) {
    for (const run of page.items) runs.set(run.id, run);
  }
  return [...runs.values()];
};

const fresherRun = (listRun: AiRunRecord | null, detail: AiRunRecord | undefined) => {
  if (!detail) return listRun;
  if (!listRun) return detail;
  const listTime = new Date(listRun.updatedAt ?? listRun.createdAt).getTime();
  const detailTime = new Date(detail.updatedAt ?? detail.createdAt).getTime();
  return detailTime >= listTime ? detail : listRun;
};

const providerDisplay = (data: AiCapabilitiesResponse | undefined, isError: boolean) => {
  if (data?.canStart) {
    return { label: '服务已就绪', variant: 'outline' as const, action: null };
  }
  if (data?.providers.some((provider) => provider.state === 'error')) {
    return { label: '服务异常', variant: 'destructive' as const, action: '检查服务配置' };
  }
  if (data) {
    return { label: '服务未配置', variant: 'secondary' as const, action: '配置服务' };
  }
  if (isError) {
    return { label: '服务检查失败', variant: 'destructive' as const, action: '检查服务配置' };
  }
  return { label: '服务检查中', variant: 'secondary' as const, action: null };
};

const researchTitle = (selected: AiRunRecord | null, listed: AiRunRecord | null) =>
  selected?.question?.trim() || listed?.question?.trim() || '研究详情';

function useResearchPageSearch(
  search: string,
  scopeKey: string,
  onSearch: (value: string) => void,
) {
  const [input, setInput] = useState(search);
  const current = useRef({ scopeKey, onSearch });
  current.current = { scopeKey, onSearch };
  useEffect(() => setInput(search), [search, scopeKey]);
  useEffect(() => {
    const controller = new AbortController();
    const update = debounce(
      (value: string) => {
        if (current.current.scopeKey === scopeKey) current.current.onSearch(value.trim());
      },
      250,
      { signal: controller.signal },
    );
    if (input !== search) update(input);
    return () => controller.abort();
  }, [input, search, scopeKey]);
  return [input, setInput] as const;
}

export function useResearchWorkbench() {
  const owner = useResearchIdentity();
  const priorOwner = useRef(owner);
  const location = useLocation();
  const navigate = useNavigate();
  const pageState = useMemo(() => parseAiResearchPageState(location.search), [location.search]);
  const accountMode = useOptionalPortfolioMode()?.mode ?? 'actual';
  const historical = new URLSearchParams(location.search).get('history') === 'legacy';
  const [newResearchOpen, setNewResearchOpen] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState('');
  const [retryOfRunId, setRetryOfRunId] = useState<string | undefined>();
  const [navigationIds, setNavigationIds] = useState<string[]>([]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listFallbackRef = useRef<HTMLElement | null>(null);
  const listScrollRef = useRef(0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (priorOwner.current === owner) return;
    priorOwner.current = owner;
    setNewResearchOpen(false);
    setInitialQuestion('');
    setRetryOfRunId(undefined);
    setNavigationIds([]);
    void navigate('/ai-chat', { replace: true });
  }, [owner, navigate]);

  const updatePageState = (
    updates: Partial<typeof pageState>,
    options: { replace?: boolean; state?: unknown } = {},
  ) => {
    const next = { ...pageState, ...updates };
    const params = new URLSearchParams(serializeAiResearchPageState(next));
    if (historical) params.set('history', 'legacy');
    const search = params.toString();
    void navigate(
      { pathname: '/ai-chat', ...(search ? { search: `?${search}` } : {}) },
      { replace: options.replace ?? true, state: options.state ?? (location.state as unknown) },
    );
  };

  const [searchInput, setSearchInput] = useResearchPageSearch(
    pageState.search,
    JSON.stringify([owner, accountMode, historical]),
    (value) => updatePageState({ search: value, selectedRunId: null, mode: 'list' }),
  );

  const listFilter = useMemo(
    () => ({
      ...(historical
        ? { view: 'legacy' as const }
        : {
            view: 'scoped' as const,
            mode: accountMode,
            ...(['instrument', 'portfolio', 'account', 'position', 'strategy'].includes(
              pageState.source,
            )
              ? {
                  kind: pageState.source as
                    'instrument' | 'portfolio' | 'account' | 'position' | 'strategy',
                }
              : {}),
          }),
      ...(pageState.status === 'all' ? {} : { status: pageState.status }),
      ...(pageState.search ? { search: pageState.search } : {}),
    }),
    [
      pageState.includeInternal,
      pageState.search,
      pageState.sort,
      pageState.source,
      pageState.status,
      historical,
      accountMode,
    ],
  );
  const runsQuery = useResearchReportsQuery(listFilter);
  const detailQuery = useResearchReportQuery(
    pageState.selectedRunId,
    listFilter.view === 'legacy'
      ? { view: 'legacy' }
      : {
          view: 'scoped',
          mode: accountMode,
          ...(listFilter.kind ? { kind: listFilter.kind } : {}),
        },
  );
  const capabilitiesQuery = useAiCapabilitiesQuery();
  const runs = useMemo(() => uniqueRuns(runsQuery.data?.pages), [runsQuery.data?.pages]);
  const selectedFromList = findAiRun(runs, pageState.selectedRunId);
  const selectedRun = detailQuery.isError
    ? selectedFromList
    : fresherRun(selectedFromList, detailQuery.data);
  const toolCalls: [] = [];
  const loadState = resolveAiRunsLoadState({
    isPending: runsQuery.isPending,
    isError: runsQuery.isError,
    isSuccess: runsQuery.isSuccess,
    hasRuns: runs.length > 0,
  });

  const selectedIndex = pageState.selectedRunId
    ? navigationIds.indexOf(pageState.selectedRunId)
    : -1;
  const previousId = selectedIndex > 0 ? navigationIds[selectedIndex - 1] : undefined;
  const nextId = selectedIndex >= 0 ? navigationIds[selectedIndex + 1] : undefined;

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [pageState.selectedRunId]);

  useEffect(() => {
    if (pageState.selectedRunId) return;
    window.scrollTo({ top: listScrollRef.current });
    const trigger = triggerRef.current;
    const focusTimer = window.setTimeout(() => (trigger ?? listFallbackRef.current)?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [pageState.selectedRunId]);

  const openRun = (id: string, trigger?: HTMLButtonElement, ids = runs.map((run) => run.id)) => {
    setNavigationIds(ids);
    triggerRef.current = trigger ?? null;
    listScrollRef.current = window.scrollY;
    updatePageState(
      { selectedRunId: id, mode: 'drawer' },
      { replace: false, state: { ...(location.state ?? {}), aiListOrigin: true } },
    );
  };

  const switchRun = (id: string) => updatePageState({ selectedRunId: id, mode: pageState.mode });

  const closeDetail = () => {
    const state = location.state as { aiListOrigin?: boolean } | null;
    if (state?.aiListOrigin) {
      void navigate(-1);
      return;
    }
    updatePageState({ selectedRunId: null, mode: 'list' });
  };

  const openNewResearch = (question = '', retryId?: string) => {
    const openForm = () => {
      setInitialQuestion(question);
      setRetryOfRunId(retryId);
      setNewResearchOpen(true);
    };
    if (pageState.selectedRunId) {
      closeDetail();
      requestAnimationFrame(openForm);
      return;
    }
    openForm();
  };

  const handleCreated = (run: Pick<AiRunResult, 'id'>, view: 'legacy' | 'scoped') => {
    setNewResearchOpen(false);
    setRetryOfRunId(undefined);
    void runsQuery.refetch();
    setNavigationIds([]);
    requestAnimationFrame(
      () =>
        void navigate({
          pathname: '/ai-chat',
          search: `?run=${encodeURIComponent(run.id)}&mode=drawer${view === 'legacy' ? '&history=legacy' : ''}`,
        }),
    );
  };
  const changeNewResearchOpen = (open: boolean) => {
    setNewResearchOpen(open);
    if (!open) {
      setInitialQuestion('');
      setRetryOfRunId(undefined);
    }
  };

  const provider = providerDisplay(capabilitiesQuery.data, capabilitiesQuery.isError);
  const detailTitle = researchTitle(selectedRun, selectedFromList);
  const detailViewProps = {
    selectedRun,
    detailTitle,
    detailPending: detailQuery.isPending,
    detailError: detailQuery.isError,
    toolCalls,
    navigationIds,
    comparisonChoices: researchComparisonChoices(runs),
    comparisonContextKey: JSON.stringify(listFilter),
    selectedIndex,
    ...(previousId ? { previousId } : {}),
    ...(nextId ? { nextId } : {}),
    contentRef,
    onClose: closeDetail,
    onSwitch: switchRun,
    onRetry: (run: AiRunRecord) =>
      openNewResearch(
        run.question ?? '',
        run.savedReport?.historicalScope.status === 'known' ? undefined : run.id,
      ),
    onOpenSource: (href: string) => void navigate(href),
    ...(!historical && pageState.selectedRunId
      ? {
          onLegacy: () =>
            void navigate({
              pathname: '/ai-chat',
              search: `?history=legacy&run=${encodeURIComponent(pageState.selectedRunId!)}&mode=drawer`,
            }),
        }
      : {}),
  };

  return {
    navigate,
    pageState,
    accountMode,
    historical,
    newResearchOpen,
    initialQuestion,
    retryOfRunId,
    listFallbackRef,
    searchInput,
    setSearchInput,
    setNavigationIds,
    runsQuery,
    runs,
    loadState,
    provider,
    detailViewProps,
    openNewResearch,
    openRun,
    updatePageState,
    handleCreated,
    changeNewResearchOpen,
  };
}
