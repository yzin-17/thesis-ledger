import { describe, expect, it } from 'vitest';
import { fundHoldingsSchema } from '../src/market.js';

const sample = {
  version: 3, fundSymbol: '000001.OF', reportPeriod: '2026-Q2', provider: 'akshare',
  fetchedAt: '2026-09-27T04:00:00Z', evidenceVersion: 'sample', holdings: [],
};

describe('基金持仓披露时间', () => {
  it('保留明确未知与既有真实日期，缺失字段仍拒绝', () => {
    expect(fundHoldingsSchema.parse({ ...sample, disclosureDate: null }).disclosureDate).toBeNull();
    expect(fundHoldingsSchema.parse({ ...sample, disclosureDate: '2026-07-20T00:00:00Z' }).disclosureDate).toBeTruthy();
    expect(fundHoldingsSchema.safeParse(sample).success).toBe(false);
    expect(fundHoldingsSchema.parse({ ...sample, disclosureDate: sample.fetchedAt, servedFromCache: true }).disclosureDate).toBeNull();
    expect(fundHoldingsSchema.safeParse({ ...sample, version: 1, disclosureDate: null }).success).toBe(false);
  });
});
