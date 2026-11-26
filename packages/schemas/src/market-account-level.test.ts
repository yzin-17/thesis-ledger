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
  it('接续报告保留不同逐项时间，拒绝未来时间及不同配置或持久化状态', () => {
    const resumed = { ...report, checkedAt: '2026-10-22T08:00:00Z' };
    expect(marketProviderAccountAccessReportSchema.safeParse(resumed).success).toBe(true);
    for (const change of [
      { checkedAt: '2026-10-23T08:00:00Z' }, { checkedAt: undefined },
      { configVersion: 3 }, { persisted: undefined },
    ]) {
      const invalid = { ...resumed, routes: [{ ...report.routes[0], access: { ...allowed, ...change } }] };
      expect(marketProviderAccountAccessReportSchema.safeParse(invalid).success).toBe(false);
    }
  });
  it('草稿允许各项较早到期，不能延长到报告有效期之外', () => {
    const draft = { ...report, persisted: undefined, credentialContext: 'draft', checkedAt: '2026-10-21T08:01:00Z',
      validUntil: '2026-10-21T08:06:00Z', routes: [{ ...report.routes[0], access: {
        ...allowed, persisted: undefined, validUntil: '2026-10-21T08:05:00Z' } }] };
    expect(marketProviderAccountAccessReportSchema.safeParse(draft).success).toBe(true);
    expect(marketProviderAccountAccessReportSchema.safeParse({ ...draft, routes: [{ ...draft.routes[0],
      access: { ...draft.routes[0]!.access, validUntil: '2026-10-21T08:07:00Z' } }] }).success).toBe(false);
  });
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
    const result = { contractVersion: 1, consumer: 'thesis-ledger', providerId: 'tushare', requestId: 'level-check',
      purpose: 'account_access', status: 'healthy', credentialConfigured: true, capabilityResults: {}, accountAccess: report };
    expect(marketProviderTestResponseSchema.safeParse(result).success).toBe(true);
  });
});
