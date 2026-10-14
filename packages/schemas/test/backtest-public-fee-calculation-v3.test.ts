import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { executionModelFeesSchema, executionModelFeesV3Schema, backtestExecutionModelSchemaV3,
  executionModelAccountingIssuesV3 } from '../src/backtest-execution-model.js';

function model() {
  return JSON.parse(readFileSync(new URL('../fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url), 'utf8'));
}
function hkFees() {
  const value = model().segments[0].fees;
  value.currency = 'HKD';
  for (const item of Object.values(value) as { treatment?: string; currency?: string }[])
    if (item?.treatment === 'charged') item.currency = 'HKD';
  value.stampDuty = { treatment: 'charged', side: 'both', basis: 'turnover', currency: 'HKD', rate: '0.001',
    minimum: { kind: 'none' }, amountRounding: { mode: 'ceil', decimalPlaces: 0 } };
  value.afrcLevy = { treatment: 'charged', side: 'both', basis: 'turnover', currency: 'HKD', rate: '0.0000015', minimum: { kind: 'none' } };
  return value;
}
function taf() {
  return { treatment: 'charged', side: 'sell', basis: 'actualShares', currency: 'USD', rate: '0.000166',
    minimum: { kind: 'none' }, maximumAmount: '8.30', lowPriceExemption: 'belowPerShareRate' };
}

describe('V3扩展费用合同与旧版本边界', () => {
  it('V3接受独立AFRC和整港元进位，旧V1/V2继续拒绝新增字段', () => {
    expect(executionModelFeesV3Schema.safeParse(hkFees()).success).toBe(true);
    expect(executionModelFeesSchema.safeParse(hkFees()).success).toBe(false);
  });
  it('拒绝CNY进位及错误AFRC侧', () => {
    const value = hkFees(); value.currency = 'CNY';
    expect(executionModelFeesV3Schema.safeParse(value).success).toBe(false);
    const other = hkFees(); other.afrcLevy.side = 'sell';
    expect(executionModelFeesV3Schema.safeParse(other).success).toBe(false);
  });
  it('TAF不能伪装为成交额费或买侧费', () => {
    const value = model().segments[0].fees;
    value.tradingActivityFee = taf();
    expect(executionModelFeesV3Schema.safeParse(value).success).toBe(false);
    value.currency = 'USD';
    for (const charge of Object.values(value) as { treatment?: string; currency?: string }[])
      if (charge?.treatment === 'charged') charge.currency = 'USD';
    expect(executionModelFeesV3Schema.safeParse(value).success).toBe(true);
    value.tradingActivityFee.basis = 'turnover';
    expect(executionModelFeesV3Schema.safeParse(value).success).toBe(false);
  });
  it('归一化准备拒绝TAF，实际股数准备保持可选', () => {
    const value = model();
    value.scope.currency = 'USD';
    for (const segment of value.segments) {
      segment.fees.currency = 'USD';
      for (const charge of Object.values(segment.fees) as { treatment?: string; currency?: string }[])
        if (charge?.treatment === 'charged') charge.currency = 'USD';
      segment.fees.tradingActivityFee = taf();
    }
    const parsed = backtestExecutionModelSchemaV3.parse(value);
    const run = { startDate: value.scope.range.start, endDate: value.scope.range.end };
    expect(executionModelAccountingIssuesV3(parsed, run, 'normalized-series').some((issue) => issue.message.includes('TAF'))).toBe(true);
    expect(executionModelAccountingIssuesV3(parsed, run, 'raw-events')).toEqual([]);
  });
});
