import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '../shared/PageHeader.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { usePageRefresh } from '../shared/usePageRefresh.js';
import { researchKeys } from './research.queries.js';
import { aiKeys } from './ai.queries.js';
import { ResearchDetailSheet, ResearchReadingView } from './AiResearchDetailView.js';
import { AiRunList } from './AiRunList.js';
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
    newResearchOpen,
    initialQuestion,
    initialInstrument,
    listFallbackRef,
    searchInput,
    setSearchInput,
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
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => openNewResearch()}>
            新建研究
          </Button>
        </div>
          <AiRunList
            readView="scoped"
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
      </div>
      <ResearchDetailSheet
        {...detailViewProps}
        open={pageState.mode === 'drawer' && Boolean(pageState.selectedRunId)}
        onRead={() => updatePageState({ mode: 'reading' })}
      />
        <ResearchSubmissionSheet
          initialInstrument={initialInstrument}
          open={newResearchOpen}
          onOpenChange={changeNewResearchOpen}
          initialQuestion={initialQuestion}
          onCreated={(receipt) => handleCreated({ id: receipt.runId })}
        />
    </section>
  );
}
