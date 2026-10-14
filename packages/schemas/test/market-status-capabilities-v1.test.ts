import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  correlateStatusCapabilityV1, statusCapabilityRequestV1Schema, statusCapabilityResultV1Schema,
} from '../src/market-status-capabilities-v1.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/market-status-capabilities-v1.shared.json', import.meta.url), 'utf8'));
const item = (name: string) => structuredClone(fixtures.valid.find((row: { name: string }) => row.name === name));

describe('独立状态能力合同', () => {
  for (const fixture of fixtures.valid) it(`${fixture.name} 独立参数与结果`, () => {
    const request = statusCapabilityRequestV1Schema.parse(fixture.request);
    expect(correlateStatusCapabilityV1(request, fixture.result)).toEqual(fixture.result);
  });
  it('基础日期不携带价格窗口或最后交易日推定', () => {
    const { request, result } = item('SECURITY_BASIC_DATES');
    expect(statusCapabilityRequestV1Schema.safeParse({ ...request, range: { start: '2024-01-01', end: '2024-01-02' } }).success).toBe(false);
    result.dates.lastTradingDate = result.dates.outDate;
    expect(statusCapabilityResultV1Schema.safeParse(result).success).toBe(false);
  });
  it.each(['requestId', 'symbol', 'policyRevision', 'target', 'index', 'range'])('隔离错误的结果相关性 %s', (field) => {
    const { request, result } = item('DAILY_TRADING_STATUS');
    if (field === 'requestId') result.requestId = 'different-request';
    if (field === 'symbol') result.symbol = '000995.SZ';
    if (field === 'policyRevision') result.policyRevision++;
    if (field === 'target') result.routeTarget.providerId = 'different-provider';
    if (field === 'index') result.routeTarget.routeIndex = 1;
    if (field === 'range') {
      result.range.start = '2024-07-14';
      result.coverage.range.start = '2024-07-14';
    }
    expect(() => correlateStatusCapabilityV1(statusCapabilityRequestV1Schema.parse(request), result)).toThrow();
  });
  it.each(['unknown', 'missing', 'unproved-calendar', 'future-clock', 'future-availability', 'wrong-timezone', 'duplicate', 'out-of-range'])('拒绝虚假的完整覆盖 %s', (field) => {
    const { result } = item('DAILY_TRADING_STATUS');
    if (field === 'unknown') result.days[0].state = 'unknown';
    if (field === 'missing') result.days = [];
    if (field === 'unproved-calendar') result.coverage.calendarEvidenceRefs = [];
    if (field === 'future-clock') result.evidence[0].observedAt = '2025-01-01T00:00:00Z';
    if (field === 'future-availability') result.evidence[0].availableAt = '2025-01-01T00:00:00Z';
    if (field === 'wrong-timezone') result.clock.timezone = 'America/New_York';
    if (field === 'duplicate') result.days.push(result.days[0]);
    if (field === 'out-of-range') result.days[0].date = '2024-07-14';
    expect(statusCapabilityResultV1Schema.safeParse(result).success).toBe(false);
  });
  it('未知保留为未知，不能将 coarse ST 当作细分风险', () => {
    const { result } = item('RISK_WARNING');
    expect(statusCapabilityResultV1Schema.parse(result)).toEqual(result);
    result.days[0].delisting = 'none';
    expect(statusCapabilityResultV1Schema.safeParse(result).success).toBe(false);
    result.days[0].evidenceRefs = ['document'];
    expect(statusCapabilityResultV1Schema.safeParse(result).success).toBe(true);
  });
  it('明确未知且覆盖未完成的结果有效', () => {
    const { result } = item('DAILY_TRADING_STATUS');
    result.days[0].state = 'unknown';
    result.days[0].evidenceRefs = [];
    result.coverage.unknownDates = ['2024-07-15'];
    result.coverage.complete = false;
    expect(statusCapabilityResultV1Schema.safeParse(result).success).toBe(true);
  });
  it('保留精确十进制比例与上下限，不因 Number 舍入升级事实', () => {
    const { result } = item('DAILY_PRICE_RULE');
    result.days[0].rule.maxUpRatio = '0.999999999999999999999999';
    expect(statusCapabilityResultV1Schema.safeParse(result).success).toBe(true);
    result.days[0].rule = { kind: 'exact', currency: 'CNY', lower: '1.000000000000000002', upper: '1.000000000000000001' };
    expect(statusCapabilityResultV1Schema.safeParse(result).success).toBe(false);
    result.days[0].rule.lower = '1.000000000000000001';
    expect(statusCapabilityResultV1Schema.safeParse(result).success).toBe(true);
  });
  it('粗风险和比例限幅不能满足更精确的消费者要求', () => {
    const risk = item('RISK_WARNING').result;
    risk.detail = { kind: 'riskCategories', categories: ['delisting', 'other'] };
    expect(statusCapabilityResultV1Schema.safeParse(risk).success).toBe(false);
    risk.coverage.unknownDates = ['2024-07-15'];
    risk.coverage.complete = false;
    expect(statusCapabilityResultV1Schema.safeParse(risk).success).toBe(true);
    const price = item('DAILY_PRICE_RULE').result;
    price.representation = 'exactPrices';
    expect(statusCapabilityResultV1Schema.safeParse(price).success).toBe(false);
    price.coverage.unknownDates = ['2024-07-15'];
    price.coverage.complete = false;
    expect(statusCapabilityResultV1Schema.safeParse(price).success).toBe(true);
  });
  it('比例、精确价格、不限价互斥，未知不带虚构单位', () => {
    const { result } = item('DAILY_PRICE_RULE');
    result.days[0].rule.maxUpRatio = 0.1;
    expect(statusCapabilityResultV1Schema.safeParse(result).success).toBe(false);
    result.days[0].rule = { kind: 'unlimited', reason: '' };
    expect(statusCapabilityResultV1Schema.safeParse(result).success).toBe(false);
    result.days[0].rule = { kind: 'unknown', currency: 'CNY' };
    expect(statusCapabilityResultV1Schema.safeParse(result).success).toBe(false);
  });
  it('证券市场、基础日期记录和能力参数不混用', () => {
    const { request, result } = item('SECURITY_BASIC_DATES');
    request.symbol = 'GME.US';
    expect(statusCapabilityRequestV1Schema.safeParse(request).success).toBe(false);
    result.evidence[0].kind = 'document';
    expect(statusCapabilityResultV1Schema.safeParse(result).success).toBe(false);
  });
});
