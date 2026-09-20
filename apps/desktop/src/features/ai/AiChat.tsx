import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { debounce } from 'es-toolkit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '../shared/PageHeader.js';
import { ResearchDetailSheet, ResearchReadingView } from './AiResearchDetailView.js';
import { NewResearchSheet } from './NewResearchSheet.js';
import { AiRunList } from './AiRunList.js';
import { parseAiResearchPageState, serializeAiResearchPageState } from './ai.navigation.js';
import {
  findAiRun,
  resolveAiRunsLoadState,
  useAiCapabilitiesQuery,
  useAiRunQuery,
  useAiRunsQuery,
  useAiToolCallsQuery,
} from './ai.queries.js';
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

export function AiChat() {
  const location = useLocation();
  const navigate = useNavigate();
  const pageState = useMemo(() => parseAiResearchPageState(location.search), [location.search]);
  const [searchInput, setSearchInput] = useState(pageState.search);
  const [newResearchOpen, setNewResearchOpen] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState('');
  const [retryOfRunId, setRetryOfRunId] = useState<string | undefined>();
  const [navigationIds, setNavigationIds] = useState<string[]>([]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listFallbackRef = useRef<HTMLElement | null>(null);
  const listScrollRef = useRef(0);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const updatePageState = (
    updates: Partial<typeof pageState>,
    options: { replace?: boolean; state?: unknown } = {},
  ) => {
    const next = { ...pageState, ...updates };
    const search = serializeAiResearchPageState(next);
    void navigate(
      { pathname: '/ai-chat', ...(search ? { search: `?${search}` } : {}) },
      { replace: options.replace ?? true, state: options.state ?? (location.state as unknown) },
    );
  };

  useEffect(() => setSearchInput(pageState.search), [pageState.search]);

  useEffect(() => {
    const controller = new AbortController();
    const updateSearch = debounce(
      (value: string) =>
        updatePageState({ search: value.trim(), selectedRunId: null, mode: 'list' }),
      250,
      { signal: controller.signal },
    );
    if (searchInput !== pageState.search) updateSearch(searchInput);
    return () => controller.abort();
  }, [searchInput, pageState.search]);

  const listFilter = useMemo(
    () => ({
      view: 'research' as const,
      ...(pageState.status === 'all' ? {} : { status: pageState.status }),
      ...(pageState.source === 'all' ? {} : { source: pageState.source }),
      ...(pageState.search ? { search: pageState.search } : {}),
      includeInternal: pageState.includeInternal,
      sort: pageState.sort,
    }),
    [
      pageState.includeInternal,
      pageState.search,
      pageState.sort,
      pageState.source,
      pageState.status,
    ],
  );
  const runsQuery = useAiRunsQuery(listFilter);
  const detailQuery = useAiRunQuery(pageState.selectedRunId);
  const toolCallsQuery = useAiToolCallsQuery(
    pageState.selectedRunId,
    Boolean(pageState.selectedRunId),
  );
  const capabilitiesQuery = useAiCapabilitiesQuery();
  const runs = useMemo(() => uniqueRuns(runsQuery.data?.pages), [runsQuery.data?.pages]);
  const selectedFromList = findAiRun(runs, pageState.selectedRunId);
  const selectedRun = fresherRun(selectedFromList, detailQuery.data);
  const toolCalls = toolCallsQuery.data?.items ?? [];
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

  const handleCreated = (run: AiRunResult) => {
    setNewResearchOpen(false);
    setRetryOfRunId(undefined);
    void runsQuery.refetch();
    requestAnimationFrame(() => openRun(run.id, undefined, []));
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
    selectedIndex,
    ...(previousId ? { previousId } : {}),
    ...(nextId ? { nextId } : {}),
    contentRef,
    onClose: closeDetail,
    onSwitch: switchRun,
    onRetry: (run: AiRunRecord) => openNewResearch(run.question ?? '', run.id),
    onOpenSource: (href: string) => void navigate(href),
  };

  if (pageState.mode === 'reading' && pageState.selectedRunId) {
    return <ResearchReadingView {...detailViewProps} />;
  }

  return (
    <section
      ref={listFallbackRef}
      tabIndex={-1}
      className="module-page flex flex-col gap-4 focus:outline-none"
    >
      <PageHeader
        className="mb-0"
        eyebrow="RESEARCH ASSISTANT"
        title="研究助手"
        actions={
          <Button type="button" size="sm" onClick={() => openNewResearch()}>
            新建研究
          </Button>
        }
      />
      <div data-ai-provider-status className="flex flex-wrap items-center gap-2">
        <Badge variant={provider.variant}>{provider.label}</Badge>
        {provider.action && (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => void navigate('/providers')}
          >
            {provider.action}
          </Button>
        )}
      </div>
      <AiRunList
        runs={runs}
        selectedId={pageState.selectedRunId}
        status={pageState.status}
        source={pageState.source}
        includeInternal={pageState.includeInternal}
        search={searchInput}
        loadState={loadState}
        refreshing={runsQuery.isFetching && !runsQuery.isFetchingNextPage}
        onStatusChange={(status) => updatePageState({ status, selectedRunId: null, mode: 'list' })}
        onSourceChange={(source) => updatePageState({ source, selectedRunId: null, mode: 'list' })}
        onIncludeInternalChange={(includeInternal) =>
          updatePageState({ includeInternal, selectedRunId: null, mode: 'list' })
        }
        onSearchChange={setSearchInput}
        onSelect={(id, trigger) => openRun(id, trigger)}
        onOpenSource={(href) => void navigate(href)}
        onRefresh={() => void runsQuery.refetch()}
        onClearFilters={() => {
          setSearchInput('');
          updatePageState({
            search: '',
            status: 'all',
            source: 'all',
            includeInternal: false,
            selectedRunId: null,
            mode: 'list',
          });
        }}
        hasMore={runsQuery.hasNextPage}
        onLoadMore={() => void runsQuery.fetchNextPage()}
        isLoadingMore={runsQuery.isFetchingNextPage}
      />
      <ResearchDetailSheet
        {...detailViewProps}
        open={pageState.mode === 'drawer' && Boolean(pageState.selectedRunId)}
        onRead={() => updatePageState({ mode: 'reading' })}
      />
      <NewResearchSheet
        open={newResearchOpen}
        onOpenChange={(open) => {
          setNewResearchOpen(open);
          if (!open) {
            setInitialQuestion('');
            setRetryOfRunId(undefined);
          }
        }}
        initialQuestion={initialQuestion}
        retryOfRunId={retryOfRunId}
        onCreated={handleCreated}
      />
    </section>
  );
}
