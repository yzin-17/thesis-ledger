import { describe, expect, it } from 'vitest';
import { marketAccountAccessSchema, marketProviderAccountLevelSchema } from './market-account-access.js';
import { marketProviderAccountAccessReportSchema, marketProviderTestResponseSchema } from './market-provider-control.js';

const checkedAt = '2026-10-21T08:00:00Z';
const allowed = { state: 'allowed', attempted: true, checkedAt, configVersion: 2, persisted: true };
const target = { providerId: 'tushare', upstreamSource: 'tushare' };
const report = {
  scope: 'account_interfaces', credentialContext: 'current', checkedAt, configVersion: 2, persisted: true,
  accountLevel: { points: 120, independentApis: [] },
  routes: [
    { key: { kind: 'bar', market: 'CN', assetType: 'STOCK', capability: 'DAILY_BAR', timeframe: '1d', adjustment: 'none' }, target, access: allowed },
    { key: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'CASH_DISTRIBUTION' }, target,
      access: { state: 'not_included', attempted: false, errorCode: 'account_level_insufficient', checkedAt, configVersion: 2, persisted: true } },
  ],
};

describe('账号等级与持久权限', () => {
  it('积分和独立权限保持严格输入', () => {
    expect(marketProviderAccountLevelSchema.safeParse({ points: 120, independentApis: [] }).success).toBe(true);
    for (const points of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(marketProviderAccountLevelSchema.safeParse({ points, independentApis: [] }).success).toBe(false);
    expect(marketProviderAccountLevelSchema.safeParse({ points: 120, independentApis: ['fund_div'] }).success).toBe(false);
  });
  it('保存的报告允许跨重启使用，草稿仍需要短期有效时间', () => {
    expect(marketProviderAccountAccessReportSchema.safeParse(report).success).toBe(true);
    expect(marketProviderAccountAccessReportSchema.safeParse({ ...report, credentialContext: 'draft' }).success).toBe(false);
    expect(marketAccountAccessSchema.safeParse({ ...allowed, persisted: undefined }).success).toBe(false);
  });
  it('未包含的功能保持零尝试，不能伪造接口通过', () => {
    expect(marketAccountAccessSchema.safeParse({ ...report.routes[1]?.access, attempted: true }).success).toBe(false);
    const result = { contractVersion: 3, consumer: 'thesis-ledger', providerId: 'tushare', requestId: 'level-check',
      purpose: 'account_access', status: 'healthy', credentialConfigured: true, capabilityResults: {}, accountAccess: report };
    expect(marketProviderTestResponseSchema.safeParse(result).success).toBe(true);
  });
});
