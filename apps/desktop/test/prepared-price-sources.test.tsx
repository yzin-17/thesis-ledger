import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PreparedPriceSources } from '../src/features/strategy/PreparedPriceSources';

const value = () => ({
  runConfig: { priceResearch: { actualPriceWindow: {} } },
  actualSource: { provenance: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 } },
  actualPriceSource: {
    provenance: { providerId: 'hithink', upstreamSource: 'hithink-financial-api', routeIndex: 1 },
  },
});
describe('准备结果的冻结价格来源', () => {
  it('分别展示提供方和独立主备索引', () => {
    const html = renderToStaticMarkup(<PreparedPriceSources value={value() as never} />);
    expect(html).toContain('后复权来源：futu / futu · 主源');
    expect(html).toContain('不复权来源：hithink / hithink-financial-api · 备用源');
  });
  it('旧响应缺少原价来源时明确提示，不猜测为后复权提供方', () => {
    const input = { ...value(), actualPriceSource: undefined };
    const html = renderToStaticMarkup(<PreparedPriceSources value={input as never} />);
    expect(html).toContain('不复权来源未返回，请重新准备');
    expect(html).not.toContain('不复权来源：futu');
  });
  it('未规划原价时保留普通执行来源含义', () => {
    const input = { ...value(), runConfig: {}, actualPriceSource: undefined };
    const html = renderToStaticMarkup(<PreparedPriceSources value={input as never} />);
    expect(html).toContain('实际来源：futu');
    expect(html).not.toContain('不复权');
  });
});
