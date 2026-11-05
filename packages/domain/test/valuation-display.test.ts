import { expect, it } from 'vitest';
import { portfolioValuationNotice, valuationPositionLabel } from '../src/valuation-display.js';
const valid = { marketPrice: 0.895, marketValue: 80.55, stale: false };
it.each([
  ['not_selected', '路由尚未配置'], ['disabled', '功能已关闭'],
  ['not_eligible', '来源当前不可用'], ['unavailable', '价格暂不可用'],
] as const)('缺价格 %s 与陈旧值区分', (availabilityReason, description) => {
  const position = { ...valid, marketPrice: null, marketValue: null, stale: true, availabilityReason };
  const result = portfolioValuationNotice({ partial: true, positions: [position] });
  expect(result?.title).toBe('估值不完整'); expect(result?.description).toContain(description);
  expect(result?.description).not.toContain('陈旧'); expect(valuationPositionLabel(position)).toBe('未估值');
});
it('金额完整但价格陈旧也必须提示；前一交易日正常净值不报警', () => {
  expect(portfolioValuationNotice({ partial: false, positions: [valid] })).toBeNull();
  expect(portfolioValuationNotice({ partial: false, positions: [{ ...valid, stale: true }] })?.title).toBe('行情陈旧');
});
it('缺失汇率、行情与旧值同时存在时保留各自原因', () => {
  const result = portfolioValuationNotice({ partial: true, positions: [{ ...valid, stale: true }, { ...valid, marketValue: null }], dataQuality: { missingCurrencies: ['USD'] } });
  expect(result?.title).toBe('估值不完整'); expect(result?.description).toContain('汇率'); expect(result?.description).toContain('陈旧');
});
it('前收缺失只影响今日盈亏，不宣称价格陈旧', () => {
  expect(portfolioValuationNotice({ partial: false, positions: [valid], dailyChange: { partial: true } })?.title).toBe('今日盈亏不完整');
});
