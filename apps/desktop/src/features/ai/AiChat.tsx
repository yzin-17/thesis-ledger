import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '../shared/PageHeader.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { usePageRefresh } from '../shared/usePageRefresh.js';
import { researchKeys } from './research.queries.js';
import { aiKeys } from './ai.queries.js';
import { ResearchDetailSheet, ResearchReadingView } from './AiResearchDetailView.js';
import { AiRunList } from './AiRunList.js';
import { NewResearchSheet } from './NewResearchSheet.js';
import { ResearchSubmissionSheet } from './ResearchSubmissionSheet.js';
import { useResearchWorkbench } from './use-research-workbench.js';

export function AiChat() {
  const { refreshing, refresh } = usePageRefresh([
    { queryKey: researchKeys.root },
    { queryKey: aiKeys.capabilities(), exact: true },
  ]);
  const {
    navigate,
    pageState,
    historical,
    newResearchOpen,
    initialQuestion,
    initialInstrument,
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
  } = useResearchWorkbench();
  if (pageState.mode === 'reading' && pageState.selectedRunId) {
    return <ResearchReadingView {...detailViewProps} />;
  }

  return (
    <section
      ref={listFallbackRef}
      tabIndex={-1}
      className="module-page flex flex-col gap-card focus:outline-none"
    >
      <PageHeader
        eyebrow="RESEARCH ASSISTANT"
        title="研究助手"
        actions={
          <RefreshIconButton
            label="刷新研究列表"
            refreshing={refreshing}
            onClick={() => void refresh()}
          />
        }
      />
      {provider.label !== '服务已就绪' && (
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
      )}
      <Tabs
        value={historical ? 'legacy' : 'scoped'}
        onValueChange={(value) => {
          if (value !== 'scoped' && value !== 'legacy') return;
          void navigate({
            pathname: '/ai-chat',
            search: value === 'legacy' ? '?history=legacy' : '',
          });
          setNavigationIds([]);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList variant="line" aria-label="报告范围" className="w-auto min-w-0 max-w-full">
            <TabsTrigger value="scoped">当前模式研究</TabsTrigger>
            <TabsTrigger value="legacy">历史报告</TabsTrigger>
          </TabsList>
          <Button type="button" size="sm" className="ml-auto shrink-0" onClick={() => openNewResearch()}>
            新建研究
          </Button>
        </div>
        <TabsContent
          value={historical ? 'legacy' : 'scoped'}
          className="flex min-w-0 flex-col gap-3"
        >
          {historical && (
            <p className="text-sm text-muted-foreground">
              历史范围未记录，旧报告按原权限读取，不归入当前账户模式。
            </p>
          )}
          <AiRunList
            readView={historical ? 'legacy' : 'scoped'}
            runs={runs}
            selectedId={pageState.selectedRunId}
            status={pageState.status}
            source={pageState.source}
            includeInternal={pageState.includeInternal}
            search={searchInput}
            loadState={loadState}
            refreshing={runsQuery.isFetching && !runsQuery.isFetchingNextPage}
            onStatusChange={(status) =>
              updatePageState({ status, selectedRunId: null, mode: 'list' })
            }
            onSourceChange={(source) =>
              updatePageState({ source, selectedRunId: null, mode: 'list' })
            }
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
        </TabsContent>
      </Tabs>
      <ResearchDetailSheet
        {...detailViewProps}
        open={pageState.mode === 'drawer' && Boolean(pageState.selectedRunId)}
        onRead={() => updatePageState({ mode: 'reading' })}
      />
      {retryOfRunId ? (
        <NewResearchSheet
          open={newResearchOpen}
          onOpenChange={changeNewResearchOpen}
          initialQuestion={initialQuestion}
          retryOfRunId={retryOfRunId}
          onCreated={(run) => handleCreated(run, 'legacy')}
        />
      ) : (
        <ResearchSubmissionSheet
          initialInstrument={initialInstrument}
          open={newResearchOpen}
          onOpenChange={changeNewResearchOpen}
          initialQuestion={initialQuestion}
          onCreated={(receipt) => handleCreated({ id: receipt.runId }, 'scoped')}
        />
      )}
    </section>
  );
}
