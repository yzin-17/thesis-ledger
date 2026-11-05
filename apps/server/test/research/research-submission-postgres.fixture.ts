import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import { vi } from 'vitest';
import { ResearchController } from '../../src/research/research.controller.js';
import { ResearchReportsController } from '../../src/research/research-reports.controller.js';
import { AiResearchReportsQuery } from '../../src/ai/ai-research-reports.query.js';
import { AiController } from '../../src/ai/ai.controller.js';
import { ResearchSubmissionService } from '../../src/research/research-submission.service.js';
import { ResearchScopeReader } from '../../src/research/research-scope-reader.js';
import { AiRunService } from '../../src/ai/ai-run.service.js';
import { AiResearchExecutor } from '../../src/ai/ai-research.executor.js';
import { PromptVersionRegistry } from '../../src/ai/prompt-registry.js';
import { researchPromptsV2 } from '../../src/ai/ai-research-prompts-v2.js';
import { MarketService } from '../../src/market/market.service.js';
import { MarketNewsReader } from '../../src/market/market-news-reader.js';
import { InstrumentService } from '../../src/market/instrument.service.js';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import { IdentityGuard } from '../../src/identity/identity.guard.js';
import { IdentityService, IDENTITY_SESSION_HEADER } from '../../src/identity/identity.service.js';
import { createResearchExecutionV2Harness } from '../ai/research-execution-v2.fixture.js';
import { createResearchDataHttpFixture } from './research-data-http.fixture.js';

export function controlledRedis() {
  const values = new Map<string, string>();
  const locks = new Map<string, string>();
  return {
    values,
    clear: () => {
      values.clear();
      locks.clear();
    },
    client: {
      get: async (key: string) => locks.get(key) ?? values.get(key) ?? null,
      set: async (key: string, value: string) => {
        if (locks.has(key)) return null;
        locks.set(key, value);
        return 'OK';
      },
      eval: async (_script: string, _count: number, key: string, value: string) => {
        if (locks.get(key) === value) locks.delete(key);
        return 1;
      },
      multi: () => {
        const writes: Array<[string, string]> = [];
        const chain = {
          set: (key: string, value: string) => {
            writes.push([key, value]);
            return chain;
          },
          exec: async () => {
            for (const [key, value] of writes) values.set(key, value);
          },
        };
        return chain;
      },
    },
  };
}

export async function createResearchSubmissionPostgresHarness(
  prisma: PrismaClient,
  dataOverride?: Awaited<ReturnType<typeof createResearchDataHttpFixture>>,
  dsaTimeoutMs = 2_000,
) {
  const data = dataOverride ?? (await createResearchDataHttpFixture());
  const models = await createResearchExecutionV2Harness(prisma);
  const dsa = Object.assign(Object.create(DsaClient.prototype), {
    config: { dsaBaseUrl: data.baseUrl, dsaTimeoutMs, dsaToken: 'controlled-data-token' },
  }) as DsaClient;
  const redis = controlledRedis();
  const market = new MarketService(dsa, redis as never, prisma as never);
  const news = new MarketNewsReader(dsa);
  const instruments = new InstrumentService(prisma as never);
  const scopes = new ResearchScopeReader(prisma as never, instruments);
  const prompts = new PromptVersionRegistry();
  for (const prompt of researchPromptsV2) prompts.register(prompt);
  const dispatch = {
    dispatch: vi.fn(),
    cancelActive: vi.fn(),
    capabilities: () => ({ canStart: true, providers: [], checkedAt: new Date().toISOString() }),
  };
  const identities = new IdentityService(prisma as never);
  Reflect.defineMetadata('design:paramtypes', [IdentityService], IdentityGuard);
  Reflect.defineMetadata('design:paramtypes', [AiRunService, AiResearchExecutor], AiController);
  class TestModule {}
  Module({
    controllers: [ResearchController, ResearchReportsController, AiController],
    providers: [
      ResearchSubmissionService,
      AiResearchReportsQuery,
      { provide: AiRunService, useValue: models.runs },
      { provide: AiResearchExecutor, useValue: dispatch },
      { provide: ResearchScopeReader, useValue: scopes },
      { provide: PromptVersionRegistry, useValue: prompts },
      { provide: MarketService, useValue: market },
      { provide: MarketNewsReader, useValue: news },
      { provide: PrismaService, useValue: prisma },
      { provide: IdentityService, useValue: identities },
      { provide: IdentityGuard, useValue: new IdentityGuard(identities) },
    ],
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  return {
    data,
    models,
    dispatch,
    redis,
    identities,
    input(revision: string) {
      return {
        version: 2,
        submissionId: randomUUID(),
        mode: 'shadow',
        scope: { scope: 'instrument', instrumentId: '00000000-0000-4000-8000-000000000001' },
        question: '只根据选定标的资料说明风险。',
        templateId: 'primary-risks',
        researchSettingsRevision: revision,
      };
    },
    post(input: unknown, action = '', signal?: AbortSignal, session?: string) {
      return fetch(`${baseUrl}/api/v1/research/submissions${action}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session ? { [IDENTITY_SESSION_HEADER]: session } : {}),
        },
        body: JSON.stringify(input),
        ...(signal ? { signal } : {}),
      });
    },
    get(path: string, query: Record<string, string | number> = {}, session?: string) {
      return fetch(
        `${baseUrl}/api/v1${path}?${new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]))}`,
        { headers: session ? { [IDENTITY_SESSION_HEADER]: session } : {} },
      );
    },
    async close() {
      await app.close();
      await data.close();
      await models.close();
    },
  };
}
