import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ImportReview } from '../src/features/import/ImportReview.js';
import { FirstRunOnboarding } from '../src/features/onboarding/FirstRunOnboarding.js';
import { ProviderSettings } from '../src/features/providers/ProviderSettings.js';
import { hasConfiguredProviderSetup } from '../src/features/onboarding/onboarding.types.js';
import {
  normalizeProviderHealthHistory,
  providerCredentialConfiguredAfterSave,
  providerCredentialForSave,
  providerCredentialLabel,
  providerDisplayStatus,
  replaceProviderRecord,
} from '../src/features/providers/providers.types.js';
import { PortfolioManagement } from '../src/features/portfolio/PortfolioManagement.js';
import { InstrumentCombobox } from '../src/features/portfolio/InstrumentCombobox.js';
import { DataStateBanner } from '../src/features/shared/DesktopPrimitives.js';
import { DateInput } from '../src/components/ui/date-input.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { FieldLabel } from '../src/components/ui/field.js';
import { Switch, SwitchThumb } from '../src/components/ui/switch.js';
import { Toast, ToastContent, ToastViewport, Toaster } from '../src/components/ui/toast.js';

const renderWithToast = (node: ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Toaster>
        <ConfirmDialogProvider>{node}</ConfirmDialogProvider>
      </Toaster>
    </QueryClientProvider>,
  );
};

type LabelInteractionEvent = {
  preventDefault: () => void;
  target: EventTarget | null;
};

type LabelElementProps = {
  onClick?: (event: LabelInteractionEvent) => void;
  onMouseDown?: (event: LabelInteractionEvent) => void;
  onPointerDown?: (event: LabelInteractionEvent) => void;
};

const desktopSourceDirectory = fileURLToPath(new URL('../src', import.meta.url));

const readDesktopSource = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return readDesktopSource(entryPath);
    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [readFileSync(entryPath, 'utf8')] : [];
  });

