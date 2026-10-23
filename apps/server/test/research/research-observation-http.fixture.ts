import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ForbiddenException, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type Prisma, type PrismaClient } from '@prisma/client';
import { vi } from 'vitest';
import { ResearchObservationsController } from '../../src/research/research-observations.controller.js';
import { ResearchObservationService } from '../../src/research/research-observation.service.js';
import { ResearchObservationQueries } from '../../src/research/research-observation.queries.js';
import { ResearchObservationStore } from '../../src/research/research-observation.store.js';
import { ResearchObservationAccess } from '../../src/research/research-observation-access.js';
import { ResearchObservationMaterials } from '../../src/research/research-observation-materials.js';
import { ResearchScopeReader } from '../../src/research/research-scope-reader.js';
import { AiResearchReportsQuery } from '../../src/ai/ai-research-reports.query.js';
import { InstrumentService } from '../../src/market/instrument.service.js';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { IdentityGuard } from '../../src/identity/identity.guard.js';
import { IdentityService } from '../../src/identity/identity.service.js';
import { localIdentityPrincipal } from '../../src/identity/local-workspace.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';
import { comparisonReport } from './research-comparison.fixture.js';
import { observationMarketFixture } from './research-observation-market.fixture.js';
import type { ObservationCalendar } from '../../src/research/research-observation-method.js';

/** 真实权限、HTTP、产物投影和数据库；Market 端口为明示合成合同，无外部请求。 */
export async function createObservationHttpFixture(prisma: PrismaClient) {
  let sample = observationMarketFixture();
  let revoked = false;
  const calendar = vi.fn<() => Promise<ObservationCalendar>>(async () => sample.method.calendar);
  const prices = vi.fn(async () => sample.selected);
  const materials = new ResearchObservationMaterials(
    { read: calendar } as never,
    { readV3: prices } as never,
  );
  const scopes = new ResearchScopeReader(prisma as never, new InstrumentService(prisma as never));
  const original = scopes.assertSnapshot.bind(scopes);
  vi.spyOn(scopes, 'assertSnapshot').mockImplementation(async (...args) => {
    if (revoked) throw new ForbiddenException('受控权限已撤销');
    return original(...args);
  });
  const identities = new IdentityService(prisma as never);
  Reflect.defineMetadata('design:paramtypes', [IdentityService], IdentityGuard);
  class TestModule {}
  Module({
    controllers: [ResearchObservationsController],
    providers: [
      ResearchObservationService,
      ResearchObservationQueries,
      ResearchObservationStore,
      ResearchObservationAccess,
      AiResearchReportsQuery,
      { provide: PrismaService, useValue: prisma },
      { provide: ResearchScopeReader, useValue: scopes },
      { provide: ResearchObservationMaterials, useValue: materials },
      { provide: IdentityService, useValue: identities },
      { provide: IdentityGuard, useValue: new IdentityGuard(identities) },
    ],
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const request = (
    id: string,
    path: string,
    input?: unknown,
    query: Record<string, string> = { view: 'scoped', mode: 'shadow' },
  ) =>
    fetch(
      `${url}/api/v1/research/reports/${id}/observations${path}?${new URLSearchParams(query)}`,
      input === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
          },
    );
  return {
    calendar,
    prices,
    materials,
    reset() {
      sample = observationMarketFixture();
      revoked = false;
      calendar.mockReset();
      prices.mockReset();
      calendar.mockImplementation(async () => sample.method.calendar);
      prices.mockImplementation(async () => sample.selected);
    },
    revoke() {
      revoked = true;
    },
    restore() {
      revoked = false;
    },
    async seed(options: { ownerId?: string; retryOfRunId?: string; qualitative?: boolean } = {}) {
      const fixture = comparisonReport({
        result: (value) => {
          const evidenceIds = [value.evidenceBindings[0]!.audit.evidenceId];
          if (options.qualitative)
            value.inference.claims = [
              {
                id: 'manual-1',
                kind: 'qualitative',
                description: '合成非价格论点',
                rationale: '人工查看',
                evidenceIds,
              },
            ];
          else
            value.inference.claims = [
              { ...sample.method.claim, instrumentId: sample.instrument.instrumentId, evidenceIds },
            ];
          value.inference.nextSteps = value.inference.nextSteps.map((step) => ({
            ...step,
            claimId: step.claimId === null ? null : value.inference.claims[0]!.id,
          }));
        },
      });
      const row = fixture.row;
      await prisma.aiRun.create({
        data: {
          id: row.id,
          provider: row.provider,
          model: row.model,
          promptVersion: row.promptVersion,
          status: row.status,
          question: row.question,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          completedAt: row.completedAt,
          researchSubmissionId: row.researchSubmissionId,
          researchInputDigest: row.researchInputDigest,
          researchOwnerId: options.ownerId ?? localIdentityPrincipal()!.id,
          retryOfRunId: options.retryOfRunId ?? null,
          context: {},
          result: row.result as Prisma.InputJsonValue,
          modelMetadata: row.modelMetadata as Prisma.InputJsonValue,
          researchScopeSnapshot: row.researchScopeSnapshot as Prisma.InputJsonValue,
        },
      });
      await prisma.aiToolCall.createMany({
        data: fixture.calls.map((call) => ({
          id: call.id,
          aiRunId: row.id,
          status: 'ok',
          tool: call.tool,
          permission: call.permission,
          provider: call.provider,
          inputSummary: call.inputSummary,
          outputSummary: '受控原始证据',
        })),
      });
      return { id: row.id, claimId: options.qualitative ? 'manual-1' : sample.method.claim.id };
    },
    input(claimId = sample.method.claim.id, asOf = '2026-11-30T08:00:00Z') {
      return { submissionId: randomUUID(), claimId, asOf };
    },
    post: (id: string, input: unknown, query?: Record<string, string>) =>
      request(id, '', input, query),
    get: (id: string, query?: Record<string, string>) => request(id, '', undefined, query),
    history: (id: string, observationId: string) => request(id, `/${observationId}/versions`),
    close: () => app.close(),
  };
}
