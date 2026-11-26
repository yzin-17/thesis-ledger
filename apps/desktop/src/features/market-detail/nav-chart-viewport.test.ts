import { describe, expect, it } from 'vitest';
import { fundNavHistorySchema } from '@thesis-ledger/schemas';
import { navViewportChange } from './nav-chart-viewport.js';

const history = fundNavHistorySchema.parse([2, 1, 1.5, 3].map((unitNav, index) => ({
  version: 1,
  symbol: '000001.OF',
  navDate: `2026-11-0${index + 1}T00:00:00Z`,
  unitNav,
  provider: 'fixture',
  fetchedAt: '2026-11-04T08:00:00Z',
  freshness: 'delayed',
})));

describe('可视区间净值涨跌幅', () => {
  it('只计算实际可视日期内首尾净值，不使用区间外的极值', () => {
    expect(navViewportChange(history, { from: '2026-11-02', to: '2026-11-03' })).toBe(0.5);
    expect(navViewportChange(history, { from: '2026-11-01', to: '2026-11-02' })).toBe(-0.5);
  });
  it('平盘保留零；空区间、未就绪和零基数返回缺失', () => {
    expect(navViewportChange(history, { from: '2026-11-02', to: '2026-11-02' })).toBe(0);
    expect(navViewportChange(history, { from: '2026-12-01', to: '2026-12-02' })).toBeNull();
    expect(navViewportChange(history, null)).toBeNull();
    expect(navViewportChange([{ ...history[0]!, unitNav: 0 }], { from: '2026-11-01', to: '2026-11-01' })).toBeNull();
  });
});
