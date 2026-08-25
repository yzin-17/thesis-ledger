import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
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

export function AiChat() {
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
    } else {
      providerLabel = 'Provider 未配置';
    }
  } else if (capabilitiesQuery.isError) {
    providerLabel = 'Provider 检查失败';
    providerVariant = 'destructive';
  }
  return (
    <section className="module-page flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1>研究助手</h1>
          <p className="page-description">基于已授权数据生成可追溯结论，不会修改账本或生成订单。</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">
          <Badge variant={providerVariant}>{providerLabel}</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={runsQuery.isFetching || detailQuery.isFetching}
          >
            <RefreshCw
              data-icon="inline-start"
              className={runsQuery.isFetching ? 'animate-spin' : undefined}
            />
            刷新
          </Button>
          <Button type="button" size="sm" onClick={() => openNewResearch()}>
            新建研究
          </Button>
        </div>
      </header>
      <div className="grid min-h-[34rem] gap-4 lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]">
        <AiRunList
          runs={runs}
          selectedId={selectedId}
          filter={filter}
          loadState={loadState}
          onFilterChange={setFilter}
          onSelect={setSelectedId}
          onRefresh={() => void refresh()}
          onCreate={() => openNewResearch()}
          hasMore={Boolean(runsPage?.hasMore)}
          onLoadMore={() => {
            if (runsPage?.nextCursor) setCursor(runsPage.nextCursor);
          }}
          isLoadingMore={runsQuery.isFetching && Boolean(cursor)}
        />
        <AiRunDetail
          run={selectedRun}
          detail={detail}
          isLoading={Boolean(selectedId) && detailQuery.isPending}
          detailError={detailQuery.isError}
          onEvidence={() => setEvidenceOpen(true)}
          onRetry={(run) => openNewResearch(run.question ?? '', run.id)}
          onDetailRetry={() => void detailQuery.refetch()}
          onCreate={() => openNewResearch()}
        />
      </div>
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
      {runsQuery.isError && runs.length > 0 && (
        <p className="text-xs text-muted-foreground" role="status">
          研究任务列表更新失败，保留最近一次成功数据。
          <button
            type="button"
            className="ml-1 underline underline-offset-4"
            onClick={() => void runsQuery.refetch()}
          >
            重试
          </button>
        </p>
      )}
    </section>
  );
}
