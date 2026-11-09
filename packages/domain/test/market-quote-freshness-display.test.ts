import { expect, it } from 'vitest';
import { quoteFreshnessExplanation, quoteFreshnessLabel } from '../src/market-quote-freshness-display.js';
const quote = {
  stale: true, freshness: 'stale', marketTime: '2026-11-06T07:00:00Z',
  fetchedAt: '2026-11-09T02:00:00Z',
};

it('优先显示具体原因、HTTP 状态及两个独立时间', () => {
  const value = { ...quote, refreshFailure: 'fetch_failed', staleReason: { code: 'rate_limited', message: '数据源限制了请求频率。', httpStatus: 429 } };
  const text = quoteFreshnessExplanation(value);
  expect(text).toContain('数据源限制了请求频率。');
  expect(text).toContain('HTTP 429');
  expect(text).toContain('行情时间：');
  expect(text).toContain('抓取时间：');
  expect(quoteFreshnessLabel(value)).toBe('刷新失败，保留旧数据');
});
it('时效阈值和刷新失败分开表达', () => {
  expect(quoteFreshnessLabel({ ...quote, staleReason: { code: 'market_time_aged', message: '超过 10 分钟。' } })).toBe('行情时点超限');
  expect(quoteFreshnessLabel({ ...quote, refreshFailure: 'budget_cooldown' })).toBe('刷新冷却中');
  expect(quoteFreshnessExplanation({ ...quote, refreshFailure: 'fetch_failed' })).toContain('未记录细分错误');
});
it('缺少诊断不归因给来源，不以年龄猜测冷却或失败', () => {
  expect(quoteFreshnessExplanation(quote)).toContain('当前响应标记为陈旧，但缺少判定原因');
  expect(quoteFreshnessLabel(quote)).toBe('行情陈旧');
  expect(quoteFreshnessExplanation({ ...quote, marketTime: null })).toContain('行情时间：未提供');
  expect(quoteFreshnessExplanation({ ...quote, stale: false, freshness: 'live' })).toBeNull();
});
it('正常休市快照使用最近交易日，两个时点独立成行', () => {
  const value = { ...quote, stale: false, freshness: 'delayed', sessionContext: { session: 'closed_snapshot', latestTradingDate: '2026-11-06' } };
  expect(quoteFreshnessLabel(value)).toBe('休市快照');
  const lines = quoteFreshnessExplanation(value)!.split('\n');
  expect(lines).toHaveLength(3);
  expect(lines[0]).toContain('2026-11-06');
  expect(lines[1]).toMatch(/^行情时间：/); expect(lines[2]).toMatch(/^抓取时间：/);
  expect(quoteFreshnessLabel({ ...value, stale: true, freshness: 'stale', refreshFailure: 'fetch_failed' })).toBe('刷新失败，保留旧数据');
});
