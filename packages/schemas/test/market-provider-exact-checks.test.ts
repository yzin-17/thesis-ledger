import { describe, expect, it } from 'vitest';
import {
  marketProviderProbeRouteSchema,
  marketProviderTestResponseSchema,
} from '../src/market-provider-control.js';

const key = {
  kind: 'bar',
  market: 'CN',
  assetType: 'ETF',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
} as const;
const target = { providerId: 'hithink', upstreamSource: 'fund-market-historical' };
const result = { status: 'healthy', attempted: true, readOnly: true } as const;
const response = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  providerId: 'hithink',
  requestId: 'test',
  status: 'healthy',
  credentialConfigured: true,
  capabilityResults: { DAILY_BAR: result },
  routeResults: [{ key, target, state: 'ready', result }],
};

describe('精确来源检查合同', () => {
  it('账户结果保留自己的用途、时间和精确身份，不能冒充业务读取成功', () => {
    const access = { state: 'allowed', attempted: true, configVersion: 1, checkedAt: '2026-10-14T06:00:00Z', validUntil: '2026-10-14T06:05:00Z' };
    const account = { ...response, purpose: 'account_access', capabilityResults: {}, routeResults: undefined,
      accountAccess: { scope: 'account_interfaces', credentialContext: 'current', configVersion: 1,
        checkedAt: access.checkedAt, validUntil: access.validUntil, routes: [{ key, target, access }] } };
    expect(marketProviderTestResponseSchema.safeParse(account).success).toBe(true);
    expect(marketProviderTestResponseSchema.safeParse({ ...account, purpose: 'capability_read' }).success).toBe(false);
    expect(marketProviderTestResponseSchema.safeParse({ ...account, routeResults: response.routeResults }).success).toBe(false);
    expect(marketProviderTestResponseSchema.safeParse({ ...account, accountAccess: { ...account.accountAccess,
      routes: [{ key, target, access: { ...access, state: 'permission_missing', errorCode: 'permission_denied' } }] } }).success).toBe(false);
    expect(marketProviderTestResponseSchema.safeParse({ ...account, accountAccess: { ...account.accountAccess,
      routes: [{ key, target: { ...target, providerId: 'tushare' }, access }] } }).success).toBe(false);
  });
  it('账号报告容纳原生分钟周期，保留 64 条输出边界', () => {
    const access = { state: 'unknown', attempted: false, errorCode: 'not_tested', configVersion: 1,
      checkedAt: '2026-11-07T06:00:00Z', validUntil: '2026-11-07T06:05:00Z' };
    const routes = (['STOCK', 'ETF'] as const).flatMap(assetType =>
      (['1m', '5m', '15m', '30m', '60m'] as const).map(timeframe => ({
        key: { kind: 'bar', market: 'CN', assetType, capability: 'MINUTE_BAR', timeframe, adjustment: 'none' },
        target: { providerId: 'tushare', upstreamSource: 'tushare' }, access,
      })));
    const account = { ...response, providerId: 'tushare', status: 'degraded', purpose: 'account_access',
      capabilityResults: {}, routeResults: undefined, accountAccess: { scope: 'account_interfaces',
        credentialContext: 'current', configVersion: 1, checkedAt: access.checkedAt,
        validUntil: access.validUntil, routes } };
    expect(marketProviderTestResponseSchema.safeParse(account).success).toBe(true);
    expect(marketProviderTestResponseSchema.safeParse({ ...account,
      accountAccess: { ...account.accountAccess, routes: Array.from({ length: 65 }, () => routes[0]) } }).success).toBe(false);
  });
  it('接收精确目标及逐路由结果', () => {
    expect(marketProviderProbeRouteSchema.parse({ key, target })).toEqual({ key, target });
    expect(marketProviderTestResponseSchema.parse(response).routeResults).toHaveLength(1);
  });
  it('空测试和未执行结果不能声明成功', () => {
    expect(
      marketProviderTestResponseSchema.safeParse({ ...response, capabilityResults: {} }).success,
    ).toBe(false);
    expect(
      marketProviderTestResponseSchema.safeParse({
        ...response,
        capabilityResults: { DAILY_BAR: { ...result, attempted: false } },
      }).success,
    ).toBe(false);
  });
  it('拒绝混入其他来源或重复目标', () => {
    expect(
      marketProviderTestResponseSchema.safeParse({
        ...response,
        routeResults: [...response.routeResults, ...response.routeResults],
      }).success,
    ).toBe(false);
    expect(
      marketProviderTestResponseSchema.safeParse({
        ...response,
        routeResults: [
          { ...response.routeResults[0], target: { ...target, providerId: 'tencent' } },
        ],
      }).success,
    ).toBe(false);
  });
});
