import { describe, expect, it } from 'vitest';
import type { QuantCapabilityContract } from '../src/index.js';
import { getDsaCapabilitySnapshot } from '../src/capability.js';

describe('DSA capability contract', () => {
  it('normalizes provider capability metadata', async () => {
    const contract: QuantCapabilityContract = {
      async quote() {
        return {};
      },
      async bars() {
        return [];
      },
      async indicator() {
        return {};
      },
      async chip() {
        return {};
      },
      async capabilities() {
        return {
          contractVersion: 1,
          provider: 'dsa-fork',
          capabilities: {
            quote: true,
            bars: { timeframes: ['1d'] },
            indicators: { names: ['MA'], timeframes: ['1d'] },
            chip: { summary: true, distribution: false },
          },
        };
      },
    };

    const snapshot = await getDsaCapabilitySnapshot(contract);

    expect(snapshot.provider).toBe('dsa-fork');
    expect(snapshot.capabilities).toContain('quote');
  });
});