describe('Desktop UI contract - onboarding and portfolio', () => {
  it('uses the shared alert dialog for business confirmations', () => {
    const sources = readDesktopSource(desktopSourceDirectory);
    expect(sources.some((source) => source.includes('window.confirm'))).toBe(false);

    const confirmDialogSource = readFileSync(
      new URL('../src/components/ui/confirm-dialog.tsx', import.meta.url),
      'utf8',
    );
    expect(confirmDialogSource).toContain('ConfirmDialogProvider');
    expect(confirmDialogSource).toContain('useConfirmDialog');
    expect(confirmDialogSource).toContain('<AlertDialogTitle>');
    expect(confirmDialogSource).toContain('<AlertDialogDescription>');
    expect(confirmDialogSource).toContain('<AlertDialogClose');
    expect(confirmDialogSource).toContain('variant="outline"');
    expect(confirmDialogSource).toContain("variant={request.options.variant ?? 'default'}");
  });

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
    expect(firstStep).toMatch(/<button[^>]*disabled[^>]*>截图导入（暂未开放）<\/button>/);
  });

  it('removes completed onboarding from the page', () => {
    const complete = renderToStaticMarkup(
      <FirstRunOnboarding
        hasAccount
        hasPosition
        hasProviderSetup
        hasRiskRule
        onNavigate={vi.fn()}
      />,
    );

    expect(complete).toBe('');
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

  it('counts an applied DSA market provider as the data-source half of onboarding', () => {
    const notificationProvider = {
      enabled: true,
      health: 'healthy',
      credentialConfigured: true,
      capabilities: ['notification'],
    };
    const marketData = {
      providers: [
        {
          providerId: 'akshare',
          displayName: 'AKShare',
          version: 1,
          capabilities: { REALTIME_QUOTE: ['STOCK'] },
          configured: true,
          enabled: true,
          credentialConfigured: false,
          requiresCredential: false,
        },
      ],
      policy: {
        revision: 11,
        enabled: true,
        syncState: 'applied' as const,
        routes: { REALTIME_QUOTE: { STOCK: ['akshare'] } },
      },
    };

    expect(hasConfiguredProviderSetup([notificationProvider], marketData)).toBe(true);
    expect(
      hasConfiguredProviderSetup([notificationProvider], {
        ...marketData,
        policy: { ...marketData.policy, syncState: 'pending' },
      }),
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
});

describe('Desktop UI contract - providers and primitives', () => {
  it('guards FieldLabel activation while retaining label semantics and removes native wrappers', () => {
    const labelElement = FieldLabel({
      children: '名称',
      htmlFor: 'label-target',
    }) as ReactElement<LabelElementProps>;
    const preventDefault = vi.fn();
    const labelSurfaceEvent = { preventDefault, target: null };

    labelElement.props.onPointerDown?.(labelSurfaceEvent);
    labelElement.props.onMouseDown?.(labelSurfaceEvent);
    labelElement.props.onClick?.(labelSurfaceEvent);

    expect(preventDefault).toHaveBeenCalledTimes(3);
    expect(
      labelElement.props.onClick?.({
        preventDefault,
        target: { closest: () => ({}) } as EventTarget,
      }),
    ).toBeUndefined();
    expect(preventDefault).toHaveBeenCalledTimes(3);

    const nativeLabelUsages = readDesktopSource(desktopSourceDirectory).filter((source) =>
      /<label\b/i.test(source),
    );
    expect(nativeLabelUsages).toEqual([]);
  });

  it('shared date input normalizes display text and preserves native input props', () => {
    const dateMarkup = renderToStaticMarkup(
      <DateInput
        type="date"
        name="review-start"
        value="2026-09-02"
        min="2026-01-01"
        max="2026-12-31"
        required
        onChange={vi.fn()}
      />,
    );
    const dateTimeMarkup = renderToStaticMarkup(
      <DateInput
        type="datetime-local"
        name="review-at"
        value="2026-09-02T03:04:56"
        step="60"
        aria-invalid
        onChange={vi.fn()}
      />,
    );
    const emptyDateTimeMarkup = renderToStaticMarkup(
      <DateInput type="datetime-local" value="" onChange={vi.fn()} />,
    );

    expect(dateMarkup).toContain('>2026-09-02</span>');
    expect(dateMarkup).toContain('type="date"');
    expect(dateMarkup).toContain('name="review-start"');
    expect(dateMarkup).toContain('min="2026-01-01"');
    expect(dateMarkup).toContain('max="2026-12-31"');
    expect(dateMarkup).toContain('required');
    expect(dateMarkup).toContain('opacity-0');
    expect(dateMarkup).toContain('::-webkit-datetime-edit');
    expect(dateMarkup).toContain('<svg');
    expect(dateTimeMarkup).toContain('>2026-09-02 03:04</span>');
    expect(dateTimeMarkup).toContain('type="datetime-local"');
    expect(dateTimeMarkup).toContain('name="review-at"');
    expect(dateTimeMarkup).toContain('step="60"');
    expect(dateTimeMarkup).toContain('aria-invalid="true"');
    expect(emptyDateTimeMarkup).toContain('>YYYY-MM-DD HH:mm</span>');
  });

  it('风险 Switch 使用圆形滑块并收窄内外间隙', () => {
    const markup = renderToStaticMarkup(
      <Switch variant="risk" checked>
        <SwitchThumb variant="risk" />
      </Switch>,
    );

    expect(markup).toContain('h-6');
    expect(markup).toContain('w-11');
    expect(markup).toContain('cursor-pointer');
    expect(markup).toContain('bg-input');
    expect(markup).not.toContain('bg-muted');
    expect(markup).toContain('p-0.5');
    expect(markup).toContain('size-5');
    expect(markup).toContain('data-checked:translate-x-5');
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

    const idleOpen = renderToStaticMarkup(
      <InstrumentCombobox
        manualEntry={false}
        open
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
    expect(idleOpen).not.toContain('标的搜索结果');

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
    expect(selected).toContain('更换标的');
    expect(selected).not.toContain('当前为');
    expect(selected).toContain('border-border');
    expect(selected).not.toContain('border-brand-soft-border');
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
    expect(viewport).toContain('rounded-2xl');
    expect(notifications).toContain('完成');
    expect(notifications).toContain('data-slot="toast"');
    expect(notifications).toContain('rounded-2xl');
  });
});
