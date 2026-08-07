import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  DataStateBanner,
  FirstRunOnboarding,
  ImportReview,
  PortfolioManagement,
  ProviderSettings,
} from '../src/ui/App.js';

describe('Desktop UI contract', () => {
  it('first-run onboarding keeps the four-step overview visible', () => {
    const firstStep = renderToStaticMarkup(
      <FirstRunOnboarding hasAccount={false} onNavigate={vi.fn()} />,
    );
    expect(firstStep).toContain('data-onboarding-step="1"');
    expect(firstStep).toContain('创建账户');
    expect(firstStep).toContain('录入或导入持仓');
    expect(firstStep).toContain('配置数据源与通知');
    expect(firstStep).toContain('设置风险规则');
    expect(firstStep).toContain('截图导入');
    expect(firstStep.match(/<li/g)).toHaveLength(4);

    const secondStep = renderToStaticMarkup(
      <FirstRunOnboarding hasAccount hasPosition={false} onNavigate={vi.fn()} />,
    );
    expect(secondStep).toContain('data-onboarding-step="2"');
    expect(secondStep).toContain('截图导入');
    expect(secondStep.match(/<li/g)).toHaveLength(4);

    const thirdStep = renderToStaticMarkup(
      <FirstRunOnboarding hasAccount hasPosition hasProviderSetup={false} onNavigate={vi.fn()} />,
    );
    expect(thirdStep).toContain('data-onboarding-step="3"');
    expect(thirdStep).toContain('打开数据与自动化');
    expect(thirdStep).toContain('打开风险中心');
    expect(thirdStep.match(/<li/g)).toHaveLength(4);

    const fourthStep = renderToStaticMarkup(
      <FirstRunOnboarding
        hasAccount
        hasPosition
        hasProviderSetup
        hasRiskRule={false}
        onNavigate={vi.fn()}
      />,
    );
    expect(fourthStep).toContain('data-onboarding-step="4"');
    expect(fourthStep).toContain('不代表交易执行保证');
    expect(fourthStep).toContain('截图导入');
    expect(fourthStep.match(/<li/g)).toHaveLength(4);

    const complete = renderToStaticMarkup(
      <FirstRunOnboarding
        hasAccount
        hasPosition
        hasProviderSetup
        hasRiskRule
        onNavigate={vi.fn()}
      />,
    );
    expect(complete).toContain('data-onboarding-step="complete"');
    expect(complete).toContain('四步已完成');
    expect(complete.match(/<li/g)).toHaveLength(4);
  });

  it('shows only the current first-run form content', () => {
    const accountStep = renderToStaticMarkup(
      <PortfolioManagement accounts={[]} positions={[]} step="account" onSaved={vi.fn()} />,
    );
    expect(accountStep).toContain('data-management-step="account"');
    expect(accountStep).toContain('<h3>创建账户</h3>');
    expect(accountStep).not.toContain('<h3>录入持仓</h3>');

    const positionStep = renderToStaticMarkup(
      <PortfolioManagement
        accounts={[
          {
            id: 'account-1',
            name: '示例账户',
            institution: '测试机构',
            type: 'securities',
            mode: 'actual',
            currency: 'CNY',
          },
        ]}
        positions={[]}
        step="position"
        onSaved={vi.fn()}
      />,
    );
    expect(positionStep).toContain('data-management-step="position"');
    expect(positionStep).not.toContain('<h3>创建账户</h3>');
    expect(positionStep).toContain('<h3>录入持仓</h3>');
  });

  it('keeps account creation separate and presents manual/screenshot as parallel modes', () => {
    const accountStep = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/import-review?step=account']}>
        <ImportReview accounts={[]} positions={[]} onPortfolioChanged={vi.fn()} />
      </MemoryRouter>,
    );
    expect(accountStep).toContain('data-import-step="account"');
    expect(accountStep).toContain('<h3>创建账户</h3>');
    expect(accountStep).not.toContain('<h3>录入持仓</h3>');

    const positionStep = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/import-review?step=position']}>
        <ImportReview
          accounts={[
            {
              id: 'account-1',
              name: '示例账户',
              institution: '测试机构',
              type: 'securities',
              mode: 'actual',
              currency: 'CNY',
            },
          ]}
          positions={[]}
          onPortfolioChanged={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(positionStep).toContain('data-import-step="position"');
    expect(positionStep).toContain('<h3>录入持仓</h3>');
    expect(positionStep).toContain('手动录入');
    expect(positionStep).toContain('截图导入');
    expect(positionStep).toContain('账户管理');
    expect(positionStep).not.toContain('<h3>创建账户</h3>');

    const screenshotStep = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/import-review?step=screenshot']}>
        <ImportReview
          accounts={[
            {
              id: 'account-1',
              name: '示例账户',
              institution: '测试机构',
              type: 'securities',
              mode: 'actual',
              currency: 'CNY',
            },
          ]}
          positions={[
            {
              id: 'position-1',
              accountId: 'account-1',
              symbol: '600519.SH',
              quantity: 100,
              costPrice: 1,
              marketValue: null,
              pnl: null,
              stale: true,
              asset: { name: '贵州茅台' },
            },
          ]}
          onPortfolioChanged={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screenshotStep).toContain('data-import-step="screenshot"');
    expect(screenshotStep).toContain('<h2>截图导入</h2>');
    expect(screenshotStep).not.toContain('<h3>创建账户</h3>');
    expect(screenshotStep).not.toContain('<h3>录入持仓</h3>');
  });

  it('renders every shared data state with an accessible status region', () => {
    for (const state of ['loading', 'empty', 'error', 'stale'] as const) {
      const markup = renderToStaticMarkup(<DataStateBanner state={state} />);
      expect(markup).toContain('role="status"');
      expect(markup).toContain(`data-state-banner ${state}`);
    }
  });

  it('keeps ready quiet and exposes loading/retry semantics for injected states', () => {
    expect(renderToStaticMarkup(<DataStateBanner state="ready" />)).toBe('');
    const loading = renderToStaticMarkup(<DataStateBanner state="loading" />);
    expect(loading).toContain('aria-busy="true"');
    const retry = renderToStaticMarkup(<DataStateBanner state="error" onRetry={() => undefined} />);
    expect(retry).toContain('重新加载');
  });

  it('keeps provider credentials write-only in the configuration form', () => {
    const markup = renderToStaticMarkup(<ProviderSettings />);
    expect(markup).toContain('凭证引用');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('提交后不再显示');
    expect(markup).toContain('Provider');
  });
});
