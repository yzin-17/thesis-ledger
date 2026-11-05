import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiProviderController } from '../../src/ai/ai-provider.controller.js';
import { AiProviderSaveService } from '../../src/ai/ai-provider-save.service.js';
import { AiProviderService } from '../../src/ai/ai-provider.service.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';

describe('AI 路由唯一性：实际 HTTP、零模型请求', () => {
  const save = vi.fn(async (input: { name: string }) => ({ name: input.name }));
  const testDraft = vi.fn(() => { throw new Error('本验收不允许模型测试'); });
  let app: Awaited<ReturnType<typeof NestFactory.create>>, baseUrl: string;
  const route = (model: string, mode: 'native_schema' | 'json_validated') => ({
    model, mode, contract: aiGenerationContracts.research.ref,
  });
  const post = (executionRoutes: ReturnType<typeof route>[]) => fetch(baseUrl + '/ai/providers', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'controlled-route-http', baseUrl: 'https://controlled.invalid/v1',
      enabled: false, authMode: 'none', models: ['model-a', 'model-b'], executionRoutes }),
  });
  beforeAll(async () => {
    Reflect.defineMetadata('design:paramtypes', [AiProviderService, AiProviderSaveService], AiProviderController);
    class TestModule {}
    Module({ controllers: [AiProviderController], providers: [
      { provide: AiProviderService, useValue: { testDraft } },
      { provide: AiProviderSaveService, useValue: { save } },
    ] })(TestModule);
    app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalFilters(new ApiExceptionFilter());
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl() + '/api/v1';
  });
  beforeEach(() => { save.mockClear(); testDraft.mockClear(); });
  afterAll(async () => { await app?.close(); });

  it.each(['native_schema', 'json_validated'] as const)(
    '同模型同用途不能再通过 %s 增加第二条路由，失败发生在保存前', async (mode) => {
      const response = await post([route('model-a', 'native_schema'), route('model-a', mode)]);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'validation_error', fields: [
        { path: 'executionRoutes', message: '同一模型、同一业务用途只能配置一条执行路由' },
      ] });
      expect(save).not.toHaveBeenCalled();
      expect(testDraft).not.toHaveBeenCalled();
    },
  );
  it('不同模型的同用途路由可普通保存，未触发连接或生成测试', async () => {
    const response = await post([route('model-a', 'native_schema'), route('model-b', 'json_validated')]);
    expect(response.status).toBe(201);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[0]).toMatchObject({ enabled: false,
      executionRoutes: [route('model-a', 'native_schema'), route('model-b', 'json_validated')] });
    expect(testDraft).not.toHaveBeenCalled();
  });
});
