import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  DataStateBanner,
  FirstRunOnboarding,
  hasConfiguredProviderSetup,
  InstrumentCombobox,
  ImportReview,
  normalizeProviderHealthHistory,
  PortfolioManagement,
  providerCredentialConfiguredAfterSave,
  providerCredentialForSave,
  providerCredentialLabel,
  providerDisplayStatus,
  ProviderSettings,
  replaceProviderRecord,
} from '../src/features/legacy-pages.js';
import { Toast, ToastContent, ToastViewport, Toaster } from '../src/components/ui/toast.js';

const renderWithToast = (node: ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Toaster>{node}</Toaster>
    </QueryClientProvider>,
  );
};

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
    expect(firstStep.match(/<li/g)).toHaveLength(4);
  });

  it('requires a credentialed provider that covers data and notification onboarding', () => {
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

  it('renders portfolio feature state directly without the App compatibility barrel', () => {
    const accountStep = renderWithToast(
      <PortfolioManagement accounts={[]} positions={[]} step="account" onSaved={vi.fn()} />,
    );
    expect(accountStep).toContain('data-management-step="account"');
    expect(accountStep).toContain('账户管理');
    expect(accountStep).toContain('已有账户');

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
    expect(positionStep).toContain('+ 添加持仓');
    expect(positionStep).toContain('现金余额');
  });

  it('renders instrument search and selected instrument state directly', () => {
    const initial = renderToStaticMarkup(
      <InstrumentCombobox
        manualEntry={false}
        open={false}
        query=""
        results={[]}
        searchState="idle"
        selectedInstrument={null}
        busy={false}
        onClearSelection={vi.fn()}
        onManualEntry={vi.fn()}
        onOpenChange={vi.fn()}
        onQueryChange={vi.fn()}
        onSelect={vi.fn()}
        onStartSearch={vi.fn()}
      />,
    );
    expect(initial).toContain('搜索代码或名称');
    expect(initial).toContain('aria-busy="false"');

    const selected = renderToStaticMarkup(
      <InstrumentCombobox
        manualEntry={false}
        open={false}
        query="510300.SH"
        results={[]}
        searchState="selected"
        selectedInstrument={{
          id: 'instrument-1',
          symbol: '510300.SH',
          canonicalCode: '510300',
          instrumentType: 'ETF',
          market: 'SH',
          displayName: '沪深300ETF',
          confirmable: true,
        }}
        busy={false}
        onClearSelection={vi.fn()}
        onManualEntry={vi.fn()}
        onOpenChange={vi.fn()}
        onQueryChange={vi.fn()}
        onSelect={vi.fn()}
        onStartSearch={vi.fn()}
      />,
    );
    expect(selected).toContain('沪深300ETF');
    expect(selected).toContain('510300.SH');
    expect(selected).toContain('ETF · 上海证券交易所');
  });

  it('renders import review directly with its router context', () => {
    const markup = renderWithToast(
      <MemoryRouter initialEntries={['/import-review?step=account']}>
        <ImportReview accounts={[]} positions={[]} onPortfolioChanged={vi.fn()} />
      </MemoryRouter>,
    );
    expect(markup).toContain('data-import-step="account"');
    expect(markup).toContain('创建账户');
  });

  it('keeps provider credential helper semantics stable', () => {
    const testedWebhook = 'https://open.feishu.cn/open-apis/bot/v2/hook/tested';
    expect(
      providerCredentialForSave('stale-form-value', {
        token: 'test-token',
        credentialsRef: testedWebhook,
      }),
    ).toBe(testedWebhook);
    expect(providerCredentialForSave('  draft-value  ', null)).toBe('draft-value');
    expect(
      providerCredentialConfiguredAfterSave(undefined, 'https://example.test/hook', false),
    ).toBe(true);
    expect(providerCredentialConfiguredAfterSave(undefined, '', true)).toBe(true);
    expect(providerCredentialLabel('feishu', 'notification')).toBe('飞书 Webhook');
    expect(
      providerDisplayStatus({ enabled: true, health: 'healthy', credentialConfigured: true }),
    ).toEqual({ label: '正常', tone: 'normal' });
    expect(
      replaceProviderRecord([{ name: 'feishu', health: 'down', credentialConfigured: false }], {
        name: 'feishu',
        health: 'healthy',
        credentialConfigured: true,
      }),
    ).toEqual([{ name: 'feishu', health: 'healthy', credentialConfigured: true }]);
  });

  it('renders provider settings and data state banners directly from feature module', () => {
    const providerMarkup = renderWithToast(<ProviderSettings />);
    expect(providerMarkup).toContain('数据与自动化');
    expect(providerMarkup).toContain('新增或更新 Provider');
    expect(providerMarkup).toContain('>提供方</th>');

    const bannerMarkup = renderToStaticMarkup(
      <DataStateBanner state="stale" description="等待刷新" />,
    );
    expect(bannerMarkup).toContain('数据可能陈旧');
    expect(bannerMarkup).toContain('等待刷新');
    expect(bannerMarkup).toContain('role="status"');
    expect(bannerMarkup).toContain('data-state-banner stale');
  });

  it('renders toast primitives inside the toast provider', () => {
    const viewport = renderWithToast(<ToastViewport />);
    const notifications = renderWithToast(
      <Toast toast={{ id: 'toast-1', title: '完成', type: 'success' }}>
        <ToastContent>完成</ToastContent>
      </Toast>,
    );
    expect(viewport).toContain('flex-col');
    expect(notifications).toContain('完成');
    expect(notifications).toContain('data-slot="toast"');
  });
});
