import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import type { DesktopNavigationView } from '../../views.js';

import type { OnboardingNavigationOptions } from './onboarding.types.js';

const resolveCurrentStep = (
  hasAccount: boolean,
  hasPosition: boolean,
  hasProviderSetup: boolean,
  hasRiskRule: boolean,
) => {
  if (!hasAccount) return 1;
  if (!hasPosition) return 2;
  if (!hasProviderSetup) return 3;
  if (!hasRiskRule) return 4;
  return null;
};

function OnboardingStep({
  number,
  complete,
  current,
  title,
  description,
  actions,
}: {
  number: number;
  complete: boolean;
  current: boolean;
  title: string;
  description: string;
  actions: ReactNode;
}) {
  return (
    <li
      className={cn(
        'min-h-40 bg-card p-4 forced-colors:bg-[Canvas] forced-colors:text-[CanvasText] forced-colors:border-[ButtonText]',
        'max-[520px]:min-h-0',
        complete && 'bg-muted',
        current && 'shadow-[inset_0_2px_var(--color-border-strong)]',
      )}
    >
      <span
        className={cn(
          'grid size-7 place-items-center rounded-full border border-input text-xs font-bold text-secondary-foreground',
          complete && 'bg-muted',
          current && 'border-foreground bg-muted text-foreground',
        )}
        aria-hidden="true"
      >
        {complete ? '✓' : number}
      </span>
      <div className="mt-2">
        <strong className="block text-sm font-[650] text-foreground">{title}</strong>
        <p className="mt-2 mb-4 min-h-10 max-[520px]:min-h-0 text-xs leading-[1.55] text-secondary-foreground">
          {description}
        </p>
        {actions}
      </div>
    </li>
  );
}

export function FirstRunOnboarding({
  hasAccount,
  hasPosition = false,
  hasProviderSetup = false,
  hasRiskRule = false,
  onNavigate,
}: {
  hasAccount: boolean;
  hasPosition?: boolean;
  hasProviderSetup?: boolean;
  hasRiskRule?: boolean;
  onNavigate: (view: DesktopNavigationView, options?: OnboardingNavigationOptions) => void;
}) {
  const currentStep = resolveCurrentStep(hasAccount, hasPosition, hasProviderSetup, hasRiskRule);
  if (currentStep === null) return null;

  return (
    <section
      className="mb-4 rounded-md border bg-card p-6 max-[520px]:p-4 forced-colors:bg-[Canvas] forced-colors:text-[CanvasText] forced-colors:border-[ButtonText]"
      aria-labelledby="onboarding-title"
      data-onboarding-step={currentStep}
    >
      <div className="pb-4">
        <p className="mb-2 text-[11px] leading-[1.3] font-[650] tracking-[0.14em] uppercase text-muted-foreground">
          First Run
        </p>
        <h2
          id="onboarding-title"
          className="text-[19px] leading-[1.3] font-semibold tracking-[-0.015em]"
        >
          四步完成第一次闭环
        </h2>
        <p className="mt-2 text-[13px] leading-[1.5] text-muted-foreground">
          按顺序完成账户、持仓、数据源与通知、风险提醒配置。自动化任务可以稍后单独设置；敏感凭证由服务端安全保存，页面不会显示。
        </p>
        <p className="mt-2 text-xs text-muted-foreground">当前步骤 {currentStep} / 4</p>
      </div>
      <ol className="grid grid-cols-4 gap-px overflow-hidden rounded-md border bg-border max-[1024px]:grid-cols-2 max-[520px]:grid-cols-1">
        <OnboardingStep
          number={1}
          complete={hasAccount}
          current={currentStep === 1}
          title="创建账户"
          description={
            hasAccount
              ? '已创建账户，可以继续录入持仓。'
              : '先填写下方账户表单，选择账户类型、模式和币种。'
          }
          actions={
            <Button
              className="secondary"
              type="button"
              variant="outline"
              onClick={() => onNavigate('position-entry', { step: 'account' })}
            >
              {hasAccount ? '管理账户' : '去创建账户'}
            </Button>
          }
        />
        <OnboardingStep
          number={2}
          complete={hasPosition}
          current={currentStep === 2}
          title="录入或导入持仓"
          description={
            hasPosition
              ? '已录入持仓，可以继续配置数据源。'
              : '当前支持手动录入；截图导入暂未开放。'
          }
          actions={
            <Button
              className="secondary"
              type="button"
              variant="outline"
              onClick={() => onNavigate('position-entry', { step: 'position' })}
            >
              资产录入
            </Button>
          }
        />
        <OnboardingStep
          number={3}
          complete={hasProviderSetup}
          current={currentStep === 3}
          title="配置数据源与通知"
          description={
            hasProviderSetup
              ? '数据源和通知已配置；自动化任务可以继续设置。'
              : '至少配置一个行情数据源和一个通知 Provider；自动化任务可以稍后设置。'
          }
          actions={
            <Button
              className="secondary"
              type="button"
              variant="outline"
              onClick={() => onNavigate('providers')}
            >
              打开数据与自动化
            </Button>
          }
        />
        <OnboardingStep
          number={4}
          complete={hasRiskRule}
          current={currentStep === 4}
          title="设置风险规则"
          description={
            hasRiskRule
              ? '已设置风险规则。'
              : '风险提醒用于研究辅助，不代表交易执行保证；通知失败会保留在历史中。'
          }
          actions={
            <Button
              className="secondary"
              type="button"
              variant="outline"
              onClick={() => onNavigate('risk-center')}
            >
              打开风险中心
            </Button>
          }
        />
      </ol>
    </section>
  );
}
