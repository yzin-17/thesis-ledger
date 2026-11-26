import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog';
import { Toaster } from '../src/components/ui/toast';
import { CashObservationSheet } from '../src/features/account-data/AccountDataCashObservationSheet';
import { AdvancedJsonSheet } from './fixtures/journal/AdvancedJsonSheet.js';
import '../src/ui/styles.css';

declare global {
  interface Window {
    draftCloseConsumerHarness?: {
      changeAccount: () => void;
      refreshJson: () => void;
    };
  }
}

function Harness() {
  const [open, setOpen] = useState(true);
  const [accountId, setAccountId] = useState('controlled-account-1');
  const [refreshed, setRefreshed] = useState(false);
  const [closeCount, setCloseCount] = useState(0);
  const json = new URLSearchParams(window.location.search).get('case') === 'json';
  useEffect(() => {
    window.draftCloseConsumerHarness = {
      changeAccount: () => setAccountId('controlled-account-2'),
      refreshJson: () => setRefreshed(true),
    };
    return () => {
      delete window.draftCloseConsumerHarness;
    };
  }, []);
  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) setCloseCount((count) => count + 1);
    setOpen(nextOpen);
  };
  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">表单关闭快照验收</h1>
      <p data-testid="context" className="text-sm">
        {accountId}
      </p>
      <p data-testid="close-count" className="text-sm">
        已确认关闭 {closeCount} 次
      </p>
      {json ? (
        <AdvancedJsonSheet
          open={open}
          onOpenChange={changeOpen}
          value={refreshed ? { refreshed: '新内容' } : { original: true }}
          mode="single"
          onApply={() => {
            throw new Error('受控验收不得应用到业务');
          }}
        />
      ) : (
        <CashObservationSheet
          account={{
            id: accountId,
            name: '受控账户',
            type: 'securities',
            mode: 'actual',
            currency: 'CNY',
          }}
          open={open}
          onOpenChange={changeOpen}
          onSaved={() => {
            throw new Error('受控验收不得提交现金快照');
          }}
        />
      )}
    </main>
  );
}

const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Toaster>
      <ConfirmDialogProvider>
        <Harness />
      </ConfirmDialogProvider>
    </Toaster>
  </QueryClientProvider>,
);
