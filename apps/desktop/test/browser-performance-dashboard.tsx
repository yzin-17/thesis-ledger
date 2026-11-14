import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button } from '../src/components/ui/button.js';
import { ToastProvider } from '../src/components/ui/toast.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { PerformanceDashboard } from '../src/features/performance/PerformanceDashboard.js';
import { PerformanceAllocationSection } from '../src/features/performance/PerformanceSections.js';
import { performanceKeys } from '../src/features/performance/performance.queries.js';
import { performancePnlKeys } from '../src/features/performance/performance-pnl.queries.js';
import type {
  PerformanceFxMeta,
  PerformanceSeriesPoint,
} from '../src/features/performance/performance.types.js';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
const account = {
  id: 'controlled-account',
  name: '受控实际账户',
  mode: 'actual' as const,
  type: 'securities' as const,
  currency: 'CNY' as const,
};
const points: PerformanceSeriesPoint[] = [1, 2, 3].map((day) => ({
  at: `2026-11-0${day}T00:00:00Z`,
  value: 100 + day * 10,
  currency: 'CNY',
  valuationBasis: 'OFFICIAL',
  disclosureCoverage: 1,
  pricedCoverage: 1,
  dataQuality: 'COMPLETE',
  sourceSnapshotId: null,
}));
const fx: PerformanceFxMeta = {
  enabled: false,
  status: 'disabled',
  baseCurrency: 'CNY',
  rates: [],
  missingCurrencies: [],
};
const total = {
  marketValue: 110,
  costValue: 100,
  cashValue: 90,
  partial: false,
  missingSymbols: [],
  currency: 'CNY',
};
const allocation = [
  { category: 'stock' as const, value: 110, weight: 0.55 },
  { category: 'cash' as const, value: 90, weight: 0.45 },
];
const targets = { stock: 0.6, cash: 0.4 };
client.setQueryDefaults([...performanceKeys.root, 'history'], {
  initialData: points.map((point, index) => ({
    id: 'snapshot-' + index,
    capturedAt: point.at,
    marketValue: point.value,
    cashValue: 90,
    costValue: 100,
    partial: false,
    missingSymbols: [],
    currency: 'CNY',
  })),
});
client.setQueryDefaults([...performanceKeys.root, 'series'], {
  initialData: {
    range: '1Y',
    interval: '1d',
    currency: 'CNY',
    availableIntervals: ['1d', '1w'],
    defaultInterval: '1d',
    dataQuality: 'COMPLETE',
    historyStart: points[0]!.at,
    points,
  },
});
client.setQueryDefaults([...performanceKeys.root, 'summary'], {
  initialData: { ttwror: 0.1, xirr: null, fx },
});
client.setQueryDefaults([...performanceKeys.root, 'layers'], {
  initialData: {
    security: [
      {
        accountId: account.id,
        symbol: 'AAPL.US',
        assetType: 'stock',
        costValue: 100,
        marketValue: 110,
      },
    ],
    account: [{ ...total, accountId: account.id }],
    portfolio: total,
    byCurrency: [total],
    dataQuality: { partial: false, missingSymbols: [] },
    valuedAt: points.at(-1)!.at,
    fx,
  },
});
client.setQueryDefaults(performanceKeys.targetsRoot, {
  initialData: {
    targets,
    version: 1,
    createdAt: points[0]!.at,
    scope: 'portfolio',
    source: 'explicit',
  },
});
client.setQueryDefaults(performanceKeys.allocationRoot, {
  initialData: { allocation, rebalance: [], partial: false, missingSymbols: [] },
});
client.setQueryDefaults(performancePnlKeys.root, {
  initialData: {
    points: points.map((point, index) => ({
      at: point.at,
      value: index * 10,
      realizedPnl: 0,
      unrealizedPnl: index * 10,
      reason: null,
    })),
    truncated: false,
  },
});

function Harness() {
  const [section, setSection] = useState<'analysis' | 'allocation'>('analysis');
  const [notice, setNotice] = useState<'none' | 'partial' | 'blocked' | 'empty'>('none');
  return (
    <main className="content space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setSection('analysis');
            setNotice('none');
          }}
        >
          收益分析
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setSection('allocation');
            setNotice('none');
          }}
        >
          配置比较
        </Button>
        <Button variant="outline" onClick={() => setNotice('partial')}>
          不完整行情样本
        </Button>
        <Button variant="outline" onClick={() => setNotice('blocked')}>
          汇率阻塞样本
        </Button>
        <Button variant="outline" onClick={() => setNotice('empty')}>
          空配置样本
        </Button>
      </div>
      {notice === 'none' ? (
        <PerformanceDashboard
          accounts={[account]}
          accountId=""
          mode="actual"
          section={section}
          fxMerge={false}
          baseCurrency="CNY"
          portfolio={null}
          onNavigate={() => {
            throw new Error('受控验收不跳转来源设置');
          }}
        />
      ) : (
        <PerformanceAllocationSection
          loadState={notice === 'empty' ? 'empty' : 'ready'}
          allocationRows={notice === 'empty' ? [] : allocation}
          rebalanceRows={[]}
          targets={notice === 'empty' ? {} : targets}
          dataQuality={{
            partial: notice === 'partial',
            missingSymbols: notice === 'partial' ? ['受控缺失标的'] : [],
          }}
          fx={notice === 'blocked' ? { ...fx, enabled: true, status: 'blocked' } : fx}
          currencyTotals={[total]}
          onSaveTargets={async () => {
            throw new Error('受控验收不保存目标');
          }}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ToastProvider>
      <ConfirmDialogProvider>
        <Harness />
      </ConfirmDialogProvider>
    </ToastProvider>
  </QueryClientProvider>,
);
