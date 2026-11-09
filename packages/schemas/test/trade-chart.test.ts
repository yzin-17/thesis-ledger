import { describe, expect, it } from 'vitest';
import { tradeChartQuerySchema, tradeChartResponseSchema } from '../src/trade-chart.js';
import { marketQuoteSymbolSchema } from '../src/market-quote-identity.js';

const request = {
  accountId: '90000000-0000-4000-8000-000000000001',
  mode: 'actual',
  symbol: '000001.OF',
  start: '2026-11-01',
  end: '2026-11-07',
};
describe('基金账本成交图表合同', () => {
  it('只在成交合同内接受完整基金代码，请求和响应身份保持一致', () => {
    expect(tradeChartQuerySchema.parse(request)).toEqual(request);
    expect(
      tradeChartResponseSchema.parse({
        ...request,
        version: 'trade-chart-v1',
        ledgerRevision: '1',
        projectionGeneration: '1',
        generatedAt: '2026-11-07T00:00:00Z',
        status: 'ready',
        markers: [],
        omittedCount: 0,
        unplacedCount: 0,
        unplacedCountScope: 'symbol-all-dates',
      }).symbol,
    ).toBe('000001.OF');
    expect(marketQuoteSymbolSchema.safeParse(request.symbol).success).toBe(false);
  });
  it.each(['000001', '00001.OF', '0000001.OF', '000001.of', '000001.BAD', '00000.HK'])(
    '拒绝非法或不完整代码 %s',
    (symbol) => {
      expect(tradeChartQuerySchema.safeParse({ ...request, symbol }).success).toBe(false);
    },
  );
});
