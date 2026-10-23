import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { AiModule } from '../../src/ai/ai.module.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { parseConfig } from '../../src/platform/config.js';

const baseEnvironment = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  DSA_BASE_URL: 'http://localhost:8000',
  THESIS_LEDGER_DSA_TOKEN: 'test-token',
  CREDENTIAL_ENCRYPTION_KEY: '0123456789abcdef',
};

describe('AI 服务的部署配置边界', () => {
  it.each(['development', 'test', 'production'])(
    '%s 环境忽略遗留 Provider 配置和自动演示开关',
    (NODE_ENV) => {
      const config = parseConfig({
        ...baseEnvironment,
        NODE_ENV,
        AI_PROVIDER_ID: '',
        AI_BASE_URL: 'invalid-url',
        AI_API_KEY: '',
        AI_MODEL: '',
        AI_PROVIDER_CONFIGS_JSON: '{invalid-json',
        AI_FIXTURE_ENABLED: 'invalid-flag',
      });
      expect(config).not.toHaveProperty('aiProviderId');
      expect(config).not.toHaveProperty('aiBaseUrl');
      expect(config).not.toHaveProperty('aiApiKey');
      expect(config).not.toHaveProperty('aiModel');
      expect(config).not.toHaveProperty('aiProviderConfigsJson');
      expect(config).not.toHaveProperty('aiFixtureEnabled');
      expect(config).toMatchObject({ environment: NODE_ENV, aiTimeoutMs: 120_000 });
    },
  );

  it('模块直接提供空 Registry，启动数据由数据库服务加载', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AiModule) as unknown[];
    expect(providers).toContain(AiProviderRegistry);
    expect(
      providers.some(
        (provider) =>
          typeof provider === 'object' &&
          provider !== null &&
          'provide' in provider &&
          provider.provide === AiProviderRegistry,
      ),
    ).toBe(false);
    expect(new AiProviderRegistry().list()).toEqual([]);
  });

  it('继续校验基础设施配置', () => {
    expect(() => parseConfig({ ...baseEnvironment, AI_TIMEOUT_MS: 'invalid' })).toThrow(
      'AI_TIMEOUT_MS',
    );
    expect(() => parseConfig({ ...baseEnvironment, CREDENTIAL_ENCRYPTION_KEY: '' })).toThrow(
      'CREDENTIAL_ENCRYPTION_KEY',
    );
  });
});
