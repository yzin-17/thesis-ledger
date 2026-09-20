import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import type { LoadState } from '../shared/types.js';
import {
  useCancelBacktestMutation,
  useCancelBacktestV2Mutation,
  useCreateStrategyMutation,
  useCreateStrategyVersionMutation,
  useFetchStrategyBarsMutation,
  useQueueBacktestMutation,
  useRetryBacktestV2Mutation,
  useRunBacktestMutation,
  useRunBacktestV2Mutation,
} from './strategy.mutations.js';
import { createStrategyActionHandlers } from './strategy.actions.js';
import { useStrategyQueries } from './strategy.queries.js';
import { useBacktestJobEvents } from './strategy.events.js';
import { useToastManager } from '@/components/ui/toast';
import { StrategyCenterLayout } from './StrategyCenterLayout.js';
import { StrategyEditorPage } from './StrategyEditorPage.js';
import { StrategyExperimentCreatePage } from './StrategyExperimentCreatePage.js';
import { StrategyExperimentDetailPage } from './StrategyExperimentDetailPage.js';
import { StrategyExperimentListPage } from './StrategyExperimentListPage.js';
import {
  StrategyLibraryPage,
  StrategyVersionPage,
  type StrategyVersionTabState,
} from './StrategyLibraryPages.js';
import { StrategyRiskApplicationPage } from './StrategyRiskApplicationPage.js';
import { BacktestSetupDialog } from './StrategySections.js';
import { StrategyBacktestJobsPage } from './StrategyBacktestJobsPage.js';
import { StrategyBacktestDetailPage } from './StrategyBacktestDetailPage.js';
import { StrategyCenterErrorBoundary } from './StrategyCenterErrorBoundary.js';
import {
  legacyStrategyDestination,
  strategyCenterPath,
  strategyCenterTabForPath,
  type StrategyCenterTab,
} from './strategy-center.navigation.js';
import type {
  BacktestJobSummary,
  BacktestSetupInput,
  StrategyRecord,
  StrategyVersion,
} from './strategy.types.js';

type BacktestSelection = {
  strategy: StrategyRecord;
  version: StrategyVersion;
  initialSetup?: BacktestSetupInput;
  intent?: 'new' | 'rerun';
};

function LegacyStrategyRedirect() {
  const location = useLocation();
  return <Navigate to={legacyStrategyDestination(location.search)} replace />;
}

function StrategyRiskApplicationRoute({
  strategies,
  loading,
  onBacktest,
  tabState,
  onTabChange,
}: {
  strategies: StrategyRecord[];
  loading: boolean;
  onBacktest: (strategy: StrategyRecord, version: StrategyVersion) => void;
  tabState: StrategyVersionTabState;
  onTabChange: (state: StrategyVersionTabState) => void;
}) {
  const { strategyId, versionId } = useParams();
  const sourceKey = `${strategyId ?? ''}:${versionId ?? ''}`;
  return (
    <>
      <StrategyVersionPage
        strategies={strategies}
        loading={loading}
        onBacktest={onBacktest}
        tabState={tabState}
        onTabChange={onTabChange}
      />
      <StrategyRiskApplicationPage key={sourceKey} strategies={strategies} presentation="drawer" />
    </>
  );
}

function StrategyEditorRoute({
  strategies,
  loading,
  onBacktest,
  tabState,
  onTabChange,
}: {
  strategies: StrategyRecord[];
  loading: boolean;
  onBacktest: (strategy: StrategyRecord, version: StrategyVersion) => void;
  tabState: StrategyVersionTabState;
  onTabChange: (state: StrategyVersionTabState) => void;
}) {
  const { strategyId, versionId } = useParams();
  const sourceKey = `${strategyId ?? ''}:${versionId ?? ''}`;
  return (
    <>
      <StrategyVersionPage
        strategies={strategies}
        loading={loading}
        onBacktest={onBacktest}
        tabState={tabState}
        onTabChange={onTabChange}
      />
      <StrategyEditorPage
        key={sourceKey}
        strategies={strategies}
        loading={loading}
        mode="edit"
        presentation="drawer"
      />
    </>
  );
}

