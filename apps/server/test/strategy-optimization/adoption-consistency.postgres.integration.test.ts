import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { optimizationAdoptionReadSchema } from '@thesis-ledger/schemas';
import { startIsolatedNavPostgres } from '../backtest/nav-postgres.integration-harness.js';
import { BacktestService } from '../../src/backtest/backtest.service.js';
import { ResultReadPolicyService } from '../../src/platform/result-read-policy.service.js';
import { StrategyOptimizationController } from '../../src/strategy-optimization/strategy-optimization.controller.js';
import {
  adoptionFixture,
  adoptionServices,
  publicationProbe,
} from './adoption-consistency.fixture.js';

describe.skipIf(process.env.ADOPTION_CONSISTENCY_POSTGRES !== '1')(
  '采纳与正式版本发布隔离一致性',
  () => {
    let db: Awaited<ReturnType<typeof startIsolatedNavPostgres>>;
    beforeAll(async () => {
      db = await startIsolatedNavPostgres();
    }, 120000);
    afterAll(async () => {
      await db?.cleanup();
    }, 30000);
    const manual = (prisma = db.prisma) =>
      new BacktestService(prisma, undefined, undefined, new ResultReadPolicyService(db.prisma));

    it('手工发布先持锁时，采纳等待并返回明确版本冲突', async () => {
      const f = await adoptionFixture(db.prisma);
      let acquired!: () => void, release!: () => void, waiting!: () => void;
      const held = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const seen = new Promise<void>((resolve) => {
        waiting = resolve;
      });
      const manualDb = publicationProbe(db.prisma, f.strategy.id, {
        afterLock: async () => {
          acquired();
          await gate;
        },
      });
      const adoptionDb = publicationProbe(db.prisma, f.strategy.id, { beforeLock: waiting });
      const publishing = manual(manualDb).createVersion(f.strategy.id, f.schema);
      await held;
      const adopting = adoptionServices(db.prisma, adoptionDb).service.adopt(f.id, f.input);
      const outcome = adopting.catch((error) => error);
      await seen;
      release();
      expect((await publishing).version).toBe(2);
      expect(await outcome).toMatchObject({ response: { errorCode: 'ADOPTION_STALE_BASELINE' } });
      expect(
        await db.prisma.$queryRaw(
          Prisma.sql`SELECT count(*)::int AS count FROM "OptimizationAdoption" WHERE "experimentId"=${f.id}::uuid`,
        ),
      ).toEqual([{ count: 0 }]);
    });

    it('采纳先持锁时，手工发布等待并使用下一正式版本', async () => {
      const f = await adoptionFixture(db.prisma);
      let acquired!: () => void, release!: () => void, waiting!: () => void;
      const held = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const seen = new Promise<void>((resolve) => {
        waiting = resolve;
      });
      const adoptionDb = publicationProbe(db.prisma, f.strategy.id, {
        afterLock: async () => {
          acquired();
          await gate;
        },
      });
      const manualDb = publicationProbe(db.prisma, f.strategy.id, { beforeLock: waiting });
      const adopting = adoptionServices(db.prisma, adoptionDb).service.adopt(f.id, f.input);
      await held;
      const publishing = manual(manualDb).createVersion(f.strategy.id, f.schema);
      await seen;
      release();
      expect((await adopting).strategyVersion.version).toBe(2);
      expect((await publishing).version).toBe(3);
      expect(
        await db.prisma.strategyVersion.count({
          where: { strategyId: f.strategy.id, version: { gt: 0 } },
        }),
      ).toBe(3);
    });

    it('两个手工发布与相同采纳意图的并发均不制造重复版本', async () => {
      const f = await adoptionFixture(db.prisma);
      const versions = await Promise.all([
        manual().createVersion(f.strategy.id, f.schema),
        manual().createVersion(f.strategy.id, f.schema),
      ]);
      expect(versions.map((v) => v.version).sort()).toEqual([2, 3]);
      const g = await adoptionFixture(db.prisma);
      const { service } = adoptionServices(db.prisma);
      const receipts = await Promise.all([
        service.adopt(g.id, g.input),
        service.adopt(g.id, g.input),
        service.adopt(g.id, g.input),
      ]);
      expect(receipts.every((r) => r.strategyVersion.id === receipts[0]!.strategyVersion.id)).toBe(
        true,
      );
      expect(
        await db.prisma.strategyVersion.count({
          where: { strategyId: g.strategy.id, version: { gt: 0 } },
        }),
      ).toBe(2);
    });

    it.each(['context', 'monitoring', 'risk-diff'])(
      '%s 读取失败仍返回已提交回执，恢复读取不再发布版本',
      async (surface) => {
        const f = await adoptionFixture(db.prisma);
        const database = new Proxy(db.prisma, {
          get(target, key) {
            if (key !== '$queryRaw' || surface !== 'context') return Reflect.get(target, key);
            return (query: Prisma.Sql) => {
              if (query.strings.join('').includes('SELECT * FROM "OptimizationExperiment"'))
                throw new Error('受控上下文读取失败');
              return target.$queryRaw(query);
            };
          },
        });
        const { service, reads, risk } = adoptionServices(db.prisma, database);
        const spy = failAdoptionRiskRead(risk, surface);
        const controller = new StrategyOptimizationController(service, reads, risk, {} as never);
        const result = await controller.adopt(f.id, f.input);
        expect(result).toMatchObject({
          detailsStatus: 'unavailable',
          strategyVersion: { version: 2 },
          source: { candidateHash: f.input.candidateHash },
        });
        expect(
          optimizationAdoptionReadSchema.safeParse(JSON.parse(JSON.stringify(result))).success,
        ).toBe(true);
        expect(result).not.toHaveProperty('riskApplicationDiffs');
        expect((await controller.adopt(f.id, f.input)).strategyVersion.id).toBe(
          result.strategyVersion.id,
        );
        spy?.mockRestore();
        const normal = adoptionServices(db.prisma).service;
        const recovered = await normal.adoptionStatus(f.id, f.candidateId);
        expect(recovered).toMatchObject({
          detailsStatus: 'ready',
          strategyVersion: { id: result.strategyVersion.id },
        });
        expect(
          await db.prisma.strategyVersion.count({
            where: { strategyId: f.strategy.id, version: { gt: 0 } },
          }),
        ).toBe(2);
        expect(
          (await reads.list({ strategyVersionId: result.strategyVersion.id })).items.map(
            (e) => e.id,
          ),
        ).toEqual([f.id]);
        expect(await db.prisma.aiRun.count()).toBe(0);
      },
    );

    it('只读查询隔离 owner 与实验，并保持未提交状态为 null', async () => {
      const f = await adoptionFixture(db.prisma),
        g = await adoptionFixture(db.prisma);
      const { service } = adoptionServices(db.prisma);
      expect(await service.adoptionStatus(f.id, f.candidateId)).toBeNull();
      await service.adopt(f.id, f.input);
      expect(await service.adoptionStatus(g.id, f.candidateId)).toBeNull();
      await db.prisma.$executeRaw(
        Prisma.sql`UPDATE "OptimizationExperiment" SET "ownerKey"='another-owner' WHERE "id"=${f.id}::uuid`,
      );
      await expect(service.adoptionStatus(f.id, f.candidateId)).rejects.toMatchObject({
        status: 404,
      });
    });
  },
);

function failAdoptionRiskRead(risk: ReturnType<typeof adoptionServices>['risk'], surface: string) {
  if (surface === 'monitoring')
    return vi.spyOn(risk, 'monitoringPlan').mockRejectedValue(new Error('受控风险计划失败'));
  if (surface === 'risk-diff')
    return vi
      .spyOn(risk, 'planDiffsForTargetVersion')
      .mockRejectedValue(new Error('受控差异读取失败'));
  return null;
}
