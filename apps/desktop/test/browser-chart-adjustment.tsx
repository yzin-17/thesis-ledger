import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MarketChartOptionsV3 } from '@thesis-ledger/schemas';
import { MarketChartAdjustment } from '../src/features/market-detail/MarketChartAdjustment.js';
import { useMarketChartSelection } from '../src/features/market-detail/useMarketChartSelection.js';
import { Button } from '../src/components/ui/button.js';
import '../src/ui/styles.css';

const queryClient = new QueryClient();
let credentialAvailable = true;
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(String(input), window.location.origin);
  if (url.pathname.endsWith('/chart-options')) {
    const barsLimit = Number(url.searchParams.get('barsLimit') ?? 90);
    const plan = {
      barsLimit,
      indicatorParams: JSON.parse(url.searchParams.get('indicatorParams') ?? '{}'),
    };
    const window = { start: barsLimit === 90 ? '2025-02-27' : '2024-06-02', end: '2026-05-20' };
    const body: MarketChartOptionsV3 = {
      plan,
      window,
      contractVersion: 3,
      symbol: '159516.SZ',
      mode: 'v3',
      options: [
        { adjustment: 'none', available: true, reason: null },
        {
          adjustment: 'qfq',
          available: credentialAvailable,
          reason: credentialAvailable ? null : 'credential_missing',
        },
        barsLimit === 90
          ? { adjustment: 'hfq', available: true, reason: null, availableVia: 'backup' }
          : { adjustment: 'hfq', available: false, reason: 'basis_incompatible' },
      ],
    };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }
  return originalFetch(input, init);
};

function Fixture() {
  const selection = useMarketChartSelection('159516.SZ', 'qfq');
  const [revision, setRevision] = useState(0);
  const [barsLimit, setBarsLimit] = useState(90);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">图表口径交互验证</h1>
      <p>本页使用合成能力目录，不请求真实行情或修改策略配置。</p>
      <MarketChartAdjustment
        symbol="159516.SZ"
        value={selection.adjustment}
        onChange={selection.select}
        plan={{ barsLimit, indicatorParams: {} }}
      />
      <Button variant="outline" onClick={() => setBarsLimit((value) => (value === 90 ? 180 : 90))}>
        切换窗口大小
      </Button>
      <output aria-label="窗口大小">{barsLimit}</output>
      <output aria-label="图表选择">
        图表：{selection.adjustment}，协议：{selection.chartContractVersion ?? '旧版'}
      </output>
      <output aria-label="冻结运行配置">已运行策略：qfq，固定配置</output>
      <Button
        variant="outline"
        onClick={() => {
          credentialAvailable = !credentialAvailable;
          setRevision((value) => value + 1);
          void queryClient.invalidateQueries({
            queryKey: ['desktop', 'market-chart-options', '159516.SZ'],
          });
        }}
      >
        切换凭据可用性
      </Button>
      <span>目录修订 {revision}</span>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <Fixture />
  </QueryClientProvider>,
);
