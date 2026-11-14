import { useJournalReview, type JournalDashboardProps } from './useJournalReview.js';
import { AccountState } from './JournalReviewState.js';
import { JournalSingleReviewPanel } from './JournalSingleReviewPanel.js';
import { JournalPeriodReviewPanel } from './JournalPeriodReviewPanel.js';
import { PageHeader } from '../shared/PageHeader.js';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { AdvancedJsonSheet } from './AdvancedJsonSheet.js';

import { JournalAccountSelector } from './JournalAccountSelector.js';

export function JournalDashboard(props: JournalDashboardProps) {
  const state = useJournalReview(props);
  const {
    accounts,
    accountsPending,
    accountsError,
    onRetry,
    onNavigateAccounts,
    onNavigatePosition,
    tab,
    setTab,
    accountId,
    advancedOpen,
    setAdvancedOpen,
    advancedMode,
    periodTradesOverride,
    currentSingleTrade,
    periodTrades,
    selectAccount,
    applyAdvancedJson,
  } = state;
  const accountState = AccountState({
    accounts,
    pending: accountsPending,
    error: accountsError,
    onRetry,
    onNavigateAccounts,
    onNavigatePosition,
  });
  if (accountState) {
    return (
      <section className="module-page flex flex-col gap-card">
        <PageHeader eyebrow="INVESTMENT JOURNAL" title="投资复盘" />
        {accountState}
      </section>
    );
  }
  const singleJsonValue = currentSingleTrade ?? {};
  const periodJsonValue = periodTradesOverride ?? periodTrades;
  return (
    <section className="module-page flex flex-col gap-card">
      <PageHeader eyebrow="INVESTMENT JOURNAL" title="投资复盘" />

      <JournalAccountSelector accounts={accounts} value={accountId} onValueChange={selectAccount} />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === 'single') {
            setTab('single');
            return;
          }
          if (value === 'period') setTab('period');
        }}
      >
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="single">单笔复盘</TabsTrigger>
          <TabsTrigger value="period">周期复盘</TabsTrigger>
        </TabsList>
        <JournalSingleReviewPanel state={state} />
        <JournalPeriodReviewPanel state={state} />
      </Tabs>
      <AdvancedJsonSheet
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        mode={advancedMode}
        value={advancedMode === 'single' ? singleJsonValue : periodJsonValue}
        onApply={applyAdvancedJson}
      />
    </section>
  );
}
