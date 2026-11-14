import { describe, expect, it } from 'vitest';
import { providerExactCapabilities } from '../src/features/market-data/market-provider-capabilities.js';
import { selectableRouteTargetsV3 } from '../src/features/market-data/market-data-routes-v3.js';
import { catalog, key, provider, target } from './market-policy-defaults.fixture.js';

describe('能力首次真实使用', () => {
  it('无权限检查记录及未知状态均可尝试，当前能力有成功记录后显示已验证', () => {
    const current = {
      ...catalog,
      entries: [
        {
          key,
          target,
          state: 'ready' as const,
          verification: { state: 'unverified' as const },
          accountAccess: { state: 'unknown' as const, attempted: false },
        },
      ],
    };
    expect(
      selectableRouteTargetsV3(current, key, [{ ...provider, accountAccessSupported: true }])[0]
        ?.disabled,
    ).toBe(false);
    expect(providerExactCapabilities(provider, current)?.[0]?.state).toBe('未验证，可尝试');
    const verified = {
      ...current,
      entries: [
        {
          ...current.entries[0]!,
          verification: {
            state: 'verified' as const,
            verifiedAt: '2026-11-11T09:00:00Z',
            configVersion: 1,
            evidenceHash: 'a'.repeat(64),
          },
        },
      ],
    };
    expect(providerExactCapabilities(provider, verified)?.[0]?.state).toBe('已验证');
  });
});
