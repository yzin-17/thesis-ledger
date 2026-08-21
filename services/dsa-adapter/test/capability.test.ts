import { describe, expect, it } from 'vitest';
import { getCapabilitySnapshot } from '../src/capability.js';

describe('DSA capability contract', () => {
  it('exposes stable provider capability metadata', () => {
    const snapshot = getCapabilitySnapshot();

    expect(snapshot.provider).toBe('dsa-fork');
    expect(snapshot.contractVersion).toBe(1);
    expect(snapshot.capabilities).toContain('quote');
  });
});
