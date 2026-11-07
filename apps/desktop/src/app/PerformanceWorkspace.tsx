import { PortfolioDashboard } from '../features/portfolio/PortfolioDashboard.js';
import { LoadingState } from '@/components/ui/spinner';
import { useEffect, useState, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePageRefresh } from '../features/shared/usePageRefresh.js';
import { useGuardedTransition } from '../features/shared/navigation-guard.js';
import { PageHeader } from '../features/shared/PageHeader.js';
import { RefreshIconButton } from '../features/shared/RefreshIconButton.js';
import { PortfolioModeNote } from '../features/shared/PortfolioModeSwitch.js';
import { PortfolioAccountFilter } from '../features/portfolio/PortfolioAccountFilter.js';
import type { PortfolioTradeReviewTarget } from '../features/portfolio/portfolio-trade.types.js';
import { performanceKeys } from '../features/performance/performance.queries.js';
import {
  fetchPerformanceLayers,
  fetchPerformanceSummary,
  fetchPerformanceHistory,
} from '../features/performance/performance.api.js';
import { PerformanceAccountSelector } from '../features/performance/PerformanceScopeControls.js';
import type {
  Currency,
  SnapshotRecord,
  PerformanceLayersResponse,
  PerformanceSummary,
} from '../features/performance/performance.types.js';
import { StatePanel } from '../features/shared/DesktopPrimitives.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

import { createDeferredPage } from './DeferredPage.js';
import {
  performanceWorkspaceTabs as workspaceTabs,
  type PerformanceWorkspaceTab,
} from './performance-workspace-tabs.js';
export {
  performanceWorkspaceTab,
  type PerformanceWorkspaceTab,
} from './performance-workspace-tabs.js';
const PerformanceDashboard = createDeferredPage(() =>
  import('../features/performance/PerformanceDashboard.js').then((module) => ({
    default: module.PerformanceDashboard,
  })),
);
const PortfolioTradeView = createDeferredPage(() =>
  import('../features/portfolio/PortfolioTradeView.js').then((module) => ({
    default: module.PortfolioTradeView,
  })),
);


type Props = Omit<ComponentProps<typeof PortfolioDashboard>, 'onRetry'> & {
  accountsReady?: boolean;
  accountsError?: boolean;
  accountId: string;
  onAccountChange: (accountId: string) => void;
  tab: PerformanceWorkspaceTab;
  onTabChange: (tab: PerformanceWorkspaceTab) => void;
  onOpenReview: (target: PortfolioTradeReviewTarget) => void;
  refreshing?: boolean;
  onRetry: () => Promise<unknown> | void;
};

