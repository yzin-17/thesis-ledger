import { describe, expect, it } from 'vitest';
import { previewStatusRouteMigrationV1 } from '../src/market-status-route-migration-v1.js';
import { type DesiredProviderPolicyV3, type MarketRouteKeyV3 } from '../src/market-route-v3.js';

const oldKey: MarketRouteKeyV3 = { kind: 'data', market: 'CN', assetType: 'STOCK', capability: 'HISTORICAL_TRADING_STATUS' };
const targets = [{ providerId: 'primary', upstreamSource: 'primary-upstream' }, { providerId: 'backup', upstreamSource: 'backup-upstream' }];
const policy = (): DesiredProviderPolicyV3 => ({ contractVersion: 3, consumer: 'thesis-ledger', requestId: 'migration-preview',
  revision: 7, enabled: true, routes: [{ key: oldKey, targets }] });
const binding = (capability: string, index: number) => ({ from: oldKey, key: { ...oldKey, capability }, target: targets[index]! });

describe('状态路由迁移只读预览', () => {
  it('仅复制实际绑定到关闭的功能，保留原路由和主备', () => {
    const input = policy();
    const before = structuredClone(input);
    const result = previewStatusRouteMigrationV1(input, [binding('DAILY_TRADING_STATUS', 0), binding('DAILY_TRADING_STATUS', 1), binding('SECURITY_BASIC_DATES', 1)]);
    expect(input).toEqual(before);
    expect(result.draft.routes[0]).toEqual(before.routes[0]);
    expect(result.draft.revision).toBe(7);
    expect(result.draft.routes[1]).toMatchObject({ targets, enabled: false });
    expect(result.draft.routes[2]).toMatchObject({ targets: [targets[1]], enabled: false });
    expect(result.changes[1]?.requiresChoice).toBe(true);
    expect(result.draft.routes.some((row) => row.key.capability === 'DAILY_PRICE_RULE')).toBe(false);
  });
  it('不能映射的项明确保留，不删除原来源', () => {
    const input = policy();
    const result = previewStatusRouteMigrationV1(input, []);
    expect(result.draft).toEqual(input);
    expect(result.unmapped).toHaveLength(2);
    expect(result.changes).toEqual([]);
  });
  it('已有功能策略保留其启停和用户选源', () => {
    const input = policy();
    const saved = { key: { ...oldKey, capability: 'SECURITY_BASIC_DATES' }, enabled: true, targets: [targets[1]!] };
    input.routes.push(saved);
    const result = previewStatusRouteMigrationV1(input, [binding('SECURITY_BASIC_DATES', 0)]);
    expect(result.draft.routes).toHaveLength(2);
    expect(result.draft.routes[1]).toEqual(saved);
    expect(result.changes[0]?.state).toBe('preserved');
  });
  it('不会默认引入未选来源或变更市场，拒绝重复提示', () => {
    const input = policy();
    const candidate = { ...binding('DAILY_TRADING_STATUS', 0), target: { providerId: 'unselected', upstreamSource: 'unselected' } };
    expect(previewStatusRouteMigrationV1(input, [candidate]).draft).toEqual(input);
    expect(() => previewStatusRouteMigrationV1(input, [{ ...binding('DAILY_TRADING_STATUS', 0), key: { ...oldKey, market: 'US', capability: 'DAILY_TRADING_STATUS' } }])).toThrow();
    expect(() => previewStatusRouteMigrationV1(input, [binding('DAILY_TRADING_STATUS', 0), binding('DAILY_TRADING_STATUS', 0)])).toThrow();
  });
});
