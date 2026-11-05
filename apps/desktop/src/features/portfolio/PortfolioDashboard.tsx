import { portfolioValuationNotice } from '@thesis-ledger/domain';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import type { DesktopNavigationView } from '../../views.js';
import { MarketDetailDialog } from '../market-detail/MarketDetailDialog.js';

import type { PortfolioMode, Position, Portfolio, Account } from './portfolio.types.js';
import type { LoadState } from '../shared/types.js';
import type { OnboardingNavigationOptions } from '../onboarding/onboarding.types.js';
import { StatePanel, DataStateBanner, DashboardSkeleton } from '../shared/DesktopPrimitives.js';

import { FirstRunOnboarding } from '../onboarding/FirstRunOnboarding.js';
import { useOnboardingStatusQuery } from '../onboarding/onboarding.queries.js';
import { PortfolioPositionTable, PortfolioSummary } from './PortfolioOverview.js';

export function PortfolioDashboard({
  state,
  portfolio,
  accounts,
  mode,
  onRetry,
  onNavigate,
}: {
  state: LoadState;
  portfolio: Portfolio | null;
  accounts: Account[];
  mode: PortfolioMode;
  onRetry: () => void;
  onNavigate: (view: DesktopNavigationView, options?: OnboardingNavigationOptions) => void;
}) {
  const [detailPosition, setDetailPosition] = useState<Position | null>(null);
  const valuationNotice = portfolio ? portfolioValuationNotice(portfolio) : null;
  const hasPosition = (portfolio?.positions.length ?? 0) > 0;
  const onboardingStatusQuery = useOnboardingStatusQuery(hasPosition);
  const onboardingStatus = onboardingStatusQuery.data ?? {
    hasProviderSetup: false,
    hasRiskRule: false,
  };
  if (state === 'loading') {
    return (
      <>
        <DashboardSkeleton />
      </>
    );
  }
  if (state === 'error')
    return (
      <>
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
      <DataStateBanner
        state={valuationNotice ? 'stale' : state}
        {...valuationNotice}
        onRetry={onRetry}
      />
      <FirstRunOnboarding
        hasAccount={accounts.length > 0}
        hasPosition={hasPosition}
        hasProviderSetup={onboardingStatus.hasProviderSetup}
        hasRiskRule={onboardingStatus.hasRiskRule}
        onNavigate={onNavigate}
      />
      <PortfolioSummary portfolio={portfolio!} />
      <PortfolioPositionTable
        portfolio={portfolio!}
        accounts={accounts}
        onSelectPosition={setDetailPosition}
      />
      {detailPosition &&
        portfolio?.positions.some((position) => position.id === detailPosition.id) && (
          <MarketDetailDialog
            position={{
              ...detailPosition,
              mode,
              valuedAt: portfolio.valuedAt,
              currency:
                detailPosition.currency ??
                accounts.find((account) => account.id === detailPosition.accountId)?.currency,
              accountName: accounts.find((account) => account.id === detailPosition.accountId)
                ?.name,
            }}
            onClose={() => setDetailPosition(null)}
          />
        )}
    </>
  );
}
