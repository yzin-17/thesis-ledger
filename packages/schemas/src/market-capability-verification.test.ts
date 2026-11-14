import { describe, expect, it } from 'vitest';
import { marketRouteCapabilityV3Schema } from './market-route-v3.js';

const entry = {
  key: {
    kind: 'bar',
    market: 'US',
    assetType: 'STOCK',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: 'hfq',
  },
  target: { providerId: 'futu', upstreamSource: 'futu' },
  state: 'ready',
};

describe('能力首次使用验证合同', () => {
  it('未验证能力仍可就绪，成功状态必须携带持久证据', () => {
    expect(
      marketRouteCapabilityV3Schema.safeParse({ ...entry, verification: { state: 'unverified' } })
        .success,
    ).toBe(true);
    expect(
      marketRouteCapabilityV3Schema.safeParse({ ...entry, verification: { state: 'verified' } })
        .success,
    ).toBe(false);
    const verification = {
      state: 'verified',
      verifiedAt: '2026-11-11T09:00:00Z',
      configVersion: 1,
      evidenceHash: 'a'.repeat(64),
    };
    expect(marketRouteCapabilityV3Schema.parse({ ...entry, verification }).verification).toEqual(
      verification,
    );
    expect(
      marketRouteCapabilityV3Schema.safeParse({
        ...entry,
        verification: { ...verification, evidenceHash: 'invalid' },
      }).success,
    ).toBe(false);
  });
});