export function StrategyDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const toastManager = useToastManager();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [backtestSelection, setBacktestSelection] = useState<BacktestSelection | null>(null);
  const [versionTabState, setVersionTabState] = useState<StrategyVersionTabState>({
    sourceKey: '',
    value: 'definition',
  });
  const [centerTab, setCenterTab] = useState<StrategyCenterTab>(() =>
    strategyCenterTabForPath(location.pathname),
  );
  useEffect(() => {
    setCenterTab(strategyCenterTabForPath(location.pathname));
  }, [location.pathname]);
  const { strategies: strategiesQuery, jobs: jobsQuery } = useStrategyQueries();
  useBacktestJobEvents();
  const createMutation = useCreateStrategyMutation();
  const createVersionMutation = useCreateStrategyVersionMutation();
  const queueMutation = useQueueBacktestMutation();
  const fetchBarsMutation = useFetchStrategyBarsMutation();
  const runMutation = useRunBacktestMutation();
  const cancelMutation = useCancelBacktestMutation();
  const runV2Mutation = useRunBacktestV2Mutation();
  const cancelV2Mutation = useCancelBacktestV2Mutation();
  const retryV2Mutation = useRetryBacktestV2Mutation();
  const strategies: StrategyRecord[] = strategiesQuery.data ?? [];
  const jobs: BacktestJobSummary[] = jobsQuery.data ?? [];
  let loadState: LoadState = 'loading';
  if (strategiesQuery.isError || jobsQuery.isError)
    loadState = strategies.length || jobs.length ? 'stale' : 'error';
  else if (strategiesQuery.isSuccess && jobsQuery.isSuccess) loadState = 'ready';
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
    runV2Mutation,
    cancelV2Mutation,
    retryV2Mutation,
    onJobQueued: (job) => void navigate(strategyCenterPath.job(job.id)),
    load,
  });
  const startBacktest = async (setup: BacktestSetupInput) => {
    if (!backtestSelection) return false;
    const succeeded = await actions.startBacktest(backtestSelection.version, setup);
    return succeeded;
  };
  const refreshing = strategiesQuery.isFetching || jobsQuery.isFetching;

  return (
    <StrategyCenterLayout
      value={centerTab}
      onValueChange={setCenterTab}
      actions={
        <RefreshIconButton
          label="刷新策略中心"
          refreshing={refreshing}
          onClick={() => void load()}
        />
      }
    >
      <StrategyCenterErrorBoundary>
        <DataStateBanner state={loadState} onRetry={() => void load()} />
        <Routes>
          <Route index element={<LegacyStrategyRedirect />} />
          <Route
            path="library"
            element={
              <StrategyLibraryPage
                strategies={strategies}
                jobs={jobs}
                loading={strategiesQuery.isPending}
                onBacktest={(strategy, version) => setBacktestSelection({ strategy, version })}
              />
            }
          />
          <Route
            path="library/new"
            element={
              <StrategyEditorPage
                strategies={strategies}
                loading={strategiesQuery.isPending}
                mode="create"
              />
            }
          />
          <Route
            path="library/:strategyId/versions/:versionId"
            element={
              <StrategyVersionPage
                strategies={strategies}
                loading={strategiesQuery.isPending}
                onBacktest={(strategy, version) => setBacktestSelection({ strategy, version })}
                tabState={versionTabState}
                onTabChange={setVersionTabState}
              />
            }
          />
          <Route
            path="library/:strategyId/versions/:versionId/edit"
            element={
              <StrategyEditorRoute
                strategies={strategies}
                loading={strategiesQuery.isPending}
                onBacktest={(strategy, version) => setBacktestSelection({ strategy, version })}
                tabState={versionTabState}
                onTabChange={setVersionTabState}
              />
            }
          />
          <Route
            path="library/:strategyId/versions/:versionId/risk-application"
            element={
              <StrategyRiskApplicationRoute
                strategies={strategies}
                loading={strategiesQuery.isPending}
                onBacktest={(strategy, version) => setBacktestSelection({ strategy, version })}
                tabState={versionTabState}
                onTabChange={setVersionTabState}
              />
            }
          />
          <Route path="jobs" element={<StrategyBacktestJobsPage strategies={strategies} />} />
          <Route
            path="jobs/:jobId"
            element={
              <StrategyBacktestDetailPage
                strategies={strategies}
                strategiesLoading={strategiesQuery.isPending}
                busyAction={busyAction}
                onRun={(job) => void actions.run(job.id, job.mode)}
                onCancel={(job) => void actions.cancel(job.id, job.mode)}
                onRetry={(job) => void actions.retry(job.id)}
                onRerun={({ strategy, version, setup }) =>
                  setBacktestSelection({ strategy, version, initialSetup: setup, intent: 'rerun' })
                }
                onSourceTabChange={setCenterTab}
              />
            }
          />
          <Route path="experiments" element={<StrategyExperimentListPage />} />
          <Route
            path="experiments/new"
            element={<StrategyExperimentCreatePage strategies={strategies} />}
          />
          <Route
            path="experiments/:experimentId"
            element={<StrategyExperimentDetailPage strategies={strategies} />}
          />
          <Route path="*" element={<Navigate to={strategyCenterPath.library} replace />} />
        </Routes>
      </StrategyCenterErrorBoundary>
      <BacktestSetupDialog
        open={backtestSelection !== null}
        strategy={backtestSelection?.strategy ?? null}
        version={backtestSelection?.version ?? null}
        busy={Boolean(busyAction?.startsWith('queue:'))}
        initialSetup={backtestSelection?.initialSetup ?? null}
        intent={backtestSelection?.intent ?? 'new'}
        onOpenChange={(open) => {
          if (!open) setBacktestSelection(null);
        }}
        onSubmit={startBacktest}
      />
    </StrategyCenterLayout>
  );
}
