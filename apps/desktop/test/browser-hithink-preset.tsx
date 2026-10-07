import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MarketPolicyPanel } from '../src/features/market-data/MarketPolicyPanel.js';
import { Button } from '../src/components/ui/button.js';
import type {
  MarketPolicyDraftV3,
  MarketRouteCatalogReadV3,
  ProviderManifest,
} from '../src/features/market-data/market-data.types.js';
import '../src/ui/styles.css';

const key = {
  kind: 'bar',
  market: 'CN',
  assetType: 'ETF',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
} as const;
const catalog: MarketRouteCatalogReadV3 = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  status: 'complete',
  catalogRevision: 9,
  generatedAt: '2026-09-26T00:00:00Z',
  reason: null,
  entries: [
    {
      key,
      target: { providerId: 'hithink', upstreamSource: 'hithink-financial-api' },
      state: 'ready',
    },
  ],
};
const provider: ProviderManifest = {
  providerId: 'hithink',
  displayName: 'HiThink',
  version: 1,
  capabilities: {},
  configured: true,
  enabled: true,
  credentialConfigured: true,
};

function Fixture() {
  const [policy, setPolicy] = useState<MarketPolicyDraftV3>({
    contractVersion: 3,
    revision: 4,
    enabled: false,
    routes: [],
  });
  const [revision, setRevision] = useState(9);
  const [enabled, setEnabled] = useState(true);
  const [changes, setChanges] = useState(0);
  const [saves, setSaves] = useState(0);
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">HiThink 预设交互验收</h1>
      <p>合成能力与内存草稿；本页不访问服务端、不保存真实设置。</p>
      <div className="flex gap-2">
        <Button onClick={() => setRevision((value) => value + 1)}>更新目录修订</Button>
        <Button onClick={() => setEnabled((value) => !value)}>切换 HiThink 可用性</Button>
      </div>
      <output aria-label="草稿操作统计">
        草稿变更 {changes} 次，保存 {saves} 次，路由 {policy.routes.length} 条，目录修订 {revision}
      </output>
      <MarketPolicyPanel
        policy={policy}
        serverPolicy={null}
        catalog={{ ...catalog, catalogRevision: revision }}
        catalogPending={false}
        catalogQueryFailed={false}
        providers={[{ ...provider, enabled }]}
        disabled={false}
        saving={false}
        retrying={false}
        dirty={changes > 0}
        onChange={(next) => {
          setPolicy(next);
          setChanges((value) => value + 1);
        }}
        onSave={() => setSaves((value) => value + 1)}
        onRetry={() => {}}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
