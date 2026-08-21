/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Phosphor 条件导出由 tsc 独立校验。 */
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { ChartLineUpIcon } from '@phosphor-icons/react/ChartLineUp';
import { FlaskIcon } from '@phosphor-icons/react/Flask';
import { GearSixIcon } from '@phosphor-icons/react/GearSix';
import { HouseIcon } from '@phosphor-icons/react/House';
import { RobotIcon } from '@phosphor-icons/react/Robot';
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
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">IO</span>
          <span>ThesisLedger</span>
        </div>
        <nav aria-label="主导航">
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
