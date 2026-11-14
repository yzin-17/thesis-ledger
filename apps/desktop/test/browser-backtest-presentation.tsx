import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { backtestResultSchemaV3, backtestInstrumentSeriesSchema } from '@thesis-ledger/schemas';
import { Button } from '../src/components/ui/button.js';
import { BacktestPriceDisclosure } from '../src/features/strategy/BacktestPriceDisclosure.js';
import { StrategyBacktestEquityChart } from '../src/features/strategy/StrategyBacktestEquityChart.js';
import { buildBacktestChartModel } from '../src/features/strategy/strategy-backtest-chart.model.js';
import { unifiedRatioJob } from './unified-backtest-ratio-samples.js';
import '../src/ui/styles.css';

const manifest: Record<string, unknown> = await fetch(
  new URL('../../../packages/schemas/fixtures/backtest-snapshot-v3.manifest.json', import.meta.url),
).then((response) => response.json());
const result = backtestResultSchemaV3.parse({
  source: 'BACKTEST',
  runId: 'run',
  strategyVersionId: 'version',
  snapshotId: 'snapshot',
  engineVersion: 'v3',
  schemaVersion: '3',
  snapshotVersion: 'snapshot-manifest-v3',
  marketRuleVersion: 'v1',
  calendarVersion: 'v1',
  aggregationVersion: 'v1',
  contentHash: 'hash',
  resultChecksum: 'checksum',
  completeness: 'complete',
  executionPriceProtocol: manifest.executionPriceProtocol,
  comparableDataFingerprint: manifest.comparableDataFingerprint,
  actualSources: manifest.actualSources,
  warnings: [
    'BENCHMARK_EVALUATION:v3-buy-first-in-range-close-liquidate-last-in-range-close-by-trading-date-v2',
  ],
  rejectedOrders: [],
  simulationFills: [],
  trades: [],
  equityCurve: [],
  metrics: {},
  benchmarkCompatibility: {
    status: 'compatible',
    strategyFingerprint: 'a'.repeat(16),
    benchmarkFingerprint: 'a'.repeat(16),
    missingFields: [],
    differentFields: [],
    costAssumption: {
      kind: 'execution-model',
      version: 'execution-model-cost-v1',
      fingerprint: 'b'.repeat(16),
    },
  },
});
const job = unifiedRatioJob('0.1234');
job.id = '00000000-0000-4000-8000-000000000080';
job.result!.snapshotId = 'controlled-snapshot';
const instrument = backtestInstrumentSeriesSchema.parse({
  schemaVersion: '1',
  runId: job.id,
  status: 'available',
  source: {
    symbol: '00700.HK',
    currency: 'HKD',
    adjustment: 'hfq',
    timeframe: '1d',
    timezone: 'Asia/Hong_Kong',
    providerId: 'controlled',
    upstreamSource: 'controlled',
    snapshotId: job.result!.snapshotId,
    artifactHash: 'controlled',
    dataAsOf: '2026-11-12T08:00:00Z',
  },
  points: ['1234.567890123456789', null, '0.0000000000000000000000000000000000000001'].map(
    (close, index) => ({
      occurredAt: new Date(Date.UTC(2026, 10, index + 1, 7)).toISOString(),
      close,
    }),
  ),
});
const model = buildBacktestChartModel(job, job.result!, instrument);

function Harness() {
  const [invalid, setInvalid] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [range, setRange] = useState('');
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setInvalid(!invalid)}>
          切换合同样本
        </Button>
        <Button variant="outline" onClick={() => setEmpty(!empty)}>
          切换空图表
        </Button>
      </div>
      <BacktestPriceDisclosure result={invalid ? {} : result} />
      <StrategyBacktestEquityChart
        model={empty ? { ...model, equity: [], drawdown: [] } : model}
        resetKey={empty ? 'empty' : 'controlled'}
        onRangeChange={(value) => setRange(JSON.stringify(value))}
      />
      <output aria-label="图表范围回执">{range}</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
