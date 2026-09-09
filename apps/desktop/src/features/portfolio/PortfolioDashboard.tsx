import { PageHeader } from '../shared/PageHeader.js';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw } from 'lucide-react';
import type { DesktopNavigationView } from '../../views.js';
import { MarketDetailDialog } from '../market-detail/MarketDetailDialog.js';

import type { PortfolioMode, Position, Portfolio, Account } from './portfolio.types.js';
import type { LoadState } from '../shared/types.js';
import type { OnboardingNavigationOptions } from '../onboarding/onboarding.types.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { StatePanel, DataStateBanner, DashboardSkeleton } from '../shared/DesktopPrimitives.js';

import { FirstRunOnboarding } from '../onboarding/FirstRunOnboarding.js';
import { useOnboardingStatusQuery } from '../onboarding/onboarding.queries.js';
import { PortfolioModeNote, PortfolioModeSwitch } from '../shared/PortfolioModeSwitch.js';
import { PortfolioTradeView } from './PortfolioTradeView.js';
import type { PortfolioTradeReviewTarget } from './portfolio-trade.types.js';
import { PortfolioPositionTable, PortfolioSummary } from './PortfolioOverview.js';

export function PortfolioDashboard({
  state,
  portfolio,
  accounts,
  mode,
  onModeChange,
  onRetry,
  refreshing = false,
  onNavigate,
  onOpenReview,
}: {
  state: LoadState;
  portfolio: Portfolio | null;
  accounts: Account[];
  mode: PortfolioMode;
  onModeChange: (mode: PortfolioMode) => void;
  onRetry: () => void;
  refreshing?: boolean;
  onNavigate: (view: DesktopNavigationView, options?: OnboardingNavigationOptions) => void;
  onOpenReview: (target: PortfolioTradeReviewTarget) => void;
}) {
  const [detailPosition, setDetailPosition] = useState<Position | null>(null);
  const [portfolioTab, setPortfolioTab] = useState<'overview' | 'trades'>('overview');
  const hasPosition = (portfolio?.positions.length ?? 0) > 0;
  const onboardingStatusQuery = useOnboardingStatusQuery(hasPosition);
  const onboardingStatus = onboardingStatusQuery.data ?? {
    hasProviderSetup: false,
    hasRiskRule: false,
  };
  const modeNote =
    mode === 'shadow' ? (
      <PortfolioModeNote>当前为模拟账户范围，数据仅用于研究。</PortfolioModeNote>
    ) : null;

  const pageHeader = (
    <PageHeader
      eyebrow="PORTFOLIO"
      title="投资组合"
      description={
        portfolio
          ? `数据时点 ${new Date(portfolio.valuedAt).toLocaleString('zh-CN')}`
          : '查看持仓、交易与资产表现。'
      }
      actions={
        <>
          <PortfolioModeSwitch mode={mode} onModeChange={onModeChange} ariaLabel="估值范围" />
          <RefreshIconButton label="刷新组合数据" refreshing={refreshing} onClick={onRetry} />
        </>
      }
    />
  );

  if (state === 'loading') {
    return (
      <>
        {pageHeader}
        {modeNote}
        <DashboardSkeleton />
      </>
    );
  }
  if (state === 'error')
    return (
      <>
        {pageHeader}
        {modeNote}
        <StatePanel
          title="暂时无法读取投资组合"
          description="请确认 ThesisLedger Server 与数据服务正在运行。"
        >
          <Button type="button" variant="default" onClick={onRetry}>
            <RefreshCw />
            重新加载
          </Button>
        </StatePanel>
      </>
    );
  if (state === 'empty')
    return (
      <>
        {pageHeader}
        {modeNote}
        <StatePanel
          title="从第一笔持仓开始"
          description="选择账户后手动录入持仓；截图导入暂未开放。没有账户时再创建账户。"
        >
          <span className="muted">下方表单会先校验账户、证券代码、数量和成本价。</span>
        </StatePanel>
        <FirstRunOnboarding
          hasAccount={accounts.length > 0}
          hasPosition={hasPosition}
          hasProviderSetup={onboardingStatus.hasProviderSetup}
          hasRiskRule={onboardingStatus.hasRiskRule}
          onNavigate={onNavigate}
        />
      </>
    );
  return (
    <>
      {pageHeader}
      {modeNote}
      <DataStateBanner state={state} onRetry={onRetry} />
      <Tabs
        value={portfolioTab}
        onValueChange={(value) => setPortfolioTab(value as 'overview' | 'trades')}
      >
        <TabsList variant="line">
          <TabsTrigger value="overview">组合概览</TabsTrigger>
          <TabsTrigger value="trades">交易</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-0 pt-3">
          <FirstRunOnboarding
            hasAccount={accounts.length > 0}
            hasPosition={hasPosition}
            hasProviderSetup={onboardingStatus.hasProviderSetup}
            hasRiskRule={onboardingStatus.hasRiskRule}
            onNavigate={onNavigate}
          />
          <PortfolioSummary portfolio={portfolio!} />
          <PortfolioPositionTable portfolio={portfolio!} onSelectPosition={setDetailPosition} />
        </TabsContent>
        <TabsContent value="trades" className="mt-0 pt-3">
          <PortfolioTradeView mode={mode} accounts={accounts} onReview={onOpenReview} />
        </TabsContent>
      </Tabs>
      {detailPosition && (
        <MarketDetailDialog position={detailPosition} onClose={() => setDetailPosition(null)} />
      )}
    </>
  );
}
