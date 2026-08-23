import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToastManager } from '@/components/ui/toast';

import type { LoadState } from '../shared/types.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import {
  useCancelBacktestMutation,
  useCreateStrategyMutation,
  useFetchStrategyBarsMutation,
  useQueueBacktestMutation,
  useRunBacktestMutation,
} from './strategy.mutations.js';
import { useStrategyQueries } from './strategy.queries.js';
import { createStrategyActionHandlers } from './strategy.actions.js';
import {
  StrategyEditor,
  StrategyJobs,
  StrategyResult,
  StrategyVersions,
} from './StrategySections.js';
import type { BacktestJob, StrategyRecord } from './strategy.types.js';

const defaultStrategySchema = {
  version: 1,
  name: '我的第一条策略',
  universe: { symbols: ['600519.SH'], asOf: new Date().toISOString() },
  entrySignals: [{ indicator: 'close', operator: 'gt', value: 10 }],
  exitSignals: [{ indicator: 'close', operator: 'lt', value: 9 }],
  stopLoss: { type: 'fixed', value: 0.1 },
  sizing: { type: 'weight', value: 0.5 },
  execution: { price: 'close', tPlusOne: true, lotSize: 100 },
  cost: {
    commissionRate: 0.0003,
    minimumCommission: 5,
    stampDutyRate: 0.0005,
    slippageRate: 0.001,
  },
  riskConstraints: [],
  benchmark: '000300.SH',
};

export function StrategyDashboard() {
  const [name, setName] = useState('我的第一条策略');
  const [schemaText, setSchemaText] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const toastManager = useToastManager();
  const { strategies: strategiesQuery, jobs: jobsQuery } = useStrategyQueries();
  const createMutation = useCreateStrategyMutation();
  const queueMutation = useQueueBacktestMutation();
  const fetchBarsMutation = useFetchStrategyBarsMutation();
  const runMutation = useRunBacktestMutation();
  const cancelMutation = useCancelBacktestMutation();
  const strategies: StrategyRecord[] = strategiesQuery.data ?? [];
  const jobs: BacktestJob[] = jobsQuery.data ?? [];
  let loadState: LoadState = 'loading';
  if (strategiesQuery.isError || jobsQuery.isError) {
    loadState = strategies.length || jobs.length ? 'stale' : 'error';
  } else if (strategiesQuery.isSuccess && jobsQuery.isSuccess) {
    loadState = strategies.length === 0 && jobs.length === 0 ? 'empty' : 'ready';
  }
  useEffect(() => {
    if (!schemaText) setSchemaText(JSON.stringify(defaultStrategySchema, null, 2));
  }, [schemaText]);
  const load = async () => {
    await Promise.all([strategiesQuery.refetch(), jobsQuery.refetch()]);
  };
  const actions = createStrategyActionHandlers({
    name,
    schemaText,
    busyAction,
    setBusyAction,
    toastManager,
    createMutation,
    fetchBarsMutation,
    queueMutation,
    runMutation,
    cancelMutation,
    load,
  });

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  return (
    <section className="module-page">
      <p className="kicker">Strategy Lab</p>
      <h1>策略实验</h1>
      <p className="page-description">
        策略使用版本化 Schema 与可替换 Worker；回测结果保留数据时点、引擎版本、成本和已知偏差提示。
      </p>
      <Button className="secondary" type="button" variant="outline" onClick={() => void load()}>
        刷新策略任务
      </Button>
      <DataStateBanner state={loadState} onRetry={() => void load()} />
      <StrategyEditor
        name={name}
        schemaText={schemaText}
        busy={busyAction === 'create-strategy'}
        onNameChange={setName}
        onSchemaChange={setSchemaText}
        onSubmit={(event) => void actions.createStrategy(event)}
      />
      <StrategyVersions
        strategies={strategies}
        loadState={loadState}
        busyAction={busyAction}
        onQueue={(strategy) => void actions.queue(strategy)}
      />
      <StrategyJobs
        jobs={jobs}
        loadState={loadState}
        busyAction={busyAction}
        selectedJobId={selectedJobId}
        onSelect={setSelectedJobId}
        onRun={(jobId) => void actions.run(jobId)}
        onCancel={(jobId) => void actions.cancel(jobId)}
      />
      <StrategyResult job={selectedJob} />
    </section>
  );
}
