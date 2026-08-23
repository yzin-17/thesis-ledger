import { cn } from '@/lib/utils';

import {
  AccountManagementSection,
  PositionManagementSection,
} from './PortfolioManagementSections.js';
import type { PortfolioManagementViewProps } from './PortfolioManagementView.types.js';

export type { PortfolioManagementViewProps } from './PortfolioManagementView.types.js';

export function PortfolioManagementView(props: PortfolioManagementViewProps) {
  const { step, accountSheetOpen, positionSheetOpen } = props;
  return (
    <section
      className={cn(step === 'account' ? 'module-page' : 'management')}
      id="portfolio-management"
      aria-labelledby="portfolio-management-title"
      data-management-step={step}
      data-import-step={step === 'account' ? 'account' : undefined}
      data-account-sheet-open={step === 'account' ? String(accountSheetOpen) : undefined}
      data-entry-sheet-open={step === 'position' ? String(positionSheetOpen) : undefined}
    >
      {step === 'account' && (
        <div className="panel-heading">
          <p className="kicker">Account Management</p>
          <div className="entry-page-heading">
            <div>
              <h1 id="portfolio-management-title">账户管理</h1>
              <p className="page-description">
                管理已有账户；账户只描述容器属性，不记录本次持仓录入来源。
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="management-grid single-step">
        {step === 'account' && <AccountManagementSection {...props} />}
        {step === 'position' && <PositionManagementSection {...props} />}
      </div>
    </section>
  );
}
