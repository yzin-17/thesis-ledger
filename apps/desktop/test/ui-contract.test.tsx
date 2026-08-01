import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DataStateBanner, FirstRunOnboarding, ProviderSettings } from '../src/ui/App.js';

describe('Desktop UI contract', () => {
  it('first-run onboarding covers the four basic setup steps and safety boundary', () => {
    const markup = renderToStaticMarkup(
      <FirstRunOnboarding hasAccount={false} onNavigate={vi.fn()} />,
    );

    expect(markup).toContain('四步完成第一次闭环');
    expect(markup).toContain('创建账户');
    expect(markup).toContain('截图导入');
    expect(markup).toContain('敏感凭证由服务端安全保存');
    expect(markup).toContain('不代表交易执行保证');
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
