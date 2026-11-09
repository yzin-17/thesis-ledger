import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FundNavHistory } from '@thesis-ledger/schemas';
import { FundNavPnlChart } from '../src/features/market-detail/FundNavPnlChart.js';
import { Button } from '../src/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../src/components/ui/dialog.js';
import '../src/ui/styles.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const history: FundNavHistory = Array.from({ length: 99 }, (_, index) => {
  const navDate = new Date(Date.UTC(2026, 7, 1 + index)).toISOString();
  return {
    version: 3 as const,
    symbol: '000001.OF',
    navDate,
    unitNav: 1.4 - index * 0.003 + Math.sin(index) * 0.03,
    provider: 'fixture',
    fetchedAt: '2026-11-08T00:00:00Z',
    freshness: 'delayed' as const,
  };
}).filter((point) => !point.navDate.startsWith('2026-11-03'));

function Fixture() {
  const [account, setAccount] = useState('11111111-1111-4111-8111-111111111111');
  const [mode, setMode] = useState<'actual' | 'shadow'>('actual');
  const [scoped, setScoped] = useState(true);
  const [open, setOpen] = useState(false);
  return (
    <main className="p-4">
      <Button onClick={() => setOpen(true)}>打开基金行情</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>基金净值历史</DialogTitle>
            <DialogDescription>受控账户成交标记验收</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                setAccount((value) =>
                  value.startsWith('1')
                    ? '22222222-2222-4222-8222-222222222222'
                    : '11111111-1111-4111-8111-111111111111',
                )
              }
            >
              切换账户
            </Button>
            <Button onClick={() => setMode((value) => (value === 'actual' ? 'shadow' : 'actual'))}>
              切换账户类型
            </Button>
            <Button onClick={() => setScoped((value) => !value)}>切换目录入口</Button>
            <Button
              onClick={() =>
                void client.invalidateQueries({ queryKey: ['desktop', 'fund-nav-trades'] })
              }
            >
              刷新成交
            </Button>
          </div>
          <FundNavPnlChart
            history={history}
            position={{
              symbol: '000001.OF',
              asset: { name: '验证基金', assetType: 'fund' },
              ...(scoped
                ? {
                    accountId: account,
                    accountName: account.startsWith('1') ? '验证账户甲' : '验证账户乙',
                    mode,
                    currency: 'CNY',
                    valuedAt: '2026-11-08T00:00:00Z',
                    pnl: 12,
                    quantity: 90,
                    costPrice: 1.5,
                  }
                : {}),
            }}
          />
        </DialogContent>
      </Dialog>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Fixture />
  </QueryClientProvider>,
);
