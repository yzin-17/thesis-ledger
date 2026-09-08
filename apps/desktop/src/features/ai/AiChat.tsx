import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '../shared/PageHeader.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { NewResearchSheet } from './NewResearchSheet.js';
import { AiRunDetail } from './AiRunDetail.js';
import { AiRunList } from './AiRunList.js';
import { EvidenceChainSheet } from './EvidenceChainSheet.js';
import {
  findAiRun,
  resolveAiRunsLoadState,
  useAiCapabilitiesQuery,
  useAiRunQuery,
  useAiRunsQuery,
  useAiToolCallsQuery,
} from './ai.queries.js';
import type { AiRunFilterStatus, AiRunRecord, AiRunResult, AiToolCall } from './ai.types.js';

function AiRunsUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <Empty className="min-h-[28rem] rounded-md border bg-card p-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertTriangle aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>暂时无法读取研究任务</EmptyTitle>
        <EmptyDescription>已有研究不会受到影响，请稍后重新加载。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="outline" onClick={onRetry}>
          重新加载
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function AiChat() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<AiRunFilterStatus>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newResearchOpen, setNewResearchOpen] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState('');
  const [retryOfRunId, setRetryOfRunId] = useState<string | undefined>();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loadedRuns, setLoadedRuns] = useState<AiRunRecord[]>([]);
  const [toolCursor, setToolCursor] = useState<string | undefined>();
  const [loadedToolCalls, setLoadedToolCalls] = useState<AiToolCall[]>([]);
  const listFilter = {
    ...(filter === 'all' ? {} : { status: filter }),
    ...(cursor ? { cursor } : {}),
  };
  const runsQuery = useAiRunsQuery(listFilter);
  const detailQuery = useAiRunQuery(selectedId);
  const capabilitiesQuery = useAiCapabilitiesQuery();
  const toolCallsQuery = useAiToolCallsQuery(
    selectedId,
    evidenceOpen,
    toolCursor ? { cursor: toolCursor } : {},
  );
  const runsPage = runsQuery.data;
  const runs = loadedRuns;
  const selectedFromList = findAiRun(runs, selectedId);
  const selectedRun = detailQuery.data ?? selectedFromList;
  const loadState = resolveAiRunsLoadState({
    isPending: runsQuery.isPending,
    isError: runsQuery.isError,
    isSuccess: runsQuery.isSuccess,
    hasRuns: runs.length > 0,
  });

  useEffect(() => {
    setLoadedRuns([]);
    setCursor(undefined);
  }, [filter]);

  useEffect(() => {
    if (!runsPage) return;
    setLoadedRuns((previous) => {
      if (!cursor) return runsPage.items;
      const merged = new Map(previous.map((run) => [run.id, run]));
      for (const run of runsPage.items) merged.set(run.id, run);
      return [...merged.values()];
    });
  }, [cursor, runsPage]);

  useEffect(() => {
    setLoadedToolCalls([]);
    setToolCursor(undefined);
  }, [selectedId, evidenceOpen]);

  useEffect(() => {
    if (!toolCallsQuery.data) return;
    setLoadedToolCalls((previous) => {
      if (!toolCursor) return toolCallsQuery.data.items;
      const merged = new Map(
        previous.map((call) => [call.id ?? `${call.tool}-${call.createdAt}`, call]),
      );
      for (const call of toolCallsQuery.data.items)
        merged.set(call.id ?? `${call.tool}-${call.createdAt}`, call);
      return [...merged.values()];
    });
  }, [toolCallsQuery.data, toolCursor]);

  useEffect(() => {
    if (runs.length === 0) {
      setSelectedId(null);
      return;
    }
    const firstRun = runs[0];
    if (!firstRun) return;
    if (!selectedId || !runs.some((run) => run.id === selectedId)) setSelectedId(firstRun.id);
  }, [runs, selectedId]);

  const refresh = async () => {
    await runsQuery.refetch();
    if (selectedId) await detailQuery.refetch();
  };

  const openNewResearch = (question = '', retryId?: string) => {
    setInitialQuestion(question);
    setRetryOfRunId(retryId);
    setNewResearchOpen(true);
  };

  const handleCreated = (run: AiRunResult) => {
    setFilter('all');
    setCursor(undefined);
    setLoadedRuns([]);
    setSelectedId(run.id);
    setRetryOfRunId(undefined);
  };

  const detail = selectedRun && detailQuery.data?.id === selectedRun.id ? detailQuery.data : null;
  let providerLabel = 'Provider 检查中';
  let providerVariant: 'outline' | 'secondary' | 'destructive' = 'secondary';
  let providerActionLabel: string | null = null;
  if (capabilitiesQuery.data) {
    const hasError = capabilitiesQuery.data.providers.some(
      (provider) => provider.state === 'error',
    );
    if (capabilitiesQuery.data.canStart) {
      providerLabel = 'Provider 已就绪';
      providerVariant = 'outline';
    } else if (hasError) {
      providerLabel = 'Provider 异常';
      providerVariant = 'destructive';
      providerActionLabel = '检查 Provider';
    } else {
      providerLabel = 'Provider 未配置';
      providerActionLabel = '配置 Provider';
    }
  } else if (capabilitiesQuery.isError) {
    providerLabel = 'Provider 检查失败';
    providerVariant = 'destructive';
    providerActionLabel = '检查 Provider';
  }
  const showInitialEmpty = filter === 'all' && loadState === 'empty';
  const showWorkspaceError = filter === 'all' && loadState === 'error';
  const showHeaderCreate = runs.length > 0 || filter !== 'all' || loadState === 'error';

  return (
    <section className="module-page flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        eyebrow="RESEARCH ASSISTANT"
        title="研究助手"
        description="围绕投资问题展开研究，结论保留来源与数据缺口。"
        actions={
          <>
            <RefreshIconButton
              label="刷新研究任务与当前详情"
              refreshing={runsQuery.isFetching || detailQuery.isFetching}
              onClick={() => void refresh()}
            />
            {showHeaderCreate && (
              <Button type="button" size="sm" onClick={() => openNewResearch()}>
                新建研究
              </Button>
            )}
          </>
        }
      />
      <div data-ai-provider-status className="-mt-2 flex flex-wrap items-center gap-2">
        <Badge variant={providerVariant}>{providerLabel}</Badge>
        {providerActionLabel && (
          <Button type="button" size="sm" onClick={() => void navigate('/providers')}>
            {providerActionLabel}
          </Button>
        )}
      </div>
      {showWorkspaceError ? (
        <AiRunsUnavailable onRetry={() => void runsQuery.refetch()} />
      ) : showInitialEmpty ? (
        <AiRunDetail
          run={null}
          detail={null}
          isLoading={false}
          detailError={false}
          onEvidence={() => setEvidenceOpen(true)}
          onRetry={(run) => openNewResearch(run.question ?? '', run.id)}
          onDetailRetry={() => void detailQuery.refetch()}
          onCreate={openNewResearch}
        />
      ) : (
        <div className="grid gap-5 lg:min-h-[32rem] lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)]">
          <AiRunList
            runs={runs}
            selectedId={selectedId}
            filter={filter}
            loadState={loadState}
            onFilterChange={setFilter}
            onSelect={setSelectedId}
            onRefresh={() => void refresh()}
            hasMore={Boolean(runsPage?.hasMore)}
            onLoadMore={() => {
              if (runsPage?.nextCursor) setCursor(runsPage.nextCursor);
            }}
            isLoadingMore={runsQuery.isFetching && Boolean(cursor)}
          />
          <AiRunDetail
            run={selectedRun}
            detail={detail}
            isLoading={loadState === 'loading' || (Boolean(selectedId) && detailQuery.isPending)}
            detailError={detailQuery.isError}
            onEvidence={() => setEvidenceOpen(true)}
            onRetry={(run) => openNewResearch(run.question ?? '', run.id)}
            onDetailRetry={() => void detailQuery.refetch()}
            onCreate={openNewResearch}
            emptyState={filter === 'all' ? 'first-run' : 'filtered'}
          />
        </div>
      )}
      {selectedRun && (
        <EvidenceChainSheet
          open={evidenceOpen}
          onOpenChange={setEvidenceOpen}
          evidence={selectedRun.result?.evidence ?? []}
          toolCalls={loadedToolCalls}
          toolCallsLoading={toolCallsQuery.isPending}
          toolCallsError={toolCallsQuery.isError}
          toolCallsHasMore={Boolean(toolCallsQuery.data?.hasMore)}
          onLoadMoreToolCalls={() => {
            if (toolCallsQuery.data?.nextCursor) setToolCursor(toolCallsQuery.data.nextCursor);
          }}
          toolCallsLoadingMore={toolCallsQuery.isFetching && Boolean(toolCursor)}
        />
      )}
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
