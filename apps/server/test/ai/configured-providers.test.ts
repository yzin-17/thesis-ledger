import { describe, expect, it } from 'vitest';
import { createConfiguredAiProviders } from '../../src/ai/provider-adapters.js';
import { parseConfig } from '../../src/platform/config.js';

const baseEnvironment = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  DSA_BASE_URL: 'http://localhost:8000',
  THESIS_LEDGER_DSA_TOKEN: 'test-token',
  CREDENTIAL_ENCRYPTION_KEY: '0123456789abcdef',
};

describe('configured AI providers', () => {
  it('registers multiple explicit provider/model identities', () => {
    const config = parseConfig({ ...baseEnvironment, AI_PROVIDER_CONFIGS_JSON: JSON.stringify([
      { id: 'alpha', baseUrl: 'https://alpha.example/v1', apiKey: 'a', models: ['a1', 'a2'], costPer1kInput: 0.1, costPer1kOutput: 0.2, costCurrency: 'USD', pricingVersion: '2026-09' },
      { id: 'beta', baseUrl: 'https://beta.example/v1', apiKey: 'b', models: ['b1'], timeoutMs: 1234 },
    ]) });
    const providers = createConfiguredAiProviders(config);
    expect(providers.map(({ id, models }) => ({ id, models: [...models] }))).toEqual([
      { id: 'alpha', models: ['a1', 'a2'] },
      { id: 'beta', models: ['b1'] },
    ]);
    expect(providers[0]?.metadata).toMatchObject({
      costPer1kInput: 0.1,
      costPer1kOutput: 0.2,
      costCurrency: 'USD',
      pricingVersion: '2026-09',
    });
  });

  it('rejects duplicate provider identities', () => {
    const config = parseConfig({ ...baseEnvironment, AI_PROVIDER_CONFIGS_JSON: JSON.stringify([
      { id: 'alpha', baseUrl: 'https://one.example/v1', apiKey: 'a', models: ['a1'] },
      { id: 'alpha', baseUrl: 'https://two.example/v1', apiKey: 'b', models: ['a2'] },
    ]) });
    expect(() => createConfiguredAiProviders(config)).toThrow(/AI_PROVIDER_CONFIGS_JSON 配置无效/);
  });

  it('keeps the legacy single-provider configuration compatible', () => {
    const config = parseConfig({ ...baseEnvironment, AI_PROVIDER_ID: 'legacy', AI_BASE_URL: 'https://legacy.example/v1', AI_API_KEY: 'legacy-key', AI_MODEL: 'legacy-model' });
    expect(createConfiguredAiProviders(config).map(({ id, models }) => ({ id, models: [...models] }))).toEqual([{ id: 'legacy', models: ['legacy-model'] }]);
  });
});
