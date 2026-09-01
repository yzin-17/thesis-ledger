import { cn } from '@/lib/utils';

import {
  AccountManagementSection,
  PositionManagementSection,
} from './PortfolioManagementSections.js';
import type { PortfolioManagementViewProps } from './PortfolioManagementView.types.js';

export type { PortfolioManagementViewProps } from './PortfolioManagementView.types.js';

export function PortfolioManagementView(props: PortfolioManagementViewProps) {
  const {
    step,
    embedded = false,
    accountFormInline = false,
    accountSheetOpen,
    positionSheetOpen,
  } = props;
  let sectionClassName = 'management';
  if (step === 'account') {
    sectionClassName = accountFormInline
      ? 'module-page flex min-h-0 flex-1 flex-col'
      : 'module-page';
  } else if (embedded) sectionClassName = 'flex flex-col gap-4';

  return (
    <section
      className={cn(sectionClassName)}
      id="portfolio-management"
      aria-labelledby="portfolio-management-title"
      data-management-step={step}
      data-import-step={step === 'account' ? 'account' : undefined}
      data-account-sheet-open={step === 'account' ? String(accountSheetOpen) : undefined}
      data-entry-sheet-open={step === 'position' ? String(positionSheetOpen) : undefined}
    >
      {step === 'account' && !accountFormInline && (
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
      <div className={cn('management-grid single-step', accountFormInline && 'min-h-0 flex-1')}>
        {step === 'account' && <AccountManagementSection {...props} />}
        {step === 'position' && <PositionManagementSection {...props} />}
      </div>
    </section>
  );
}
