import { runConfigSchemaV3 } from '@thesis-ledger/schemas';
import { createNormalizedRunConfig } from './strategy-optimization-postgres-fixtures.js';

export function optimizationResearchRunConfig() {
  const base = createNormalizedRunConfig();
  return runConfigSchemaV3.parse({ ...base,
    executionPriceProtocol: { ...base.executionPriceProtocol, priceBasis: { ...base.executionPriceProtocol.priceBasis, adjustment: 'hfq' } },
    priceResearch: { protocolVersion: 'price-research-v1', actualPriceWindow: {
      version: 'market-frozen-window-v1', identityFingerprint: 'a'.repeat(64), responseHash: 'b'.repeat(64),
    } },
  });
}
