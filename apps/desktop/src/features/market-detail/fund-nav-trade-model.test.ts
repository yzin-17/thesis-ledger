import { describe, expect, it } from 'vitest';
import type { FundNavHistory, TradeChartMarker } from '@thesis-ledger/schemas';
import { fundNavTradeGroups } from './fund-nav-trade-model.js';

const history = ['2026-11-02', '2026-11-04'].map((navDate) => ({
  navDate: `${navDate}T00:00:00Z`,
})) as FundNavHistory;
const marker = (change: Partial<TradeChartMarker> = {}): TradeChartMarker => ({
  id: 'buy:1',
  eventId: 'e1',
  factId: 'f1',
  side: 'buy',
  tradingDate: '2026-11-02',
  occurredAt: '2026-11-02T00:00:00Z',
  timePrecision: 'DATE',
  currency: 'CNY',
  quantity: '9007199254740993.000000000000000001',
  price: '0.000000000000000001',
  ...change,
});
describe('基金成交与净值日期归位', () => {
  it('同日买卖分组，多笔买入保留各自身份；卖出分摊精确合并且不修改输入', () => {
    const sell = marker({ id: 'sell:1', side: 'sell', eventId: 'es', factId: 'fs' });
    const other = marker({ id: 'buy:2', eventId: 'e2', factId: 'f2', quantity: '2' });
    const source = [
      marker(),
      sell,
      { ...sell, id: 'sell:2', quantity: '0.000000000000000009' },
      other,
    ];
    const before = JSON.stringify(source);
    const result = fundNavTradeGroups(history, source);
    expect(result.groups.map((group) => [group.date, group.side, group.trades.length])).toEqual([
      ['2026-11-02', 'buy', 2],
      ['2026-11-02', 'sell', 1],
    ]);
    expect(result.groups[1]!.trades[0]).toMatchObject({
      quantity: '9007199254740993.00000000000000001',
      price: sell.price,
      timePrecision: 'DATE',
    });
    expect(JSON.stringify(source)).toBe(before);
  });
  it('净值缺失日或范围外成交不向前后日期平移', () => {
    const result = fundNavTradeGroups(history, [
      marker({ tradingDate: '2026-11-03' }),
      marker({ tradingDate: '2026-10-01' }),
    ]);
    expect(result).toEqual({ groups: [], unmatched: 2 });
  });
  it('不同价格、币种或日期的记录不合并成同一成交', () => {
    const result = fundNavTradeGroups(history, [
      marker(),
      marker({ id: '2', price: '1' }),
      marker({ id: '3', currency: 'USD' }),
      marker({ id: '4', tradingDate: '2026-11-04' }),
    ]);
    expect(result.groups.map((group) => group.trades.length)).toEqual([3, 1]);
  });
});
