import { describe, expect, it } from 'vitest';
import { aiModelRequestOptionsSchema } from '../src/ai-model-request-options.js';
import { aiProviderInputSchema } from '../src/ai-provider-management-input.js';

describe('通用模型请求参数', () => {
  it('允许非认证网关头，拒绝凭据、连接头及控制字符', () => {
    expect(
      aiModelRequestOptionsSchema.parse({ headers: { 'x-observation': 'true' } }).headers,
    ).toEqual({ 'x-observation': 'true' });
    for (const name of [
      'Authorization',
      'cf-aig-authorization',
      'cf-access-client-secret',
      'x-api-key',
      'cookie',
      'Host',
      'content-type',
      'content-length',
      'connection',
      '__proto__',
      'bad name',
      'K',
    ]) {
      expect(
        aiModelRequestOptionsSchema.safeParse({ headers: Object.fromEntries([[name, 'value']]) })
          .success,
      ).toBe(false);
    }
    expect(
      aiModelRequestOptionsSchema.safeParse({ headers: { 'x-observation': 'one\r\ntwo' } }).success,
    ).toBe(false);
  });
  it('保留嵌套参数、数组和显式null，不制造供应商参数', () => {
    const input = {
      outputTokenLimit: 'upstream',
      body: { custom: { enabled: false, values: [1, null] } },
    };
    expect(aiModelRequestOptionsSchema.parse(input)).toEqual(input);
    expect(aiModelRequestOptionsSchema.parse({})).toEqual({});
    expect(
      aiProviderInputSchema.parse({ name: 'p', baseUrl: 'https://example.test/v1', models: ['m'] }),
    ).not.toHaveProperty('modelDefaults');
  });

  it.each([
    'model',
    'models',
    'provider',
    'messages',
    'prompt',
    'system_prompt',
    'system',
    'input',
    'instructions',
    'response_format',
    'text',
    'output_config',
    'stream',
    'stream_options',
    'tools',
    'tool_choice',
    'functions',
    'function_call',
    'parallel_tool_calls',
    'n',
    'max_tokens',
    'max_completion_tokens',
    'max_output_tokens',
    'max_retries',
    'timeout',
    'headers',
    'url',
    'base_url',
  ])('拒绝覆盖系统字段 %s', (key) => {
    expect(aiModelRequestOptionsSchema.safeParse({ body: { [key]: 1 } }).success).toBe(false);
  });

  it.each([
    '__proto__',
    'prototype',
    'constructor',
    'authorization',
    'api_key',
    'credentials',
    'access_token',
  ])('拒绝嵌套凭据／原型键 %s', (key) => {
    const body = JSON.parse('{"custom":{"' + key + '":"value"}}') as unknown;
    expect(aiModelRequestOptionsSchema.safeParse({ body }).success).toBe(false);
  });

  it('拒绝非JSON、过大、过深和循环输入，错误不溢出', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    let deep: unknown = true;
    for (let i = 0; i < 1000; i++) deep = { nested: deep };
    for (const body of [
      [],
      null,
      1,
      { value: Infinity },
      { value: 1n },
      { value: () => 1 },
      { value: 'x'.repeat(17000) },
      cyclic,
      deep,
    ]) {
      expect(aiModelRequestOptionsSchema.safeParse({ body }).success).toBe(false);
    }
  });

  it('模型默认参数参与输入合同且不能设置未选择模型', () => {
    const input = {
      name: 'p',
      baseUrl: 'https://example.test/v1',
      models: ['m'],
      modelDefaults: {
        m: {
          mode: 'json_mode',
          requestOptions: { body: { temperature: 0 }, outputTokenLimit: 'upstream' },
        },
      },
    };
    expect(aiProviderInputSchema.parse(input).modelDefaults).toEqual(input.modelDefaults);
    expect(aiProviderInputSchema.safeParse({ ...input, models: ['other'] }).success).toBe(false);
  });
});
