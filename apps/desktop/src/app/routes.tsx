import {
  ArenaWeekPage, WatchlistPage, AccountDataPage, AiChat, JournalReviewWorkspace,
  PerformanceWorkspace, ProviderSettings, RiskCenter, StrategyDashboard, MarketDataPage,
} from './deferred-pages.js';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useEffect } from 'react';
import { desktopPathForView, type DesktopNavigationView } from '../views.js';
import {
  isPortfolioSummaryConsumerRoute,
  usePortfolioShellQueries,
} from '../features/portfolio/portfolio.queries.js';
import { usePortfolioMode } from '../features/portfolio/portfolio-mode-context.js';
import { AccountModeLinkNotice } from '../features/portfolio/AccountModeLinkNotice.js';
import { LegacyImportReviewRedirect } from '../features/import/LegacyImportReviewRedirect.js';
import { performanceWorkspaceTab } from './performance-workspace-tabs.js';
import type { PortfolioTradeReviewTarget } from '../features/portfolio/portfolio-trade.types.js';

type ImportStep = 'account' | 'position' | 'screenshot';
type NavigationOptions = { step?: ImportStep };

export function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { mode: portfolioMode } = usePortfolioMode();
  const activePerformanceTab = performanceWorkspaceTab(location.search);
  const requestedPortfolioAccountId =
    location.pathname === '/performance' || location.pathname === '/portfolio'
      ? (new URLSearchParams(location.search).get('accountId') ?? '')
      : '';
  const {
    state,
    portfolio,
    accounts,
    accountId: portfolioAccountId,
    accountsReady,
    accountsAvailable,
    accountsPending,
    accountsError,
    refreshing,
    refresh,
  } = usePortfolioShellQueries(portfolioMode, {
    enableValuation:
      isPortfolioSummaryConsumerRoute(location.pathname) &&
      (location.pathname !== '/performance' ||
        activePerformanceTab === 'overview' ||
        activePerformanceTab === 'analysis'),
    accountId: requestedPortfolioAccountId,
  });

  useEffect(() => {
    if (accountsReady && requestedPortfolioAccountId && !portfolioAccountId) {
      const params = new URLSearchParams(location.search);
      params.delete('accountId');
      void navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    }
  }, [
    accountsReady,
    requestedPortfolioAccountId,
    portfolioAccountId,
    location.pathname,
    location.search,
    navigate,
  ]);

  const navigateTo = (nextView: DesktopNavigationView, options?: NavigationOptions) => {
    const path = desktopPathForView(nextView);
    if (!path) return;
    const params = new URLSearchParams(location.search);
    if (
      nextView === 'portfolio' ||
      nextView === 'performance' ||
      location.pathname === '/performance'
    )
      params.delete('tab');
    if (nextView === 'position-entry' && options?.step === 'account') {
      params.set('setup', '1');
      params.delete('tab');
      params.delete('entry');
    } else if (nextView === 'position-entry' && options?.step === 'position') {
      params.set('tab', 'positions');
      params.delete('setup');
      params.delete('entry');
    } else if (nextView === 'position-entry' && options?.step === 'screenshot') {
      params.set('tab', 'positions');
      params.set('entry', 'screenshot');
      params.delete('setup');
    }
    if (nextView !== 'position-entry') {
      params.delete('step');
      params.delete('accountId');
      params.delete('entry');
      params.delete('setup');
    }
    const search = params.toString();
    void navigate({ pathname: path, ...(search ? { search: `?${search}` } : {}) });
  };

  return (
    <>
      <AccountModeLinkNotice accounts={accounts} mode={portfolioMode} />
      <Routes>
        <Route path="/" element={<Navigate to="/performance" replace />} />
        <Route
          path="/portfolio"
          element={<Navigate to={{ pathname: '/performance', search: location.search }} replace />}
        />
        <Route
          path="/performance"
          element={
            <PerformanceWorkspace
              accountsReady={accountsReady || accountsAvailable}
              accountsError={accountsError}
              tab={activePerformanceTab}
              onTabChange={(tab) => {
                const params = new URLSearchParams(location.search);
                params.set('tab', tab);
                void navigate({ pathname: '/performance', search: params.toString() });
              }}
              state={state}
              portfolio={portfolio}
              accounts={accounts}
              accountId={portfolioAccountId}
              onAccountChange={(accountId) => {
                const params = new URLSearchParams(location.search);
                if (accountId) params.set('accountId', accountId);
                else params.delete('accountId');
                void navigate({ pathname: '/performance', search: params.toString() });
              }}
              mode={portfolioMode}
              onRetry={refresh}
              refreshing={refreshing}
              onNavigate={navigateTo}
              onOpenReview={(target: PortfolioTradeReviewTarget) => {
                const params = new URLSearchParams({
                  accountId: target.accountId,
                  tradeId: target.tradeId,
                  reviewObjectType: target.reviewObjectType,
                  mode: portfolioMode,
                  ...(target.closeSliceId ? { closeSliceId: target.closeSliceId } : {}),
                });
                void navigate({ pathname: '/journal', search: `?${params.toString()}` });
              }}
            />
          }
        />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/import-review" element={<LegacyImportReviewRedirect />} />
        <Route path="/position-entry" element={<LegacyImportReviewRedirect />} />
        <Route
          path="/accounts"
          element={
            <AccountDataPage
              accounts={accounts}
              accountsReady={accountsReady}
              accountsPending={accountsPending}
              accountsError={accountsError}
              mode={portfolioMode}
              onRetryAccounts={() => void refresh()}
            />
          }
        />
        <Route
          path="/risk-center"
          element={
            <RiskCenter
              accounts={accounts}
              portfolio={portfolio}
              portfolioState={state}
              mode={portfolioMode}
            />
          }
        />
        <Route path="/journal/model-weeklies/:match?/:id?" element={<ArenaWeekPage/>}/>
        <Route path="/strategy/*" element={<StrategyDashboard />} />
        <Route
          path="/journal"
          element={
            <JournalReviewWorkspace
              key={portfolioMode}
              mode={portfolioMode}
              accounts={accounts}
              accountsReady={accountsReady}
              accountsPending={accountsPending}
              accountsError={accountsError}
              onRetry={() => void refresh()}
              onNavigateAccounts={() => void navigate('/accounts')}
              onNavigatePosition={() => void navigate('/position-entry')}
              onAccountChange={(accountId) => {
                const params = new URLSearchParams(location.search);
                for (const key of [
                  'mode',
                  'tradeId',
                  'reviewObjectId',
                  'reviewObjectType',
                  'closeSliceId',
                ])
                  params.delete(key);
                params.set('accountId', accountId);
                void navigate({ pathname: '/journal', search: `?${params.toString()}` });
              }}
              search={location.search}
            />
          }
        />
        <Route path="/ai-chat" element={<AiChat />} />
        <Route path="/providers" element={<ProviderSettings />} />
        <Route path="/market-data" element={<MarketDataPage />} />
        <Route path="*" element={<Navigate to="/performance" replace />} />
      </Routes>
    </>
  );
}
