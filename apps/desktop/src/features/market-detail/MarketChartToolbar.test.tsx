import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarketChartToolbar } from './MarketChartToolbar.js';

describe('MarketChartToolbar', () => {
  it('将控件置于四个带标题的语义组，并以整个组作为响应式换行单元', () => {
    const html = renderToStaticMarkup(
      <MarketChartToolbar
        chartControls={<button>K线</button>}
        rangeControls={<button>3月</button>}
        indicatorControls={<><button>指标设置</button><button>MACD</button><button>RSI</button></>}
        viewControls={<button>全屏</button>}
      />,
    );

    expect(html).toContain('data-market-chart-toolbar-group="图形"');
    expect(html).toContain('data-market-chart-toolbar-group="区间"');
    expect(html).toContain('data-market-chart-toolbar-group="指标"');
    expect(html).toContain('data-market-chart-toolbar-group="视图"');
    expect(html).toMatch(/data-market-chart-toolbar-group="指标"[\s\S]*指标设置[\s\S]*MACD[\s\S]*RSI/);
    expect(html).toContain('flex flex-wrap items-start');
    expect(html).toContain('min-w-max flex-none flex-col');
  });
});
