import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  DataStateBanner,
  FirstRunOnboarding,
  hasConfiguredProviderSetup,
  ImportReview,
  normalizeProviderHealthHistory,
  PortfolioManagement,
  providerCredentialConfiguredAfterSave,
  providerCredentialForSave,
  providerCredentialLabel,
  providerDisplayStatus,
  ProviderSettings,
  replaceProviderRecord,
} from '../src/ui/App.js';
import { Toaster } from '../src/components/ui/toast.js';

const renderWithToast = (node: ReactNode) => renderToStaticMarkup(<Toaster>{node}</Toaster>);

describe('Desktop UI contract', () => {
  it('normalizes legacy health history arrays while supporting paginated responses', () => {
    const legacyPage = normalizeProviderHealthHistory(
      [
        {
          provider: 'dsa',
          state: 'healthy',
          latencyMs: 7,
          checkedAt: '2026-08-16T18:25:25.494Z',
        },
        {
          provider: 'dsa',
          state: 'degraded',
          latencyMs: 3201,
          checkedAt: '2026-08-16T18:20:25.502Z',
        },
      ],
      2,
      1,
    );
    expect(legacyPage).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
      items: [{ state: 'degraded' }],
    });

    expect(
      normalizeProviderHealthHistory(
        { items: [{ provider: 'dsa' }], page: 1, pageSize: 20, total: 1, totalPages: 1 },
        1,
        20,
      ),
    ).toMatchObject({ total: 1, totalPages: 1, items: [{ provider: 'dsa' }] });
  });

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

  it('marks provider onboarding complete from configured data and notification providers', () => {
    expect(
      hasConfiguredProviderSetup([
        {
          enabled: true,
          health: 'healthy',
          credentialConfigured: true,
          capabilities: ['notification', 'quote'],
        },
      ]),
    ).toBe(true);
    expect(
      hasConfiguredProviderSetup([
        {
          enabled: true,
          health: 'healthy',
          credentialConfigured: false,
          capabilities: ['notification', 'quote'],
        },
      ]),
    ).toBe(false);
    expect(
      hasConfiguredProviderSetup([
        {
          enabled: true,
          health: 'healthy',
          credentialConfigured: true,
          capabilities: ['quote'],
        },
      ]),
    ).toBe(false);
  });

  it('shows only the current first-run form content', () => {
    const accountStep = renderWithToast(
      <PortfolioManagement accounts={[]} positions={[]} step="account" onSaved={vi.fn()} />,
    );
    expect(accountStep).toContain('data-management-step="account"');
    expect(accountStep).toContain('<h1 id="portfolio-management-title">账户管理</h1>');
    expect(accountStep).toContain('<div class="mt-6 flex items-center justify-between gap-4">');
    expect(accountStep).toContain('<h2 class="m-0 text-xl font-semibold">已有账户</h2>');
    expect(accountStep).toContain('data-account-sheet-open="false"');
    expect(accountStep).toContain('暂无账户');
    expect(accountStep).not.toContain('<h3>录入持仓</h3>');

    const positionStep = renderWithToast(
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
    expect(positionStep).toContain('data-entry-sheet-open="false"');
    expect(positionStep).not.toContain('<h3>创建账户</h3>');
    expect(positionStep).toContain('<h2 class="m-0 text-xl font-semibold">持仓</h2>');
    expect(positionStep).toContain('+ 添加持仓');
    expect(positionStep).toContain('现金余额');
    expect(positionStep).not.toContain('<form');
  });

  it('keeps account creation separate and presents screenshot import in a sheet', () => {
    const accountStep = renderWithToast(
      <MemoryRouter initialEntries={['/import-review?step=account']}>
        <ImportReview accounts={[]} positions={[]} onPortfolioChanged={vi.fn()} />
      </MemoryRouter>,
    );
    expect(accountStep).toContain('data-import-step="account"');
    expect(accountStep).toContain('<h1 id="portfolio-management-title">账户管理</h1>');
    expect(accountStep).toContain('data-account-sheet-open="false"');
    expect(accountStep).toContain('创建账户');
    expect(accountStep).not.toContain('<h3>录入持仓</h3>');

    const existingAccounts = renderWithToast(
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
        step="account"
        onAccountEntry={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(existingAccounts).toContain('data-account-sheet-open="false"');
    expect(existingAccounts).toContain('已有账户');
    expect(existingAccounts).toContain('示例账户');
    expect(existingAccounts).toContain('录入持仓');

    const positionStep = renderWithToast(
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
    expect(positionStep).toContain('data-entry-sheet-open="false"');
    expect(positionStep).toContain('data-screenshot-sheet-open="false"');
    expect(positionStep).toContain('持仓');
    expect(positionStep).toContain('+ 添加持仓');
    expect(positionStep).toContain('手动录入');
    expect(positionStep).toContain('截图导入');
    expect(positionStep).toContain('账户管理');
    expect(positionStep).toContain('entry-account-meta');
    expect(positionStep).not.toContain('entry-account-meta"><strong>');
    expect(positionStep).not.toContain('<h3>创建账户</h3>');

    const positionPage = renderWithToast(
      <MemoryRouter
        initialEntries={[
          '/position-entry?accountId=account-1&method=manual&step=position&entry=position',
        ]}
      >
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
    expect(positionPage).toContain('data-entry-sheet-open="false"');
    expect(positionPage).toContain('添加持仓');

    const screenshotStep = renderWithToast(
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
    expect(screenshotStep).toContain('data-import-step="position"');
    expect(screenshotStep).toContain('data-screenshot-sheet-open="true"');
    expect(screenshotStep).toContain('持仓');
    expect(screenshotStep).not.toContain('<h3>创建账户</h3>');
    expect(screenshotStep).not.toContain('<h2>截图导入</h2>');
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

  it('keeps provider configuration in a closed drawer on the list view', () => {
    const markup = renderToStaticMarkup(
      <Toaster>
        <ProviderSettings />
      </Toaster>,
    );
    expect(markup).toContain('data-provider-sheet-open="false"');
    expect(markup).toContain('新增或更新 Provider');
    expect(markup).toContain('凭证只显示配置状态，不回显密钥');
    expect(markup).not.toContain('<form');
    expect(markup).not.toContain('凭证引用');
    expect(markup).not.toContain('type="password"');
    expect(markup).toContain('Provider');
    expect(markup).toContain('>提供方</th>');
  });

  it('maps provider health to actionable user-facing statuses', () => {
    expect(
      providerDisplayStatus({ enabled: false, health: 'healthy', credentialConfigured: true }),
    ).toEqual({ label: '已停用', tone: 'neutral' });
    expect(
      providerDisplayStatus({ enabled: true, health: 'unknown', credentialConfigured: false }),
    ).toEqual({ label: '未配置', tone: 'warning' });
    expect(
      providerDisplayStatus({ enabled: true, health: 'unknown', credentialConfigured: true }),
    ).toEqual({ label: '未测试', tone: 'neutral' });
    expect(
      providerDisplayStatus({ enabled: true, health: 'healthy', credentialConfigured: true }),
    ).toEqual({ label: '正常', tone: 'normal' });
    expect(
      providerDisplayStatus({ enabled: true, health: 'down', credentialConfigured: true }),
    ).toEqual({ label: '异常', tone: 'error' });
  });

  it('uses provider-specific credential labels', () => {
    expect(providerCredentialLabel('feishu', 'notification')).toBe('飞书 Webhook');
    expect(providerCredentialLabel('dsa', 'market')).toBe('行情 API Key / Token');
    expect(providerCredentialLabel('openai', 'ai')).toBe('AI API Key / Token');
    expect(providerCredentialLabel('custom', 'other')).toBe('API Key / Token');
  });

  it('saves the exact Webhook value that passed the draft connection test', () => {
    const testedWebhook = 'https://open.feishu.cn/open-apis/bot/v2/hook/tested';
    expect(
      providerCredentialForSave('stale-form-value', {
        token: 'test-token',
        credentialsRef: testedWebhook,
      }),
    ).toBe(testedWebhook);
    expect(providerCredentialForSave('  draft-value  ', null)).toBe('draft-value');
  });

  it('replaces the Provider row immediately with the saved server response', () => {
    expect(
      replaceProviderRecord([{ name: 'feishu', health: 'down', credentialConfigured: false }], {
        name: 'feishu',
        health: 'healthy',
        credentialConfigured: true,
      }),
    ).toEqual([{ name: 'feishu', health: 'healthy', credentialConfigured: true }]);
  });

  it('marks the Provider configured when a successful save response has no JSON body', () => {
    expect(
      providerCredentialConfiguredAfterSave(undefined, 'https://example.test/hook', false),
    ).toBe(true);
    expect(providerCredentialConfiguredAfterSave(undefined, '', true)).toBe(true);
  });
});
