import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PageHeader } from '../shared/PageHeader.js';
import { ResearchDetailSheet, ResearchReadingView } from './AiResearchDetailView.js';
import { AiRunList } from './AiRunList.js';
import { NewResearchSheet } from './NewResearchSheet.js';
import { ResearchSubmissionSheet } from './ResearchSubmissionSheet.js';
import { useResearchWorkbench } from './use-research-workbench.js';

export function AiChat() {
  const {
    navigate,
    pageState,
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
  } = useResearchWorkbench();
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
      <ToggleGroup
        value={[historical ? 'legacy' : 'scoped']}
        aria-label="报告范围"
        onValueChange={(values) => {
          const next = values[0];
          if (!next) return;
          void navigate({
            pathname: '/ai-chat',
            search: next === 'legacy' ? '?history=legacy' : '',
          });
          setNavigationIds([]);
        }}
      >
        <ToggleGroupItem value="scoped">当前模式研究</ToggleGroupItem>
        <ToggleGroupItem value="legacy">历史报告</ToggleGroupItem>
      </ToggleGroup>
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
          open={newResearchOpen}
          onOpenChange={changeNewResearchOpen}
          initialQuestion={initialQuestion}
          onCreated={(receipt) => handleCreated({ id: receipt.runId }, 'scoped')}
        />
      )}
    </section>
  );
}
