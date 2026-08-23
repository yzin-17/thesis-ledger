import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/ArrowClockwise';
import type { DesktopNavigationView } from '../../views.js';
import { MarketDetailDialog } from '../market-detail/MarketDetailDialog.js';
import { cn } from '@/lib/utils';

import type { PortfolioMode, Position, Portfolio, Account } from './portfolio.types.js';
import type { LoadState } from '../shared/types.js';
import type { OnboardingNavigationOptions } from '../onboarding/onboarding.types.js';
import { money } from '../shared/display.js';
import { EmptyTableRow } from '../shared/EmptyStates.js';
import {
  Metric,
  StatePanel,
  DataStateBanner,
  DashboardSkeleton,
} from '../shared/DesktopPrimitives.js';

import { FirstRunOnboarding } from '../onboarding/FirstRunOnboarding.js';
import { useOnboardingStatusQuery } from '../onboarding/onboarding.queries.js';
import { PortfolioModeNote, PortfolioModeSwitch } from '../shared/PortfolioModeSwitch.js';

export function PortfolioDashboard({
  state,
  portfolio,
  accounts,
  mode,
  onModeChange,
  onRetry,
  onNavigate,
}: {
  state: LoadState;
  portfolio: Portfolio | null;
  accounts: Account[];
  mode: PortfolioMode;
  onModeChange: (mode: PortfolioMode) => void;
  onRetry: () => void;
  onNavigate: (view: DesktopNavigationView, options?: OnboardingNavigationOptions) => void;
}) {
  const largest = useMemo(
    () =>
      [...(portfolio?.positions ?? [])].sort(
        (a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0),
      )[0],
    [portfolio],
  );
  const [detailPosition, setDetailPosition] = useState<Position | null>(null);
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
    <header className="page-header">
      <div>
        <p className="kicker">组合总览</p>
        <h1>{portfolio ? money.format(portfolio.totalMarketValue) : '投资组合'}</h1>
        {portfolio && (
          <p className="as-of">数据时点 {new Date(portfolio.valuedAt).toLocaleString('zh-CN')}</p>
        )}
      </div>
      <div className="page-header-actions">
        <PortfolioModeSwitch
          mode={mode}
          onModeChange={onModeChange}
          ariaLabel="估值范围"
        />
        <Button className="secondary" type="button" variant="outline" onClick={onRetry}>
          <ArrowClockwiseIcon />
          刷新
        </Button>
      </div>
    </header>
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
            <ArrowClockwiseIcon />
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
          description="选择账户后手动录入持仓，或上传一张已脱敏的持仓截图；没有账户时再创建账户。"
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
      <FirstRunOnboarding
        hasAccount={accounts.length > 0}
        hasPosition={hasPosition}
        hasProviderSetup={onboardingStatus.hasProviderSetup}
        hasRiskRule={onboardingStatus.hasRiskRule}
        onNavigate={onNavigate}
      />
      <section className="metrics" aria-label="组合关键指标">
        <Metric label="持仓成本" value={money.format(portfolio!.totalCost)} />
        <Metric
          label="累计浮盈亏"
          value={money.format(portfolio!.totalPnl)}
          tone={portfolio!.totalPnl >= 0 ? 'positive' : 'negative'}
        />
        <Metric
          label="最大持仓"
          value={largest?.asset.name ?? '—'}
          {...(largest ? { detail: money.format(largest.marketValue ?? 0) } : {})}
        />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>当前持仓</h2>
            <p>{portfolio!.positions.length} 个标的，按市值排序</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>标的</th>
                <th>数量</th>
                <th>成本价</th>
                <th>市值</th>
                <th>浮盈亏</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {portfolio!.positions.length === 0 ? (
                <EmptyTableRow colSpan={7} />
              ) : (
                [...portfolio!.positions]
                  .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
                  .map((position) => (
                    <tr key={position.id}>
                      <td>
                        <strong>{position.asset.name}</strong>
                        <span>{position.symbol}</span>
                      </td>
                      <td>{position.quantity}</td>
                      <td>{money.format(position.costPrice)}</td>
                      <td>
                        {position.marketValue === null ? '—' : money.format(position.marketValue)}
                      </td>
                      <td className={cn((position.pnl ?? 0) >= 0 ? 'positive' : 'negative')}>
                        {position.pnl === null ? '—' : money.format(position.pnl)}
                      </td>
                      <td>
                        <Badge
                          className={cn('tag', position.stale && 'warning')}
                          variant="secondary"
                        >
                          {position.stale ? '陈旧' : '最新'}
                        </Badge>
                      </td>
                      <td>
                        <Button
                          className="text-button"
                          size="sm"
                          type="button"
                          variant="link"
                          onClick={() => setDetailPosition(position)}
                        >
                          行情详情
                        </Button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {detailPosition && (
        <MarketDetailDialog position={detailPosition} onClose={() => setDetailPosition(null)} />
      )}
    </>
  );
}
