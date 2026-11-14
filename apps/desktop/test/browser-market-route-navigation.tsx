import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MarketRouteKeyV3 } from '@thesis-ledger/schemas';
import { Button } from '../src/components/ui/button';
import { MarketPolicyPanel } from '../src/features/market-data/MarketPolicyPanel';
import { useMarketPolicyWorkflow } from '../src/features/market-data/useMarketPolicyWorkflow';
import { marketDataKeys } from '../src/features/market-data/market-data.queries';
import type {
  MarketPolicyResponse,
  MarketRouteCatalogReadV3,
} from '../src/features/market-data/market-data.types';
import '../src/ui/styles.css';

const target = { providerId: 'sample', upstreamSource: 'sample-source' };
const base = { kind: 'data', market: 'CN', assetType: 'STOCK' } as const;
const keys: MarketRouteKeyV3[] = [
  { ...base, capability: 'REALTIME_QUOTE' },
  {
    kind: 'bar',
    market: 'CN',
    assetType: 'STOCK',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: 'none',
  },
  {
    kind: 'bar',
    market: 'CN',
    assetType: 'STOCK',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: 'qfq',
  },
  { ...base, capability: 'FUND_HOLDINGS', assetType: 'MUTUAL_FUND' },
  { ...base, capability: 'NEWS_FEED' },
  { ...base, capability: 'REFERENCE_MACRO_GDP' },
  { ...base, capability: 'RISK_WARNING' },
  { ...base, capability: 'SECURITY_STATIC_INFO' },
  { ...base, capability: 'REALTIME_QUOTE', market: 'HK' },
  { ...base, capability: 'REALTIME_QUOTE', market: 'US', assetType: 'ETF' },
];
const initial: MarketPolicyResponse = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'sample',
  revision: 4,
  enabled: true,
  routes: keys.map((key) => ({
    key,
    targets: [target],
    enabled: key.capability !== 'RISK_WARNING',
  })),
  syncState: 'applied',
  effectiveStale: false,
  effectiveProjection: null,
  dsaRevision: 4,
  lastError: null,
};
const catalog: MarketRouteCatalogReadV3 = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  status: 'complete',
  reason: null,
  catalogRevision: 1,
  generatedAt: '2026-11-09T00:00:00Z',
  entries: keys.map((key) => ({ key, target, state: 'ready' })),
};

function Fixture() {
  const client = useQueryClient();
  const { data: serverPolicy } = useQuery({
    queryKey: marketDataKeys.policy(),
    queryFn: async () => initial,
    initialData: initial,
    staleTime: Infinity,
  });
  const [revision, setRevision] = useState(1);
  const [message, setMessage] = useState<{ text: string } | null>(null);
  const workflow = useMarketPolicyWorkflow({
    policy: serverPolicy,
    catalogComplete: true,
    setBusyAction: () => undefined,
    setMessage,
  });
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">路由配置验收</h1>
      <p className="text-sm text-muted-foreground">
        合成目录；保存请求由浏览器拦截，不写入业务设置。
      </p>
      <Button
        variant="outline"
        className="self-start"
        onClick={() => {
          setRevision((value) => value + 1);
          client.setQueryData(marketDataKeys.policy(), { ...serverPolicy });
        }}
      >
        刷新样本目录
      </Button>
      {message && <p role="status">{message.text}</p>}
      <MarketPolicyPanel
        policy={workflow.draft}
        serverPolicy={serverPolicy}
        catalog={{ ...catalog, catalogRevision: revision }}
        catalogPending={false}
        catalogQueryFailed={false}
        providers={[
          {
            providerId: 'sample',
            displayName: '样本数据源',
            version: 1,
            capabilities: {},
            enabled: true,
            configured: true,
            credentialConfigured: true,
          },
        ]}
        disabled={false}
        saving={workflow.saving}
        retrying={workflow.retrying}
        dirty={workflow.dirty}
        onChange={workflow.changeDraft}
        onSave={() => void workflow.save()}
        onRetry={() => void workflow.retry()}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
    }
  >
    <Fixture />
  </QueryClientProvider>,
);