export function PerformanceWorkspace({
  accountsReady = true,
  accountsError = false,
  accountId,
  onAccountChange,
  tab,
  onTabChange,
  onOpenReview,
  refreshing = false,
  onRetry,
  state,
  portfolio,
  accounts,
  mode,
  onNavigate,
}: Props) {
  const [fxScope, setFxScope] = useState({ mode, merge: false, currency: 'CNY' as Currency });
  const mixedCurrencies =
    new Set(
      accounts
        .filter((account) => account.mode === mode && account.active !== false)
        .map((account) => account.currency),
    ).size > 1;
  const fxMerge = fxScope.mode === mode && mixedCurrencies && fxScope.merge;
  const baseCurrency = fxScope.mode === mode && mixedCurrencies ? fxScope.currency : 'CNY';
  useEffect(() => {
    setFxScope({ mode, merge: false, currency: 'CNY' });
  }, [mode, mixedCurrencies]);
  const guard = useGuardedTransition();
  const { refreshing: performanceRefreshing, refresh: refreshPerformance } = usePageRefresh([
    { queryKey: performanceKeys.root },
  ]);
  const queryOptions = { fxMerge: fxMerge && !accountId, baseCurrency };
  // 订阅页签查询的缓存元数据；公共工具栏不额外发起业务请求。
  const { data: layers } = useQuery<PerformanceLayersResponse>({
    queryKey: performanceKeys.layers(mode, accountId, queryOptions),
    queryFn: () => fetchPerformanceLayers(mode, accountId || undefined, queryOptions),
    enabled: false,
  });
  const { data: summary } = useQuery<PerformanceSummary>({
    queryKey: performanceKeys.summary(mode, accountId, queryOptions),
    queryFn: () => fetchPerformanceSummary(mode, accountId || undefined, queryOptions),
    enabled: false,
  });
  const { data: snapshots } = useQuery<SnapshotRecord[]>({
    queryKey: performanceKeys.history(mode, accountId, queryOptions),
    queryFn: () => fetchPerformanceHistory(mode, accountId || undefined, queryOptions),
    enabled: false,
  });
  const latest = [...(snapshots ?? [])].reverse().find((snapshot) => !snapshot.partial);
  const changeFx = (merge: boolean, currency: Currency) => {
    const commit = () => setFxScope({ mode, merge, currency });
    if (guard)
      void guard.request(commit, {
        title: '放弃未保存的目标修改并切换换算方式？',
        description: '当前目标输入将丢失，已保存的目标配置保持不变。',
        confirmLabel: '放弃修改并切换',
      });
    else commit();
  };
  const panel = (section: 'analysis' | 'allocation') => (
    <PerformanceDashboard
      accounts={accounts}
      mode={mode}
      accountId={accountId}
      section={section}
      portfolio={portfolio}
      onNavigate={onNavigate}
      fxMerge={fxMerge}
      baseCurrency={baseCurrency}
    />
  );
  return (
    <section className="flex min-w-0 flex-col gap-card">
      <PageHeader
        eyebrow="PERFORMANCE ANALYSIS"
        title="收益分析"
        actions={
          <RefreshIconButton
            label="刷新组合数据"
            refreshing={refreshing || performanceRefreshing}
            onClick={() => void Promise.all([onRetry(), refreshPerformance()])}
          />
        }
      />
      {mode === 'shadow' && <PortfolioModeNote>仅用于研究。</PortfolioModeNote>}
      <PerformanceAccountSelector
        accounts={accounts}
        mode={mode}
        accountId={accountId}
        mixedCurrencies={mixedCurrencies}
        latestSnapshotAt={latest?.capturedAt}
        valuedAt={portfolio?.valuedAt ?? layers?.valuedAt}
        showAccountSelector={false}
        onAccountChange={onAccountChange}
        accountControl={
          <PortfolioAccountFilter
            label="收益账户范围"
            accounts={accounts}
            mode={mode}
            accountId={accountId}
            onAccountChange={onAccountChange}
          />
        }
        fxMerge={queryOptions.fxMerge}
        baseCurrency={baseCurrency}
        onFxMergeChange={(merge) => changeFx(merge, baseCurrency)}
        onBaseCurrencyChange={(currency) => changeFx(fxMerge, currency)}
        onRetry={() => void refreshPerformance()}
        fx={layers?.fx ?? summary?.fx}
      />
      {accountsReady && accountsError && (
        <Alert>
          <AlertTitle>账户列表未更新</AlertTitle>
          <AlertDescription>
            保留上次读取的账户范围和当前输入，请使用顶部刷新重试。
          </AlertDescription>
        </Alert>
      )}
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = workspaceTabs.find((item) => item === value);
          if (next) onTabChange(next);
        }}
      >
        <TabsList variant="line" aria-label="收益分析分区">
          <TabsTrigger value="overview">组合概览</TabsTrigger>
          <TabsTrigger value="analysis">收益分析</TabsTrigger>
          <TabsTrigger value="allocation">配置目标</TabsTrigger>
          <TabsTrigger value="trades">交易</TabsTrigger>
        </TabsList>
        {accountsReady && (
          <>
            <TabsContent value="overview">
              <PortfolioDashboard
                refreshing={refreshing}
                state={state}
                portfolio={portfolio}
                accounts={accounts}
                mode={mode}
                onNavigate={onNavigate}
                onRetry={() => void onRetry()}
              />
            </TabsContent>
            <TabsContent value="analysis">
              {panel('analysis')}
            </TabsContent>
            <TabsContent value="allocation">
              {panel('allocation')}
            </TabsContent>
            <TabsContent value="trades">
              <PortfolioTradeView
                accounts={accounts}
                mode={mode}
                accountScope={{ accountId, onChange: onAccountChange }}
                onReview={onOpenReview}
              />
            </TabsContent>
          </>
        )}
        {!accountsReady && (
          <TabsContent value={tab}>
            {state === 'error' && (
              <StatePanel
                title="账户范围读取失败"
                description="请使用顶部刷新重新读取账户列表。"
                children={null}
              />
            )}
            {state !== 'error' && <LoadingState label="正在加载账户范围" />}
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
