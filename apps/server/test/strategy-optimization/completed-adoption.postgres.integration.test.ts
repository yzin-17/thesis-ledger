import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { optimizationAdoptionContextSchema, optimizationAdoptionReadSchema } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startIsolatedNavPostgres } from "../backtest/nav-postgres.integration-harness.js";
import { ResultReadPolicyService } from "../../src/platform/result-read-policy.service.js";
import { StrategyOptimizationReadService } from "../../src/strategy-optimization/strategy-optimization-read.service.js";
import { StrategyOptimizationService } from "../../src/strategy-optimization/strategy-optimization.service.js";
import { createDiscoverySeed } from "../../src/strategy-optimization/strategy-optimization-discovery.js";
import { optimizationSha256 } from "../../src/strategy-optimization/strategy-optimization-common.js";
import { StrategyRiskApplicationService } from '../../src/strategy-optimization/strategy-risk-application.service.js';
import { StrategyRiskApplicationStoreService } from '../../src/strategy-optimization/strategy-risk-application-store.service.js';
import { StrategyOptimizationController } from '../../src/strategy-optimization/strategy-optimization.controller.js';

describe.skipIf(process.env.COMPLETED_ADOPTION_POSTGRES !== "1")(
  "隔离数据库的完成候选采纳",
  () => {
    let db: Awaited<ReturnType<typeof startIsolatedNavPostgres>>;
    let service: StrategyOptimizationService;
    let controller: StrategyOptimizationController;
    let riskApplications: StrategyRiskApplicationService;
    beforeAll(async () => {
      db = await startIsolatedNavPostgres();
      const providers = { list: () => [] };
      riskApplications = new StrategyRiskApplicationService(
        db.prisma,
        {} as never,
        new StrategyRiskApplicationStoreService(db.prisma),
        {} as never,
      );
      service = new StrategyOptimizationService(
        db.prisma,
        providers as never,
        {} as never,
        new StrategyOptimizationReadService(
          db.prisma,
          providers as never,
          new ResultReadPolicyService(db.prisma),
        ),
        {} as never,
        riskApplications,
      );
      controller = new StrategyOptimizationController(service, {} as never, riskApplications, {} as never);
    }, 120000);
    afterAll(async () => {
      await db?.cleanup();
    }, 30000);

    it.each(["valid", "invalid", "test_valid", "test_invalid"])(
      "%s 可发布且重放幂等，不改变评价记录",
      async (validationStatus) => {
        const schema = createDiscoverySeed(
          {
            executionInstrument: {
              symbol: "00700.HK",
              market: "HK",
              assetType: "stock",
            },
            primaryTimeframe: "1d",
          },
          true,
        );
        schema.risk.push({ type: 'fixedStop', percent: '0.03' });
        schema.risk.push({ type: 'maxHoldingPeriod', periods: 10 });
        const strategy = await db.prisma.strategy.create({
          data: {
            name: "隔离采纳样本",
            status: "experiment-only",
            schemaVersion: 3,
          },
        });
        const baseline = await db.prisma.strategyVersion.create({
          data: {
            strategyId: strategy.id,
            version: 0,
            schemaVersion: 3,
            schema: schema as Prisma.InputJsonValue,
          },
        });
        const version = await db.prisma.strategyVersion.create({
          data: {
            strategyId: strategy.id,
            version: -1,
            schemaVersion: 3,
            schema: schema as Prisma.InputJsonValue,
          },
        });
        const id = randomUUID(),
          candidateId = randomUUID(),
          key = randomUUID(),
          hash = optimizationSha256(schema);
        await db.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" ("id", "sourceMode", "discoveryScope", "strategySpaceVersion", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds", "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds", "exposure", "idempotencyKey")
      VALUES (${id}::uuid, 'discovery', ${JSON.stringify({ executionInstrument: schema.executionInstrument, primaryTimeframe: "1d" })}::jsonb, 'strategy-space-price-research-v1', ${baseline.id}::uuid, 'succeeded', 'completed', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'isolated', '[]'::jsonb, '{}'::jsonb, 1, '{"testRevealed":true}'::jsonb, ${randomUUID()})
    `);
        await db.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationCandidate" ("id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId", "executionHash", "proposal", "diff", "validationStatus", "runRefs", "metrics")
      VALUES (${candidateId}::uuid, ${id}::uuid, 1, 'isolated:model', ${version.id}::uuid, ${hash}, '{}'::jsonb, '[]'::jsonb, ${validationStatus}, '{}'::jsonb, '{}'::jsonb)
    `);
        const input = {
          candidateId,
          candidateHash: hash,
          expectedStrategyVersion: 0,
          idempotencyKey: key,
        };
        if (validationStatus === 'test_invalid') {
          const responseFailure = vi.spyOn(riskApplications, 'monitoringPlan')
            .mockRejectedValueOnce(new Error('受控提交后响应读取失败'));
          const partial = await controller.adopt(id, input);
          expect(partial).toMatchObject({ detailsStatus: 'unavailable', strategyVersion: { version: 1 } });
          expect(optimizationAdoptionReadSchema.safeParse(JSON.parse(JSON.stringify(partial))).success).toBe(true);
          responseFailure.mockRestore();
        }
        const first = await controller.adopt(id, input),
          replay = await controller.adopt(id, input);
        const committed = await db.prisma.$queryRaw<Array<{ formalStrategyVersionId: string }>>(
          Prisma.sql`SELECT "formalStrategyVersionId" FROM "OptimizationAdoption" WHERE "candidateId"=${candidateId}::uuid`,
        );
        expect(committed).toHaveLength(1);
        expect(first.strategyVersion.id).toBe(committed[0]!.formalStrategyVersionId);
        expect(await db.prisma.strategyVersion.count({ where: { strategyId: strategy.id, version: { gt: 0 } } })).toBe(1);
        for (const result of [first, replay]) {
          if (result.detailsStatus !== 'ready') throw new Error('正常读取应返回完整采纳响应');
          expect(optimizationAdoptionReadSchema.parse(JSON.parse(JSON.stringify(result)))).toMatchObject({
            riskApplicationEnabled: false,
            riskApplicationDiffs: [],
          });
          expect(result.monitoringPlan.coverage.riskMapped).toBe(schema.risk.length);
        }
        expect(first.strategyVersion.version).toBe(1);
        expect(replay.strategyVersion.id).toBe(first.strategyVersion.id);
        await expect(
          service.adopt(id, { ...input, idempotencyKey: randomUUID() }),
        ).rejects.toMatchObject({
          response: { errorCode: "ADOPTION_ALREADY_COMMITTED" },
        });
        const rows = await db.prisma.$queryRaw<
          Array<{ validationStatus: string }>
        >(
          Prisma.sql`SELECT "validationStatus" FROM "OptimizationCandidate" WHERE "id"=${candidateId}::uuid`,
        );
        expect(rows[0]!.validationStatus).toBe(validationStatus);
      const secondSchema = { ...schema, name: "第二个候选", entry: { type: 'positionState' as const, field: 'isOpen' as const } };
        const secondVersion = await db.prisma.strategyVersion.create({
          data: {
            strategyId: strategy.id,
            version: -2,
            schemaVersion: 3,
            schema: secondSchema as Prisma.InputJsonValue,
          },
        });
        const secondId = randomUUID(),
          secondHash = optimizationSha256(secondSchema);
        await db.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationCandidate" ("id", "experimentId", "candidateNumber", "modelKey", "candidateStrategyVersionId", "executionHash", "proposal", "diff", "validationStatus", "runRefs", "metrics")
      VALUES (${secondId}::uuid, ${id}::uuid, 2, 'isolated:model', ${secondVersion.id}::uuid, ${secondHash}, '{}'::jsonb, '[]'::jsonb, 'test_invalid', '{}'::jsonb, '{}'::jsonb)
    `);
        const context = await service.adoptionContext(id, secondId);
      expect(optimizationAdoptionContextSchema.safeParse(JSON.parse(JSON.stringify(context))).success).toBe(true);
        expect(context.expectedStrategyVersion).toBe(1);
        const secondInput = {
          candidateId: secondId,
          candidateHash: secondHash,
          expectedStrategyVersion: context.expectedStrategyVersion,
          idempotencyKey: randomUUID(),
        };
        const second = await controller.adopt(id, secondInput);
        expect(optimizationAdoptionReadSchema.parse(JSON.parse(JSON.stringify(second)))).toMatchObject({
          monitoringDiff: {
            before: { strategyVersionId: first.strategyVersion.id },
            after: { strategyVersionId: second.strategyVersion.id },
          },
        });
        expect(second.strategyVersion.version).toBe(2);
        expect((await service.adopt(id, secondInput)).strategyVersion.id).toBe(
          second.strategyVersion.id,
        );
        expect((await service.adopt(id, input)).strategyVersion.id).toBe(
          first.strategyVersion.id,
        );
        expect(await db.prisma.aiRun.count()).toBe(0);
        expect(await db.prisma.$queryRaw(Prisma.sql`SELECT count(*)::int AS count FROM "StrategyRiskApplication"`)).toEqual([{ count: 0 }]);
        const reads = new StrategyOptimizationReadService(
          db.prisma, { list: () => [] } as never, new ResultReadPolicyService(db.prisma),
        );
        for (const strategyVersionId of [baseline.id, first.strategyVersion.id, second.strategyVersion.id]) {
          const related = await reads.list({ strategyVersionId, limit: 1 });
          expect(related.items.map((item) => item.id)).toEqual([id]);
          expect(related.totalCount).toBe(1);
          expect(related.pageInfo).toEqual({ hasNextPage: false, nextCursor: null });
        }
        const sourceFiltered = await reads.list({ strategyVersionId: first.strategyVersion.id, sourceMode: 'existing' });
        expect(sourceFiltered.totalCount).toBe(0);
        const unrelatedVersion = await db.prisma.strategyVersion.create({ data: {
          strategyId: strategy.id, version: 3, schemaVersion: 3, schema: schema as Prisma.InputJsonValue,
        } });
        const unrelated = await reads.list({ strategyVersionId: unrelatedVersion.id });
        expect(unrelated.items).toEqual([]);
        expect(unrelated.totalCount).toBe(0);
      },
    );
  },
);
