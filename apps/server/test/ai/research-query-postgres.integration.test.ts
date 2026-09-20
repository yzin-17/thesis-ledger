import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiRunService } from '../../src/ai/ai.service.js';

const databaseUrl = process.env.RESEARCH_QUERY_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

const strategyId = '71111111-1111-4111-8111-111111111111';
const strategyVersionId = '72111111-1111-4111-8111-111111111111';
const experimentId = '73111111-1111-4111-8111-111111111111';
const attemptId = '74111111-1111-4111-8111-111111111111';
const regularRunId = '75111111-1111-4111-8111-111111111111';
const internalRunId = '76111111-1111-4111-8111-111111111111';
const unknownRunId = '77111111-1111-4111-8111-111111111111';

describeDatabase('研究助手 PostgreSQL 查询', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
  const service = new AiRunService(prisma as never);

  beforeAll(async () => {
    await prisma.strategy.create({
      data: { id: strategyId, name: '查询集成策略' },
    });
    await prisma.strategyVersion.create({
      data: {
        id: strategyVersionId,
        strategyId,
        version: 1,
        schemaVersion: 2,
        schema: {},
      },
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "ownerKey", "baselineStrategyVersionId", "status", "stage", "objective",
        "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig",
        "budget", "maxRounds", "idempotencyKey"
      ) VALUES (
        ${experimentId}::uuid, 'research-query-test', ${strategyVersionId}::uuid,
        'succeeded', 'complete', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
        'research-query-fingerprint', '{}'::jsonb, '{}'::jsonb, 1,
        'research-query-integration-20260918'
      )
    `);

    await prisma.aiRun.createMany({
      data: [
        {
          id: regularRunId,
          provider: 'fixture',
          model: 'research-fixture',
          promptVersion: 'research-v1',
          status: 'succeeded',
          question: '查询集成：组合风险',
          context: { scope: 'portfolio' },
          result: {
            version: 1,
            provider: 'fixture',
            conclusion: '组合集中度需要持续观察。',
            evidence: [
              {
                claim: '集中度事实',
                citations: [
                  {
                    tool: 'portfolio',
                    sourceId: 'portfolio',
                    provider: 'fixture',
                    observedAt: '2026-09-18T08:00:00Z',
                  },
                ],
              },
            ],
            risks: [],
            unknowns: [],
            signals: [],
            disclaimer: '仅供研究参考。',
            createdAt: '2026-09-18T08:00:00Z',
          },
        },
        {
          id: internalRunId,
          provider: 'fixture',
          model: 'optimizer-fixture',
          promptVersion: 'strategy-optimization-v1',
          status: 'succeeded',
          question: '查询集成：实验内部轮次',
          context: { scope: 'strategy', strategyVersionId },
          modelMetadata: { optimizationExperimentId: experimentId },
          result: { proposal: {} },
        },
        {
          id: unknownRunId,
          provider: 'fixture',
          model: 'legacy-fixture',
          promptVersion: 'legacy-v0',
          status: 'future-state',
          question: '查询集成：未知历史记录',
          context: Prisma.JsonNull,
        },
      ],
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationAttempt" (
        "id", "experimentId", "modelKey", "aiRunId", "attempt", "status"
      ) VALUES (
        ${attemptId}::uuid, ${experimentId}::uuid, 'fixture-model', ${internalRunId}::uuid,
        1, 'succeeded'
      )
    `);
    await prisma.aiRun.update({
      where: { id: regularRunId },
      data: { updatedAt: new Date('2026-09-18T08:03:00Z') },
    });
    await prisma.aiRun.update({
      where: { id: internalRunId },
      data: { updatedAt: new Date('2026-09-18T08:02:00Z') },
    });
    await prisma.aiRun.update({
      where: { id: unknownRunId },
      data: { updatedAt: new Date('2026-09-18T08:01:00Z') },
    });
  });

  afterAll(async () => {
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM "OptimizationAttempt" WHERE "id"=${attemptId}::uuid`,
    );
    await prisma.aiRun.deleteMany({
      where: { id: { in: [regularRunId, internalRunId, unknownRunId] } },
    });
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM "OptimizationExperiment" WHERE "id"=${experimentId}::uuid`,
    );
    await prisma.strategyVersion.deleteMany({ where: { id: strategyVersionId } });
    await prisma.strategy.deleteMany({ where: { id: strategyId } });
    await prisma.$disconnect();
  });

  it('默认排除已核验内部任务，同时保留未知历史记录', async () => {
    const page = await service.listResearchPage({ view: 'research' });
    expect(page.items.map((item) => item.id)).toEqual([regularRunId, unknownRunId]);
    expect(page.items[0]?.display).toMatchObject({
      primaryStatus: 'completed',
      summary: '组合集中度需要持续观察。',
    });
    expect(page.items[1]?.display).toMatchObject({
      taskKind: 'unknown',
      primaryStatus: 'unrecognized',
    });
  });

  it('内部范围、来源、搜索和状态均在分页前执行', async () => {
    const internal = await service.listResearchPage({
      view: 'research',
      includeInternal: true,
      source: 'strategy_experiment',
      search: '实验内部',
      status: 'succeeded',
    });
    expect(internal.items).toHaveLength(1);
    expect(internal.items[0]).toMatchObject({
      id: internalRunId,
      display: {
        taskKind: 'experiment_internal',
        resultAvailability: 'unsupported',
        source: { type: 'strategy_experiment', label: '策略实验' },
      },
    });
  });

  it('updatedAt + id 游标形成稳定页面，且只读查询不写业务事实', async () => {
    const before = await prisma.aiRun.count();
    const first = await service.listResearchPage({ view: 'research', limit: 1 });
    const second = await service.listResearchPage({
      view: 'research',
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });
    const after = await prisma.aiRun.count();

    expect(first.items.map((item) => item.id)).toEqual([regularRunId]);
    expect(second.items.map((item) => item.id)).toEqual([unknownRunId]);
    expect(after).toBe(before);
  });
});
