import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  desiredProviderPolicyV3Schema,
  effectiveProviderPolicyV3Schema,
  marketRouteCapabilityV3Schema,
  validateDesiredProviderPolicyV3,
} from '../src/market-route-v3.js';

const fixture = () => JSON.parse(readFileSync(
  new URL('../fixtures/market-route-v3.etf-qfq.json', import.meta.url), 'utf8',
));

describe('Market Route Contract V3', () => {
  it('按市场、资产、能力、周期和口径分别保存精确目标', () => {
    const policy = desiredProviderPolicyV3Schema.parse(fixture());
    expect(policy.routes[0]?.key).toMatchObject({ assetType: 'ETF', adjustment: 'qfq' });
    expect(desiredProviderPolicyV3Schema.safeParse({
      ...policy,
      routes: [policy.routes[0], { ...policy.routes[0], key: { ...policy.routes[0]!.key, adjustment: 'hfq' } }],
    }).success).toBe(true);
    expect(desiredProviderPolicyV3Schema.safeParse({
      ...policy,
      routes: [policy.routes[0], policy.routes[0]],
    }).success).toBe(false);
  });

  it('拒绝第三备用、重复目标和无 upstreamSource 的目标', () => {
    const policy = fixture();
    const route = policy.routes[0];
    const target = route.targets[0];
    for (const targets of [
      [target, target],
      [target, { providerId: 'akshare', upstreamSource: 'eastmoney' }, { providerId: 'tencent', upstreamSource: 'tencent' }],
      [{ providerId: 'hithink' }],
    ]) {
      expect(desiredProviderPolicyV3Schema.safeParse({
        ...policy,
        routes: [{ ...route, targets }],
      }).success).toBe(false);
    }
  });

  it('非价格能力没有复权，行情能力必须匹配周期', () => {
    const policy = fixture();
    const route = policy.routes[0];
    expect(desiredProviderPolicyV3Schema.safeParse({
      ...policy,
      routes: [{ ...route, key: { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'FUND_HOLDINGS', adjustment: 'qfq' } }],
    }).success).toBe(false);
    expect(desiredProviderPolicyV3Schema.safeParse({
      ...policy,
      routes: [{ ...route, key: { ...route.key, timeframe: '1m' } }],
    }).success).toBe(false);
  });

  it('按精确目标区分未适配、伪支持口径、未鉴权与额度', () => {
    const policy = desiredProviderPolicyV3Schema.parse(fixture());
    const key = policy.routes[0]!.key;
    const target = policy.routes[0]!.targets[0]!;
    const capability = marketRouteCapabilityV3Schema.parse({ key, target, state: 'ready' });
    expect(validateDesiredProviderPolicyV3(policy, [capability])).toEqual([]);
    expect(validateDesiredProviderPolicyV3(policy, [])).toMatchObject([{ reason: 'not_adapted' }]);
    expect(validateDesiredProviderPolicyV3(policy, [{ ...capability, key: { ...key, adjustment: 'none' } }])).toMatchObject([{ reason: 'unsupported_adjustment' }]);
    expect(validateDesiredProviderPolicyV3(policy, [{ ...capability, state: 'credential_missing' }])).toMatchObject([{ reason: 'credential_missing' }]);
    expect(validateDesiredProviderPolicyV3(policy, [{ ...capability, state: 'quota_unavailable' }])).toMatchObject([{ reason: 'quota_unavailable' }]);
  });

  it('当前报价目录允许股票与 ETF 分别选用精确来源', () => {
    const stockKey = { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'REALTIME_QUOTE' } as const;
    const etfKey = { kind: 'data', market: 'CN', assetType: 'ETF', capability: 'REALTIME_QUOTE' } as const;
    const stockTarget = { providerId: 'akshare', upstreamSource: 'eastmoney' };
    const etfTarget = { providerId: 'efinance', upstreamSource: 'eastmoney' };
    const desired = desiredProviderPolicyV3Schema.parse({
      ...fixture(),
      routes: [
        { key: stockKey, targets: [stockTarget] },
        { key: etfKey, targets: [etfTarget] },
      ],
    });
    const entries = [
      marketRouteCapabilityV3Schema.parse({ key: stockKey, target: stockTarget, state: 'ready' }),
      marketRouteCapabilityV3Schema.parse({ key: etfKey, target: etfTarget, state: 'ready' }),
    ];
    expect(validateDesiredProviderPolicyV3(desired, entries)).toEqual([]);
    expect(validateDesiredProviderPolicyV3(desired, entries.slice(1))).toMatchObject([
      { reason: 'not_adapted' },
    ]);
  });

  it('生效策略携带 Desired/Effective 修订并约束主备状态', () => {
    const desired = desiredProviderPolicyV3Schema.parse(fixture());
    const effective = {
      contractVersion: 3,
      consumer: 'thesis-ledger',
      requestId: 'effective-fixture',
      revision: 4,
      sourceDesiredRevision: desired.revision,
      enabled: true,
      routes: [{
        key: desired.routes[0]!.key,
        targets: [{ ...desired.routes[0]!.targets[0], routeIndex: 0, eligible: true, reason: null }],
        reason: null,
      }],
      appliedAt: '2026-08-10T00:00:00.000Z',
    };
    expect(effectiveProviderPolicyV3Schema.parse(effective).sourceDesiredRevision).toBe(1);
    expect(effectiveProviderPolicyV3Schema.safeParse({
      ...effective,
      routes: [{ ...effective.routes[0], targets: [{ ...effective.routes[0]!.targets[0], routeIndex: 1 }] }],
    }).success).toBe(false);
    expect(effectiveProviderPolicyV3Schema.safeParse({
      ...effective,
      routes: [{ ...effective.routes[0], targets: [{ ...effective.routes[0]!.targets[0], eligible: false }] }],
    }).success).toBe(false);
  });

  it('当前准入失效、尚未生效和过期均保留明确原因且不能成为可用目标', () => {
    const desired = desiredProviderPolicyV3Schema.parse(fixture());
    for (const reason of ['admission_invalid', 'admission_not_yet_valid', 'admission_expired']) {
      const target = { ...desired.routes[0]!.targets[0], routeIndex: 0, eligible: false, reason };
      const effective = {
        contractVersion: 3, consumer: 'thesis-ledger', requestId: 'admission-status',
        revision: 1, sourceDesiredRevision: 1, enabled: true,
        routes: [{ key: desired.routes[0]!.key, targets: [target], reason }],
        appliedAt: '2026-10-02T00:00:00Z',
      };
      expect(effectiveProviderPolicyV3Schema.safeParse(effective).success).toBe(true);
      expect(effectiveProviderPolicyV3Schema.safeParse({ ...effective,
        routes: [{ ...effective.routes[0], targets: [{ ...target, eligible: true }] }],
      }).success).toBe(false);
    }
  });
});
