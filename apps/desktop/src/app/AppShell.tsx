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
import { ThemeToggle } from '@/components/theme-toggle';
import { desktopRoutes, type DesktopNavigationView } from '../views.js';

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

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
        <nav id="primary-navigation" aria-label="主导航">
          {desktopRoutes.map(({ view, path, label }) => {
            const Icon = navIcons[view];
            return (
              <NavLink
                key={view}
                to={{ pathname: path, search: location.search }}
                className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                aria-label={label}
              >
                {({ isActive }) => (
                  <>
                    <Icon size={19} weight={isActive ? 'fill' : 'regular'} />
                    <span>{label}</span>
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
          <ThemeToggle />
        </div>
      </aside>
      <main className="content">
        <div className="content-theme-toggle">
          <ThemeToggle />
        </div>
        {children}
      </main>
    </div>
  );
}
