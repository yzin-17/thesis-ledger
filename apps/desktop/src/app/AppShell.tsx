import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { ChartLineUpIcon } from '@phosphor-icons/react/ChartLineUp';
import { FlaskIcon } from '@phosphor-icons/react/Flask';
import { GearSixIcon } from '@phosphor-icons/react/GearSix';
import { HouseIcon } from '@phosphor-icons/react/House';
import { RobotIcon } from '@phosphor-icons/react/Robot';
import { SidebarSimpleIcon } from '@phosphor-icons/react/SidebarSimple';
import { ShieldCheckIcon } from '@phosphor-icons/react/ShieldCheck';
import { StrategyIcon } from '@phosphor-icons/react/Strategy';
import { UploadSimpleIcon } from '@phosphor-icons/react/UploadSimple';
import { MarketColorMenu } from '@/components/market-color-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import { desktopRoutes, type DesktopNavigationView } from '../views.js';
import { PortfolioModeSwitch } from '../features/shared/PortfolioModeSwitch.js';
import { usePortfolioMode } from '../features/portfolio/portfolio-mode-context.js';

const navIcons: Record<DesktopNavigationView, typeof HouseIcon> = {
  portfolio: HouseIcon,
  'position-entry': UploadSimpleIcon,
  'risk-center': ShieldCheckIcon,
  performance: ChartLineUpIcon,
  strategy: StrategyIcon,
  journal: FlaskIcon,
  'ai-chat': RobotIcon,
  providers: GearSixIcon,
  'market-data': ChartLineUpIcon,
};
const compactNavLabels: Record<DesktopNavigationView, string> = {
  portfolio: '组合', 'position-entry': '账户', performance: '收益', 'risk-center': '风险',
  strategy: '策略', journal: '复盘', 'ai-chat': '研究', providers: '数据', 'market-data': '行情',
};

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { mode, busy, changeMode } = usePortfolioMode();
  const nextSidebarState = sidebarCollapsed ? '展开' : '收起';
  return (
    <div className="app-shell" data-sidebar-collapsed={sidebarCollapsed}>
      <aside className="sidebar" data-collapsed={sidebarCollapsed}>
        <div className="sidebar-head">
          <div className="brand">
            <span className="brand-mark">IO</span>
            <span>ThesisLedger</span>
          </div>
          <button
            type="button"
            className="sidebar-collapse"
            aria-label={`${nextSidebarState}左侧导航`}
            aria-expanded={!sidebarCollapsed}
            aria-controls="primary-navigation"
            title={`${nextSidebarState}左侧导航`}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            <SidebarSimpleIcon size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mb-4 flex px-2 [@media(max-width:800px)]:hidden">
          <PortfolioModeSwitch mode={mode} onModeChange={(next) => void changeMode(next)} disabled={busy} compact={sidebarCollapsed} ariaLabel="全局账户模式" />
        </div>
        <nav id="primary-navigation" aria-label="主导航">
          {desktopRoutes.map(({ view, path, label }) => {
            const Icon = navIcons[view];
            return (
              <NavLink
                key={view}
                to={{ pathname: path, search: location.search }}
                className={({ isActive }) => cn('nav-item max-[800px]:flex-col max-[800px]:gap-1', isActive && 'active')}
                aria-label={label}
              >
                {({ isActive }) => (
                  <>
                    <Icon size={19} weight={isActive ? 'fill' : 'regular'} />
                    <span>{label}</span>
                    <small className="hidden text-[10px] whitespace-nowrap max-[800px]:block">{compactNavLabels[view]}</small>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <span className="connection-status">
            <span className="status-dot" />
            系统已连接
          </span>
          <div
            className={cn('flex items-center gap-1.5', sidebarCollapsed ? 'flex-col' : 'ml-auto')}
          >
            <ThemeToggle />
            <MarketColorMenu />
          </div>
        </div>
      </aside>
      <main className="content">
        <div className="mb-5 hidden flex-wrap items-start justify-between gap-3 border-b pb-3 [@media(max-width:800px)]:flex">
          <PortfolioModeSwitch mode={mode} onModeChange={(next) => void changeMode(next)} disabled={busy} ariaLabel="全局账户模式" />
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <MarketColorMenu />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
