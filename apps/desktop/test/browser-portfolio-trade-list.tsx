import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { ToastProvider } from '../src/components/ui/toast.js';
import { Button } from '../src/components/ui/button.js';
import { PortfolioTradeView } from '../src/features/portfolio/PortfolioTradeView.js';
import { portfolioTradeKeys } from '../src/features/portfolio/portfolio-trade.queries.js';
import { portfolioKeys } from '../src/features/portfolio/portfolio.queries.js';
import type { Account, PortfolioMode } from '../src/features/portfolio/portfolio.types.js';
import type { TradeSummaryResponse } from '@thesis-ledger/api-client';
import '../src/ui/styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
const accounts: Account[] = [
  {
    id: 'actual-account',
    name: '受控实际账户',
    type: 'securities',
    mode: 'actual',
    currency: 'CNY',
  },
  {
    id: 'shadow-account',
    name: '受控模拟账户',
    type: 'securities',
    mode: 'shadow',
    currency: 'CNY',
  },
];
const historical: Account = {
  ...accounts[0]!,
  id: 'historical-account',
  name: '已停用历史账户',
  active: false,
};
const managed = [...accounts, historical];
client.setQueryData(portfolioKeys.managedAccounts(), managed);
function sample(account: Account, index: number): TradeSummaryResponse {
  return {
    id: 'trade:' + account.id,
    accountId: account.id,
    accountMode: account.mode,
    symbol: index === 1 ? 'SPY.US' : 'AAPL.US',
    assetName: index === 1 ? '受控历史 ETF' : '苹果公司',
    lifecycle: index === 1 ? 'ACTIVE' : 'ENDED',
    exitProgress: index === 1 ? 'NONE' : 'FULL',
    endEvidence: index === 1 ? null : 'SELL_EXECUTION',
    openedAt: '2026-01-01T00:00:00Z',
    closedAt: index === 1 ? null : '2026-01-05T00:00:00Z',
    earliestEvidenceAt: '2026-01-01T00:00:00Z',
    sourceQuantity: '100',
    closedQuantity: '100',
    remainingQuantity: '0',
    grossRealizedPnl: '200',
    netRealizedPnl: '190',
    realizedNetReturnRate: '0.19',
    costEstimated: false,
    completeness: 'COMPLETE',
    issues: [],
    costIssues: [],
    algorithmVersion: 'trade-projection-v1',
    projectionFingerprint: null,
    projectionGeneration: '1',
    excludedReasons: [],
  };
}
for (const mode of ['actual', 'shadow'] as const) {
  const current = accounts.find((account) => account.mode === mode)!;
  const rows = [sample(current, 0)];
  if (mode === 'actual') rows.push(sample(historical, 1));
  for (const accountId of ['', current.id]) {
    const scoped = rows.filter((row) => !accountId || row.accountId === accountId);
    client.setQueryData(portfolioTradeKeys.instruments(mode, accountId), {
      items: scoped.map((row) => ({ symbol: row.symbol, displayName: row.assetName })),
    });
    for (const symbol of ['', 'AAPL.US', 'SPY.US']) {
      for (const lifecycle of ['ALL', 'ACTIVE', 'ENDED'] as const) {
        const items = scoped.filter(
          (row) =>
            (!symbol || row.symbol === symbol) &&
            (lifecycle === 'ALL' || row.lifecycle === lifecycle),
        );
        client.setQueryData(portfolioTradeKeys.list(mode, accountId, symbol, lifecycle), {
          pages: [
            {
              accountId: accountId || null,
              mode,
              items,
              nextCursor: null,
              projectionGenerations: {},
            },
          ],
          pageParams: [undefined],
        });
      }
    }
  }
  for (const row of rows)
    client.setQueryData(portfolioTradeKeys.detail(mode, row.accountId, row.id), {
      ...row,
      entryLegs: [],
      baselineComponents: [],
      corporateActions: [],
      closeSlices: [],
      dividendAttributions: [],
      evidenceSources: [],
    });
}
function Harness() {
  const [mode, setMode] = useState<PortfolioMode>('actual');
  return (
    <main className="content space-y-6">
      <Button variant="outline" onClick={() => setMode(mode === 'actual' ? 'shadow' : 'actual')}>
        切换账户模式
      </Button>
      <PortfolioTradeView
        mode={mode}
        accounts={accounts}
        onReview={() => {
          throw new Error('受控验收不启动复盘');
        }}
      />
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
