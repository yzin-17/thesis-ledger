import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { StrategyBacktestResultTabs } from '../src/features/strategy/StrategyBacktestDetailSections';
import { backtestResultSummary } from '../src/features/strategy/strategy-list-presentation';
import { unifiedRatioCases, unifiedRatioJob } from './unified-backtest-ratio-samples';
import '../src/ui/styles.css';

const name = new URLSearchParams(window.location.search).get('case') ?? 'ordinary';
const sample = unifiedRatioCases.find((sample) => sample.name === name);
if (!sample) throw new Error('未知回测比例样本');
const job = unifiedRatioJob(sample.value, sample.chart);
function freeze(value: unknown) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}
freeze(job);
function Harness() {
  useEffect(() => {
    document.documentElement.dataset.backtestRatioReady = name;
  }, []);
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">统一回测实际组件验收</h1>
      <p data-backtest-summary="" className="text-sm">
        {backtestResultSummary({ ...job, resultMetrics: job.result!.metrics })}
      </p>
      <section data-backtest-detail="">
        <StrategyBacktestResultTabs job={job} />
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
