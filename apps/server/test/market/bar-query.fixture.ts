import type { MarketBarQuerySemanticsV3 } from '@thesis-ledger/schemas';

export const barQueryFixture = (adjustment: 'none' | 'qfq' | 'hfq'): MarketBarQuerySemanticsV3 => ({
  contractVersion: 3, operation: 'query', adjustment, priceBasis: 'provider-native',
  readScope: 'single-target-whole-window', coverageValidation: 'per-request',
  transportProtocol: 'synthetic-single-response-v1',
});
