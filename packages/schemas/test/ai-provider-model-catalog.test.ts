import { describe, expect, it } from 'vitest';
import {
  aiProviderInputSchema,
  aiProviderModelCatalogConfigSchema,
  aiProviderModelCatalogInputSchema,
  aiProviderRecordSchema,
} from '../src/index.js';

const config = {
  url: 'https://api.example/catalog?scope=text',
  itemsPath: '/items',
  idPath: '/name',
  filter: { path: '/kind', equals: 'chat' },
  pagination: {
    pageParam: 'page',
    pageSizeParam: 'limit',
    pageSize: 100,
    startPage: 0,
    stopWhen: 'empty-page' as const,
  },
};
const input = { name: 'example', baseUrl: 'https://api.example/v1', models: ['example-model'] };

describe('Provider 模型目录声明式合同', () => {
  it('在保存输入、目录请求及安全回显中保留同一配置', () => {
    const saved = aiProviderInputSchema.parse({ ...input, modelCatalog: config });
    const query = aiProviderModelCatalogInputSchema.parse({
      baseUrl: input.baseUrl,
      modelCatalog: config,
    });
    const record = aiProviderRecordSchema.parse({
      ...input,
      modelCatalog: config,
      type: 'ai',
      enabled: false,
      priority: 100,
      capabilities: ['chat'],
      health: 'unknown',
      apiKey: 'not-returned',
    });
    expect(saved.modelCatalog).toEqual(config);
    expect(query.modelCatalog).toEqual(config);
    expect(record.modelCatalog).toEqual(config);
    expect(record).not.toHaveProperty('apiKey');
  });

  it('区分省略配置与显式清除', () => {
    expect(aiProviderInputSchema.parse(input)).not.toHaveProperty('modelCatalog');
    expect(aiProviderInputSchema.parse({ ...input, modelCatalog: null }).modelCatalog).toBeNull();
    expect(
      aiProviderModelCatalogInputSchema.parse({ baseUrl: input.baseUrl, modelCatalog: null })
        .modelCatalog,
    ).toBeNull();
  });

  it.each(['', '/data', '/a~1b/~0name', '/nested/0/id'])('接受标准 JSON Pointer %s', (path) => {
    expect(
      aiProviderModelCatalogConfigSchema.safeParse({ ...config, itemsPath: path, idPath: path })
        .success,
    ).toBe(true);
  });

  it.each(['data', '/a~', '/bad~2name'])('拒绝无效路径 %s', (path) => {
    expect(
      aiProviderModelCatalogConfigSchema.safeParse({ ...config, itemsPath: path }).success,
    ).toBe(false);
  });

  it.each([
    'not-a-url',
    'ftp://api.example/catalog',
    'https://user:secret@api.example/catalog',
    'https://api.example/catalog#fragment',
  ])('拒绝无效目录地址 %s', (url) => {
    expect(aiProviderModelCatalogConfigSchema.safeParse({ ...config, url }).success).toBe(false);
  });

  it('拒绝把已有认证发送到其他来源，允许无认证目录使用不同来源', () => {
    const modelCatalog = { ...config, url: 'https://other.example/catalog' };
    expect(aiProviderInputSchema.safeParse({ ...input, modelCatalog }).success).toBe(false);
    expect(
      aiProviderModelCatalogInputSchema.safeParse({ baseUrl: input.baseUrl, modelCatalog }).success,
    ).toBe(false);
    expect(
      aiProviderInputSchema.safeParse({ ...input, authMode: 'none', modelCatalog }).success,
    ).toBe(true);
  });

  it.each([
    { pageSize: 0 },
    { pageSize: 2001 },
    { startPage: -1 },
    { pageParam: 'limit' },
    { stopWhen: 'cursor' },
  ])('拒绝无效分页 %j', (change) => {
    expect(
      aiProviderModelCatalogConfigSchema.safeParse({
        ...config,
        pagination: { ...config.pagination, ...change },
      }).success,
    ).toBe(false);
  });

  it('不接受执行脚本或隐含协议字段', () => {
    expect(
      aiProviderModelCatalogConfigSchema.safeParse({ ...config, script: 'return input' }).success,
    ).toBe(false);
    expect(
      aiProviderModelCatalogConfigSchema.safeParse({ ...config, method: 'POST' }).success,
    ).toBe(false);
  });
});
