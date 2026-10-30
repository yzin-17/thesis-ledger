import type { ProviderRecord } from '../src/features/providers/providers.types.js';

export const aiProvider = (overrides: Partial<ProviderRecord> = {}): ProviderRecord => ({
  name: 'openrouter',
  type: 'ai',
  source: 'database',
  enabled: true,
  priority: 100,
  capabilities: ['chat'],
  health: 'unknown',
  credentialConfigured: true,
  baseUrl: 'https://openrouter.ai/api/v1',
  models: ['nvidia/nemotron-3-super-120b-a12b:free'],
  modelReasoning: {
    'nvidia/nemotron-3-super-120b-a12b:free': {
      supportedEfforts: ['none', 'low', 'high'],
      defaultEffort: 'low',
      defaultEnabled: true,
      supportsMaxTokens: true,
    },
  },
  timeoutMs: 45000,
  costPer1kInput: 0.00125,
  costPer1kOutput: 0.0045,
  costCurrency: 'USD',
  pricingVersion: '2026-09',
  updatedAt: null,
  checkedAt: null,
  latencyMs: null,
  errorCode: null,
  ...overrides,
});
