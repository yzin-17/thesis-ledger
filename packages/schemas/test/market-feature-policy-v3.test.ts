import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { desiredProviderPolicyV3Schema, effectiveProviderPolicyV3Schema } from '../src/market-route-v3.js';

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/market-route-v3.etf-qfq.json', import.meta.url), 'utf8'));

describe('功能路由启停兼容', () => {
  it('旧策略解析保持原字段，关闭保留全部主备', () => {
    const policy = fixture();
    expect(desiredProviderPolicyV3Schema.parse(policy)).toEqual(policy);
    const targets = structuredClone(policy.routes[0].targets);
    policy.routes[0].enabled = false;
    const parsed = desiredProviderPolicyV3Schema.parse(policy);
    expect(parsed.routes[0]?.enabled).toBe(false);
    expect(parsed.routes[0]?.targets).toEqual(targets);
  });
  it.each([null, 0, 1, 'false'])('只接受明确布尔启停 %s', (enabled) => {
    const policy = fixture();
    policy.routes[0].enabled = enabled;
    expect(desiredProviderPolicyV3Schema.safeParse(policy).success).toBe(false);
  });
  it('新增功能必须显式选择启停，旧功能不自动注入默认值', () => {
    const policy = fixture();
    const route = { key: { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'SECURITY_BASIC_DATES' },
      targets: [{ providerId: 'baostock', upstreamSource: 'baostock' }] };
    policy.routes = [route];
    expect(desiredProviderPolicyV3Schema.safeParse(policy).success).toBe(false);
    policy.routes = [{ ...route, enabled: false }];
    expect(desiredProviderPolicyV3Schema.parse(policy).routes[0]?.enabled).toBe(false);
  });
  it('Effective 禁用优先，不能保留可用目标或错误原因', () => {
    const original = fixture();
    const policy = { ...original, sourceDesiredRevision: original.revision, appliedAt: '2026-10-10T00:00:00Z',
      routes: [{ ...original.routes[0], enabled: false, reason: 'disabled',
        targets: original.routes[0].targets.map((target: object, index: number) => ({ ...target, routeIndex: index, eligible: false, reason: 'disabled' })) }] };
    expect(effectiveProviderPolicyV3Schema.safeParse(policy).success).toBe(true);
    policy.routes[0].targets[0].eligible = true;
    policy.routes[0].targets[0].reason = null;
    expect(effectiveProviderPolicyV3Schema.safeParse(policy).success).toBe(false);
    policy.routes[0].targets[0].eligible = false;
    policy.routes[0].targets[0].reason = 'credential_missing';
    expect(effectiveProviderPolicyV3Schema.safeParse(policy).success).toBe(false);
  });
});
