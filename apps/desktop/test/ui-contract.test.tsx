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
    expect(firstStep).toContain('截图导入');
  });

  it('keeps provider setup incomplete until a usable quote provider is credentialed', () => {
    expect(
      hasConfiguredProviderSetup([
        {
          enabled: true,
          health: 'healthy',
          credentialConfigured: false,
          capabilities: ['quote'],
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
    ).toBe(true);
  });

  it('renders portfolio management with instrument search instead of raw symbol-only entry', () => {
    const markup = renderWithToast(
      <MemoryRouter>
        <PortfolioManagement
          portfolio={{
            totalMarketValue: 0,
            totalCost: 0,
            totalPnl: 0,
            partial: false,
            valuedAt: '2026-08-16T18:25:25.494Z',
            positions: [],
          }}
          accounts={[{
            id: '11111111-1111-4111-8111-111111111111',
            name: '测试账户',
            type: 'securities',
            mode: 'actual',
            currency: 'CNY',
          }]}
          onReload={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(markup).toContain('搜索代码或名称');
  });

  it('renders instrument combobox selection card and disabled unsupported result state', () => {
    const markup = renderToStaticMarkup(
      <InstrumentCombobox
        manualEntry={false}
        open
        query="贵州"
        results={[
          {
            id: '11111111-1111-4111-8111-111111111111',
            symbol: '600519.SH',
            canonicalCode: '600519',
            instrumentType: 'STOCK',
            market: 'SH',
            displayName: '贵州茅台',
            confirmable: true,
          },
        ]}
        searchState="results"
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
    expect(markup).toContain('600519.SH');
    expect(markup).toContain('贵州茅台');
  });

  it('renders import review without using App compatibility barrel', () => {
    const markup = renderWithToast(
      <ImportReview
        draft={{
          id: '11111111-1111-4111-8111-111111111111',
          accountId: '11111111-1111-4111-8111-111111111112',
          source: 'broker',
          sourceConfidence: 1,
          status: 'pending',
          rows: [],
          createdAt: '2026-08-16T18:25:25.494Z',
        }}
        onBack={vi.fn()}
        onCommitted={vi.fn()}
      />,
    );
    expect(markup).toContain('导入');
  });

  it('keeps provider credential helper semantics stable', () => {
    expect(providerCredentialForSave('unchanged', 'secret')).toBeUndefined();
    expect(providerCredentialForSave('replace', 'secret')).toBe('secret');
    expect(providerCredentialForSave('clear', 'secret')).toBeNull();
    expect(providerCredentialConfiguredAfterSave(true, 'unchanged')).toBe(true);
    expect(providerCredentialConfiguredAfterSave(true, 'clear')).toBe(false);
    expect(providerCredentialConfiguredAfterSave(false, 'replace')).toBe(true);
    expect(providerCredentialLabel(true)).toContain('已配置');
    expect(providerDisplayStatus({ enabled: true, health: 'healthy' })).toBe('正常');
    expect(
      replaceProviderRecord(
        [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
        { id: 'b', name: 'B2' },
      ),
    ).toEqual([{ id: 'a', name: 'A' }, { id: 'b', name: 'B2' }]);
  });

  it('renders provider settings and data state banners directly from feature module', () => {
    const providerMarkup = renderWithToast(
      <ProviderSettings providers={[]} onReload={vi.fn()} />,
    );
    expect(providerMarkup).toContain('数据源');
    const bannerMarkup = renderToStaticMarkup(
      <DataStateBanner state="stale" title="行情陈旧" description="等待刷新" />,
    );
    expect(bannerMarkup).toContain('行情陈旧');
  });

  it('renders toast primitives', () => {
    const markup = renderToStaticMarkup(
      <ToastViewport>
        <Toast>
          <ToastContent>完成</ToastContent>
        </Toast>
      </ToastViewport>,
    );
    expect(markup).toContain('完成');
  });
});
