import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrategyRiskApplicationPanel } from '../src/features/strategy/StrategyRiskApplicationPanel.js';
import { createDefaultStrategySchema } from '../src/features/strategy/strategy.schema.js';
import { riskKeys } from '../src/features/risk/risk.queries.js';
import type { StrategyRecord } from '../src/features/strategy/strategy.types.js';
import type {
  RiskApplicationPreview,
  StrategyRiskApplication,
} from '../src/features/strategy/strategy-optimization.api.js';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } },
});
const accountId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';
const schema = createDefaultStrategySchema('隔离趋势策略');
schema.schemaVersion = '2';
schema.executionInstrument = { symbol: '510300.SH', market: 'CN', assetType: 'etf' };
schema.signalSources = [
  {
    id: 'execution',
    asset: schema.executionInstrument,
    timeframe: '1d',
    series: ['open', 'close'],
  },
];
const symbol = schema.executionInstrument.symbol;
const strategies: StrategyRecord[] = [
  {
    id: 'strategy',
    name: '隔离趋势策略',
    versions: [
      { id: versionId, version: 1, schemaVersion: 2, schema },
      { id: '33333333-3333-4333-8333-333333333333', version: 2, schemaVersion: 2, schema },
    ],
  },
];
const preview: RiskApplicationPreview = {
  previewHash: 'controlled-preview',
  cycleMode: 'existingAndFuture',
  evaluations: [],
  context: {},
  plan: {
    semanticVersion: 'strategy-monitoring-v1',
    strategyHash: 'controlled-strategy',
    planHash: 'controlled-plan',
    executionSymbol: symbol,
    evaluationTimeframe: '1d',
    rules: [],
    coverage: { riskTotal: 0, riskMapped: 0, items: [] },
  },
};
const application: StrategyRiskApplication = {
  id: '44444444-4444-4444-8444-444444444444',
  strategyVersionId: versionId,
  accountId,
  symbol,
  revision: 1,
  planHash: 'controlled-plan',
  plan: preview.plan,
  cycleMode: 'existingAndFuture',
  enabled: false,
  notification: { enabled: true, cooldownMinutes: 60, severity: 'warning', channels: ['feishu'] },
  coverage: preview.plan.coverage,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};
client.setQueryData(
  ['desktop', 'accounts'],
  [{ id: accountId, name: '隔离证券账户', type: 'securities', currency: 'CNY', mode: 'actual' }],
);
client.setQueryData(riskKeys.notificationRouting(), {
  routes: [{ channel: 'feishu', provider: 'feishu', label: '飞书' }],
});
client.setQueryData(['desktop', 'strategy', 'risk-applications', accountId, symbol], [application]);
Reflect.set(window, 'riskPanelFixturePreview', preview);
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <main className="mx-auto max-w-6xl p-4">
      <StrategyRiskApplicationPanel
        strategies={new URLSearchParams(location.search).has('empty') ? [] : strategies}
      />
    </main>
  </QueryClientProvider>,
);
