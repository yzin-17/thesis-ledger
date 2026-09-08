import { PageHeader } from '../shared/PageHeader.js';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToastManager } from '@/components/ui/toast';
import type { LoadState } from '../shared/types.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import {
  useCancelBacktestMutation,
  useCreateStrategyMutation,
  useCreateStrategyVersionMutation,
  useFetchStrategyBarsMutation,
  useQueueBacktestMutation,
  useRunBacktestMutation,
} from './strategy.mutations.js';
import { createStrategyActionHandlers } from './strategy.actions.js';
import { useStrategyQueries } from './strategy.queries.js';
import { StrategyEditorSheet } from './StrategyEditorSheet.js';
import {
  BacktestSetupDialog,
  StrategyJobs,
  StrategyLibrary,
  StrategyResultDialog,
} from './StrategySections.js';
import type {
  BacktestJob,
  BacktestSetupInput,
  StrategyRecord,
  StrategySchema,
  StrategyVersion,
} from './strategy.types.js';

type EditorSelection = {
  mode: 'create' | 'edit';
  strategy: StrategyRecord | null;
  version: StrategyVersion | null;
};
type BacktestSelection = { strategy: StrategyRecord; version: StrategyVersion };

export function StrategyDashboard() {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('library');
  const [editorSelection, setEditorSelection] = useState<EditorSelection | null>(null);
  const [backtestSelection, setBacktestSelection] = useState<BacktestSelection | null>(null);
  const [resultJob, setResultJob] = useState<BacktestJob | null>(null);
  const toastManager = useToastManager();
  const { strategies: strategiesQuery, jobs: jobsQuery } = useStrategyQueries();
  const createMutation = useCreateStrategyMutation();
  const createVersionMutation = useCreateStrategyVersionMutation();
  const queueMutation = useQueueBacktestMutation();
  const fetchBarsMutation = useFetchStrategyBarsMutation();
  const runMutation = useRunBacktestMutation();
  const cancelMutation = useCancelBacktestMutation();
  const strategies: StrategyRecord[] = strategiesQuery.data ?? [];
  const jobs: BacktestJob[] = jobsQuery.data ?? [];
  const strategyRefreshing = strategiesQuery.isFetching || jobsQuery.isFetching;
  let loadState: LoadState = 'loading';
  if (strategiesQuery.isError || jobsQuery.isError) {
    loadState = strategies.length || jobs.length ? 'stale' : 'error';
  } else if (strategiesQuery.isSuccess && jobsQuery.isSuccess) {
    loadState = 'ready';
  }
  const load = async () => {
    await Promise.all([strategiesQuery.refetch(), jobsQuery.refetch()]);
  };
  const actions = createStrategyActionHandlers({
    name: '',
    schemaText: '',
    busyAction,
    setBusyAction,
    toastManager,
    createMutation,
    createVersionMutation,
    fetchBarsMutation,
    queueMutation,
    runMutation,
    cancelMutation,
    load,
  });

  const saveSchema = async (schema: StrategySchema) => {
    if (!editorSelection) return;
    let succeeded = false;
    if (editorSelection.mode === 'edit' && editorSelection.strategy) {
      succeeded = await actions.createVersion(editorSelection.strategy.id, schema);
    } else {
      const name = typeof schema.name === 'string' ? schema.name : '未命名策略';
      succeeded = await actions.createStrategy({ name, schema });
    }
    if (succeeded) setEditorSelection(null);
  };

  const startBacktest = async (setup: BacktestSetupInput) => {
    if (!backtestSelection) return false;
    const succeeded = await actions.startBacktest(backtestSelection.version, setup);
    if (succeeded) setActiveTab('jobs');
    return succeeded;
  };

  const selectedJob = resultJob ? (jobs.find((job) => job.id === resultJob.id) ?? resultJob) : null;
  const selectedStrategy = selectedJob
    ? strategies.find((candidate) =>
        candidate.versions.some(
          (candidateVersion) => candidateVersion.id === selectedJob.strategyVersionId,
        ),
      )
    : null;
  const selectedVersion = selectedStrategy?.versions.find(
    (candidate) => candidate.id === selectedJob?.strategyVersionId,
  );
  return (
    <section className="module-page">
      <PageHeader
        eyebrow="STRATEGY LAB"
        title="策略实验"
        description="创建投资策略，通过历史回测评估表现。"
        actions={
          <RefreshIconButton
            label="刷新策略与回测任务"
            refreshing={strategyRefreshing}
            onClick={() => void load()}
          />
        }
      />
      <DataStateBanner state={loadState} onRetry={() => void load()} />
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="library">策略库</TabsTrigger>
          <TabsTrigger value="jobs">
            回测任务{jobs.length > 0 ? ` (${jobs.length})` : ''}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="library" className="mt-0">
          <StrategyLibrary
            strategies={strategies}
            jobs={jobs}
            loadState={loadState}
            busyAction={busyAction}
            onCreate={() => setEditorSelection({ mode: 'create', strategy: null, version: null })}
            onEdit={(strategy, version) => setEditorSelection({ mode: 'edit', strategy, version })}
            onBacktest={(strategy, version) => setBacktestSelection({ strategy, version })}
          />
        </TabsContent>
        <TabsContent value="jobs" className="mt-0">
          <StrategyJobs
            jobs={jobs}
            strategies={strategies}
            loadState={loadState}
            busyAction={busyAction}
            onRun={(jobId) => void actions.run(jobId)}
            onCancel={(jobId) => void actions.cancel(jobId)}
            onViewResult={setResultJob}
            onOpenLibrary={() => setActiveTab('library')}
          />
        </TabsContent>
      </Tabs>
      <StrategyEditorSheet
        open={editorSelection !== null}
        mode={editorSelection?.mode ?? 'create'}
        strategy={editorSelection?.strategy ?? null}
        version={editorSelection?.version ?? null}
        busy={
          busyAction === 'create-strategy' ||
          (editorSelection?.strategy
            ? busyAction === `create-version:${editorSelection.strategy.id}`
            : false)
        }
        onOpenChange={(open) => {
          if (!open) setEditorSelection(null);
        }}
        onSave={(schema) => void saveSchema(schema)}
      />
      <BacktestSetupDialog
        open={backtestSelection !== null}
        strategy={backtestSelection?.strategy ?? null}
        version={backtestSelection?.version ?? null}
        busy={Boolean(busyAction?.startsWith('queue:'))}
        onOpenChange={(open) => {
          if (!open) setBacktestSelection(null);
        }}
        onSubmit={startBacktest}
      />
      <StrategyResultDialog
        job={selectedJob}
        strategy={selectedStrategy ?? null}
        version={selectedVersion ?? null}
        open={resultJob !== null}
        onOpenChange={(open) => {
          if (!open) setResultJob(null);
        }}
      />
    </section>
  );
}
