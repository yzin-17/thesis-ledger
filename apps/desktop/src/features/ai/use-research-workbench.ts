import { instrumentSearchResultSchema } from '@thesis-ledger/schemas';
import type { InstrumentLookup } from '../portfolio/portfolio.types.js';
import { researchComparisonChoices } from './research-comparison-display.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { debounce } from 'es-toolkit';
import { FILTER_DEBOUNCE_MS } from '@/lib/use-debounced-value';
import { parseAiResearchPageState, serializeAiResearchPageState } from './ai.navigation.js';
import { findAiRun, resolveAiRunsLoadState, useAiCapabilitiesQuery } from './ai.queries.js';
import {
  useResearchReportsQuery,
  useResearchReportQuery,
  useResearchIdentity,
} from './research.queries.js';
import { useOptionalPortfolioMode } from '../portfolio/portfolio-mode-context.js';
import type { AiCapabilitiesResponse, AiRunRecord, AiRunResult } from './ai.types.js';
const seedInstrument = instrumentSearchResultSchema.pick({
  id: true,
  symbol: true,
  canonicalCode: true,
  instrumentType: true,
  market: true,
  displayName: true,
  confirmable: true,
});
function readResearchSeed(state: unknown, owner: string) {
  if (!state || typeof state !== 'object' || !('instrumentResearch' in state)) return null;
  const seed = state.instrumentResearch;
  if (
    !seed ||
    typeof seed !== 'object' ||
    !('owner' in seed) ||
    seed.owner !== owner ||
    !('instrument' in seed)
  )
    return null;
  return seedInstrument.safeParse(seed.instrument).data;
}
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

const researchTitle = (selected: AiRunRecord | null, listed: AiRunRecord | null) => {
  const object = listed?.display?.object ?? selected?.display?.object;
  if (object?.name) return `${object.name} · ${object.label}`;
  if (object?.code) return `${object.code} · ${object.label}`;
  const question = selected?.question?.trim() || listed?.question?.trim();
  if (!question) return '研究详情';
  return question.length > 48 ? `${question.slice(0, 48)}…` : question;
};

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
      FILTER_DEBOUNCE_MS,
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
  const [newResearchOpen, setNewResearchOpen] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState('');
  const [initialInstrument, setInitialInstrument] = useState<InstrumentLookup | null>(null);
  useEffect(() => {
    const seed = readResearchSeed(location.state, owner);
    if (!seed) return;
    setInitialInstrument(seed);
    setInitialQuestion('');
    setNewResearchOpen(true);
    void navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, owner, navigate]);
  const [navigationIds, setNavigationIds] = useState<string[]>([]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listFallbackRef = useRef<HTMLElement | null>(null);
  const listScrollRef = useRef(0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (priorOwner.current === owner) return;
    priorOwner.current = owner;
    setInitialInstrument(null);
    setNewResearchOpen(false);
    setInitialQuestion('');
    setNavigationIds([]);
    void navigate('/ai-chat', { replace: true });
  }, [owner, navigate]);

  const updatePageState = (
    updates: Partial<typeof pageState>,
    options: { replace?: boolean; state?: unknown } = {},
  ) => {
    const next = { ...pageState, ...updates };
    const params = new URLSearchParams(serializeAiResearchPageState(next));
    const search = params.toString();
    void navigate(
      { pathname: '/ai-chat', ...(search ? { search: `?${search}` } : {}) },
      { replace: options.replace ?? true, state: options.state ?? (location.state as unknown) },
    );
  };

  const [searchInput, setSearchInput] = useResearchPageSearch(
    pageState.search,
    JSON.stringify([owner, accountMode]),
    (value) => updatePageState({ search: value, selectedRunId: null, mode: 'list' }),
  );

  const listFilter = useMemo(
    () => researchWorkbenchListFilter(pageState, accountMode),
    [
      pageState.includeInternal,
      pageState.search,
      pageState.sort,
      pageState.source,
      pageState.status,
      accountMode,
    ],
  );
  const runsQuery = useResearchReportsQuery(listFilter);
  const detailQuery = useResearchReportQuery(
    pageState.selectedRunId,
    {
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
    const state = location.state as {
      aiListOrigin?: boolean;
      instrumentDetailOrigin?: boolean;
    } | null;
    if (state?.aiListOrigin || state?.instrumentDetailOrigin) {
      void navigate(-1);
      return;
    }
    updatePageState({ selectedRunId: null, mode: 'list' });
  };

  const openNewResearch = (question = '') => {
    const openForm = () => {
      setInitialInstrument(null);
      setInitialQuestion(question);
      setNewResearchOpen(true);
    };
    if (pageState.selectedRunId) {
      closeDetail();
      requestAnimationFrame(openForm);
      return;
    }
    openForm();
  };

  const handleCreated = (run: Pick<AiRunResult, 'id'>) => {
    setNewResearchOpen(false);
    void runsQuery.refetch();
    setNavigationIds([]);
    requestAnimationFrame(
      () =>
        void navigate({
          pathname: '/ai-chat',
          search: `?run=${encodeURIComponent(run.id)}&mode=drawer`,
        }),
    );
  };
  const changeNewResearchOpen = (open: boolean) => {
    setNewResearchOpen(open);
    if (!open) {
      setInitialQuestion('');
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
    onRetry: (run: AiRunRecord) => openNewResearch(run.question ?? ''),
    onOpenSource: (href: string) => void navigate(href),
  };

  return {
    navigate,
    pageState,
    accountMode,
    initialInstrument,
    newResearchOpen,
    initialQuestion,
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

function researchWorkbenchListFilter(
  pageState: ReturnType<typeof parseAiResearchPageState>,
  accountMode: 'actual' | 'shadow',
) {
  return {
    view: 'scoped' as const,
    mode: accountMode,
    ...(['instrument', 'portfolio', 'account', 'position', 'strategy'].includes(pageState.source)
      ? { kind: pageState.source as 'instrument' | 'portfolio' | 'account' | 'position' | 'strategy' }
      : {}),
    ...(pageState.status === 'all' ? {} : { status: pageState.status }),
    ...(pageState.search ? { search: pageState.search } : {}),
  };
}
