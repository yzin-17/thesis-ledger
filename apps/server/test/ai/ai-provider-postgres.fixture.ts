import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { expect, vi } from 'vitest';
import { AiProviderService } from '../../src/ai/ai-provider.service.js';
import { AiProviderSaveService } from '../../src/ai/ai-provider-save.service.js';
import { AiProviderValidationJournal } from '../../src/ai/ai-provider-validation-journal.js';
import { AiRoutingSettingsService } from '../../src/ai/ai-routing-settings.service.js';
import { AiProviderRegistry } from '../../src/ai/provider-registry.js';
import { AiProviderController } from '../../src/ai/ai-provider.controller.js';
import { AiSettingsController } from '../../src/ai/ai-settings.controller.js';
import { AiController } from '../../src/ai/ai.controller.js';
import { AiRunService } from '../../src/ai/ai-run.service.js';
import type { AiSdkGenerationAdapter } from '../../src/ai/ai-sdk-generation.adapter.js';
import { ProviderConfigService } from '../../src/providers/provider-config.service.js';
import { ProviderHealthService } from '../../src/providers/provider-health.service.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import { aiProviderInputSchema } from '../../src/ai/ai-provider.contracts.js';

export const databaseUrl = process.env.AI_PROVIDER_DATABASE_URL;
export const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
export const providerInput = (name: string) =>
  aiProviderInputSchema.parse({
    name,
    baseUrl: 'https://example.test/v1',
    authMode: 'none',
    models: ['model'],
    timeoutMs: 3000,
    executionRoutes: [
      {
        model: 'model',
        mode: 'native_schema',
        outputPolicy: 'manual',
        contract: aiGenerationContracts.research.ref,
      },
    ],
    modelPricing: { model: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' } },
  });
export const assertIsolated = async (prisma: PrismaClient) => {
  const url = new URL(databaseUrl ?? '');
  if (
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/ai_provider_concurrency_fixture' ||
    url.username !== 'fixture_owner'
  )
    throw new Error('仅允许独立 AI Provider 测试数据库');
  const rows = await prisma.$queryRaw<Array<{ name: string; owner: string }>>`
    SELECT current_database() AS name, current_user AS owner`;
  expect(rows).toEqual([{ name: 'ai_provider_concurrency_fixture', owner: 'fixture_owner' }]);
};
export const createStack = async (sdkOverride?: AiSdkGenerationAdapter) => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  await assertIsolated(prisma);
  const health = new ProviderHealthService(prisma as never, {} as never);
  const configs = new ProviderConfigService(prisma as never, health);
  const routing = new AiRoutingSettingsService(prisma as never);
  const sdk = {
    generate: vi.fn(async () => ({
      output: {},
      usage: { status: 'reported', inputTokens: 8, outputTokens: 4 },
      providerCost: null,
      providerCostCurrency: null,
    })),
  };
  const generation = sdkOverride ?? sdk;
  const registry = new AiProviderRegistry();
  const providers = new AiProviderService(
    configs,
    health,
    registry,
    generation as never,
    routing,
    prisma as never,
  );
  const journal = new AiProviderValidationJournal(prisma as never);
  const save = new AiProviderSaveService(providers, configs, generation as never, health, journal);
  const runs = new AiRunService(prisma as never, registry, routing);
  Reflect.defineMetadata(
    'design:paramtypes',
    [AiProviderService, AiProviderSaveService],
    AiProviderController,
  );
  Reflect.defineMetadata('design:paramtypes', [AiProviderService], AiSettingsController);
  Reflect.defineMetadata('design:paramtypes', [AiRunService], AiController);
  @Module({
    controllers: [AiProviderController, AiSettingsController, AiController],
    providers: [
      { provide: AiProviderService, useValue: providers },
      { provide: AiProviderSaveService, useValue: save },
      { provide: AiRunService, useValue: runs },
    ],
  })
  class HttpModule {}
  const app = await NestFactory.create(HttpModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const request = async (path: string, body: unknown, method = 'POST') => {
    const response = await fetch(`${origin}/api/v1${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  return {
    origin,
    prisma,
    health,
    configs,
    providers,
    routing,
    runs,
    registry,
    save,
    journal,
    sdk,
    request,
    close: async () => {
      await app.close();
      await prisma.$disconnect();
    },
  };
};
export type ProviderStack = Awaited<ReturnType<typeof createStack>>;
export const reset = async (stack: ProviderStack) => {
  await assertIsolated(stack.prisma);
  await stack.prisma.aiRoutingSettings.deleteMany();
  await stack.prisma.providerConfig.deleteMany();
  await stack.prisma.providerHealth.deleteMany();
  await stack.prisma.providerHealthCheck.deleteMany();
  stack.sdk.generate.mockClear();
};
