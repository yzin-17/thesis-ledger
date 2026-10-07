import { describe, expect, it } from 'vitest';
import {
  marketCatalogStatusSchema,
  marketPolicyClientResponseSchema,
  marketProviderRegistrySchema,
} from './market-client-projections.js';

const policy = {
  contractVersion: 3,
  consumer: 'thesis-ledger',
  requestId: 'current-policy',
  revision: 4,
  enabled: true,
  routes: [],
  syncState: 'applied',
  effectiveStale: false,
  effectiveProjection: {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: 'current-policy',
    revision: 2,
    sourceDesiredRevision: 4,
    enabled: true,
    routes: [],
    appliedAt: '2026-10-02T00:00:00Z',
  },
};
const catalog = {
  generation: 28,
  checksum: 'a'.repeat(64),
  cursor: 'generation:28',
  instrumentCount: 5920,
  syncedAt: '2026-09-27T00:00:00Z',
  readinessState: 'stale',
  refreshInProgress: false,
  activeJobId: null,
  lastAttemptAt: null,
  lastError: null,
  retryAt: null,
};
describe('客户端当前 Market 投影', () => {
  it('接收当前生效与明确陈旧投影，拒绝旧格式及错位生效声明', () => {
    expect(marketPolicyClientResponseSchema.safeParse(policy).success).toBe(true);
    expect(
      marketPolicyClientResponseSchema.safeParse({
        ...policy,
        effectiveProjection: null,
        effectiveStale: true,
      }).success,
    ).toBe(true);
    for (const raw of [
      { ...policy, syncState: undefined },
      { ...policy, effectiveStale: undefined },
      { ...policy, effectiveProjection: null },
      { ...policy, effectiveProjection: { ...policy.effectiveProjection, contractVersion: 2 } },
      {
        ...policy,
        effectiveProjection: { ...policy.effectiveProjection, sourceDesiredRevision: 3 },
      },
      { ...policy, syncState: 'pending' },
    ])
      expect(marketPolicyClientResponseSchema.safeParse(raw).success).toBe(false);
  });
  it('Provider 列表缺版本或缺列表不能变成空成功', () => {
    expect(
      marketProviderRegistrySchema.safeParse({
        contractVersion: 3,
        consumer: 'thesis-ledger',
        providers: [],
      }).success,
    ).toBe(true);
    expect(marketProviderRegistrySchema.safeParse({ providers: [] }).success).toBe(false);
    expect(
      marketProviderRegistrySchema.safeParse({ contractVersion: 3, consumer: 'thesis-ledger' })
        .success,
    ).toBe(false);
  });
  it('目录显示只消费同步身份，拒绝历史条数冒充当前目录', () => {
    expect(marketCatalogStatusSchema.safeParse(catalog).success).toBe(true);
    for (const raw of [
      { generation: 28, instrumentCount: 5920 },
      { ...catalog, cursor: 'generation:27' },
      { ...catalog, checksum: null },
      { ...catalog, readinessState: undefined },
    ])
      expect(marketCatalogStatusSchema.safeParse(raw).success).toBe(false);
    expect(
      marketCatalogStatusSchema.safeParse({
        ...catalog,
        generation: 0,
        checksum: null,
        cursor: null,
        syncedAt: null,
        readinessState: 'unavailable',
      }).success,
    ).toBe(true);
  });
});
