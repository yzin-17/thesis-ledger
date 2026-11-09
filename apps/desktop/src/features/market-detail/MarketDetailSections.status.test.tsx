import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MarketDisplayDetailSection } from '@thesis-ledger/api-client';
import { BarsSection, ChipSection, FundNavHistorySection, FundNavSection, QuoteSection } from './MarketDetailSections.js';

describe('行情分段不可用状态', () => {
  it.each([
    ['quote', QuoteSection], ['bars', BarsSection], ['chip', ChipSection],
    ['fund-nav', FundNavSection], ['fund-nav-history', FundNavHistorySection],
  ] as const)('%s 未启用时显示错误色并隐藏重试', (capability, Component) => {
    const section = { capability, status: 'unavailable', error: {
      code: 'capability_not_enabled', message: '当前数据策略未启用该行情能力。',
      diagnosticId: 'controlled-disabled-section', requestId: 'controlled-request',
    } } as MarketDisplayDetailSection;
    const html = renderToStaticMarkup(<Component section={section} onRetry={vi.fn()} retrying={false} />);
    expect(html).toContain('data-variant="destructive"');
    expect(html).toContain('当前数据策略未启用该行情能力。');
    expect(html).toContain('controlled-disabled-section');
    expect(html).not.toContain('重试');
    expect(html).not.toContain('class="tag');
  });

  it.each(['market_data_timeout', 'market_data_unavailable', 'provider_policy_unavailable'])('%s 保留重试入口', code => {
    const section = { capability: 'chip', status: 'unavailable', error: {
      code, message: '读取暂时失败。', diagnosticId: 'controlled-transient-section', requestId: 'controlled-request',
    } } as MarketDisplayDetailSection;
    const html = renderToStaticMarkup(<ChipSection section={section} onRetry={vi.fn()} retrying={false} />);
    expect(html).toContain('data-variant="destructive"');
    expect(html).toContain('重试');
  });
});
