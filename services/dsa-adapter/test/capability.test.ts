import { describe, expect, it } from 'vitest';
import { getDsaCapabilitySnapshot, type QuantCapabilityContract } from '../src/index.js';

const contract: QuantCapabilityContract = {
  quote: async () => ({}),
  bars: async () => [],
  indicator: async () => ({}),
  chip: async () => ({}),
  capabilities: async () => ({
    contractVersion: 1,
    provider: 'dsa-fork',
    capabilities: {
      quote: true,
      bars: { timeframes: ['1d'] },
      indicators: { names: ['MA', 'MACD', 'RSI'], timeframes: ['1d'] },
      chip: { summary: true, distribution: true },
    },
  }),
};

describe('DSA capability contract', () => {
  it('将 DSA declaration 转换为稳定的 ThesisLedger capability snapshot', async () => {
    await expect(getDsaCapabilitySnapshot(contract)).resolves.toEqual({
      provider: 'dsa-fork',
      contractVersion: 1,
      capabilities: [
        'quote',
        'bars-1d',
        'indicator-MA',
        'indicator-MACD',
        'indicator-RSI',
        'chip-summary',
        'chip-distribution',
      ],
    });
  });
});
