import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { marketDetailResponseSchema } from '@thesis-ledger/schemas';
import { BarsSection } from './MarketDetailSections.js';

describe('行情空分段', () => {
  it.each([undefined, null, []])('合同允许的空数据 %j 只渲染空态', (data) => {
    const response = marketDetailResponseSchema.parse({
      contractVersion: 3,
      symbol: '159516.SZ',
      assetType: 'ETF',
      identity: { source: 'symbol', status: 'confirmed' },
      requested: ['bars'],
      capabilities: { supported: ['bars'], unsupported: [] },
      limits: { bars: 90, nav: 90 },
      sections: { bars: { capability: 'bars', status: 'empty', data } },
      dependencies: {},
      requestId: 'controlled-empty-section',
      generatedAt: '2026-10-06T00:00:00Z',
    });
    const html = renderToStaticMarkup(
      <BarsSection section={response.sections.bars!} onRetry={vi.fn()} retrying={false} />,
    );
    expect(html).toContain('当前没有可用行情。');
    expect(html).toContain('data-section-status="empty"');
    expect(html).toContain('行情数据');
    expect(html).not.toContain('最近日线');
    expect(html).not.toContain('data-market-price-chart');
  });
});
