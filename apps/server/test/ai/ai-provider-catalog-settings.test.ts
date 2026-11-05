import { describe, expect, it, vi } from 'vitest';
import {
  aiGenerationContracts,
  aiProviderRecordSchema,
  type AiProviderModelCatalogConfig,
} from '@thesis-ledger/schemas';
import { AiProviderSaveService } from '../../src/ai/ai-provider-save.service.js';
import { aiProviderInputSchema, type AiProviderInput } from '../../src/ai/ai-provider.contracts.js';
import {
  aiProviderSummaryFromRow,
  parseAiProviderSettings,
} from '../../src/ai/ai-provider-summary.js';
import { settingsFromAiProviderInput } from '../../src/ai/ai-provider-readiness.persistence.js';
import { routeValidationFingerprint } from '../../src/ai/ai-provider-validation-policy.js';

const config: AiProviderModelCatalogConfig = {
  url: 'https://example.test/catalog',
  itemsPath: '/result',
  idPath: '/name',
  filter: { path: '/kind', equals: 'text' },
};
const input = (modelCatalog?: AiProviderModelCatalogConfig | null) =>
  aiProviderInputSchema.parse({
    name: 'example',
    baseUrl: 'https://example.test/v1',
    models: ['example-model'],
    enabled: false,
    ...(modelCatalog === undefined ? {} : { modelCatalog }),
  });
const stored = () => settingsFromAiProviderInput(input(config));

describe('Provider 模型目录配置保存与回显', () => {
  it('实际保存入口不调用生成，序列化、解析及安全投影保留配置', async () => {
    let row = {
      id: 'provider-id',
      name: 'example',
      type: 'ai',
      enabled: false,
      priority: 100,
      capabilities: ['chat'],
      health: 'unknown',
      encryptedCredentials: 'encrypted-fixture',
      updatedAt: new Date('2026-10-26T00:00:00Z'),
      settings: settingsFromAiProviderInput(input()),
    };
    const configs = {
      findStored: vi.fn(async () => row),
      readCredential: vi.fn(async () => 'fixture-secret'),
    };
    const sdk = { generate: vi.fn() };
    const providers = {
      save: vi.fn(async (value: AiProviderInput) => {
        row = {
          ...row,
          settings: settingsFromAiProviderInput(value, row.settings),
          updatedAt: new Date('2026-10-26T00:00:01Z'),
        };
        return aiProviderSummaryFromRow(row as never, parseAiProviderSettings(row.settings), null);
      }),
    };
    const service = new AiProviderSaveService(
      providers as never,
      configs as never,
      sdk as never,
      { recordHistory: vi.fn() } as never,
      { passed: vi.fn(async () => []) } as never,
    );
    const value = { ...input(config), expectedRevision: row.updatedAt.toISOString() };
    expect((await service.plan(value)).maxCalls).toBe(0);
    const saved = await service.save(value);
    const returned = aiProviderRecordSchema.parse(saved);
    expect(returned.modelCatalog).toEqual(config);
    expect(returned.enabled).toBe(false);
    expect(returned).not.toHaveProperty('encryptedCredentials');
    expect(parseAiProviderSettings(row.settings)?.modelCatalog).toEqual(config);
    expect(sdk.generate).not.toHaveBeenCalled();
  });

  it('旧客户端省略配置时保留已存规则，显式 null 清除', () => {
    expect(settingsFromAiProviderInput(input(), stored()).modelCatalog).toEqual(config);
    expect(settingsFromAiProviderInput(input(null), stored())).not.toHaveProperty('modelCatalog');
    expect(
      parseAiProviderSettings(settingsFromAiProviderInput(input(null), stored())),
    ).not.toHaveProperty('modelCatalog');
  });

  it('拒绝损坏或跨认证来源的已存规则，不退回另一条请求路径', () => {
    expect(
      parseAiProviderSettings({ ...stored(), modelCatalog: { ...config, itemsPath: 'invalid' } }),
    ).toBeNull();
    expect(
      parseAiProviderSettings({
        ...stored(),
        modelCatalog: { ...config, url: 'https://other.test/catalog' },
      }),
    ).toBeNull();
  });

  it('修改目录规则不改变生成用途的验证指纹', () => {
    const route = {
      model: 'example-model',
      mode: 'native_schema' as const,
      contract: aiGenerationContracts.research.ref,
    };
    expect(routeValidationFingerprint(input(config), route, 'fixture-secret')).toBe(
      routeValidationFingerprint(input(), route, 'fixture-secret'),
    );
  });

  it('保存和解析不修改调用者原始设置', () => {
    const existing = stored();
    const before = structuredClone(existing);
    settingsFromAiProviderInput(input(null), existing);
    parseAiProviderSettings(existing);
    expect(existing).toEqual(before);
  });
});
