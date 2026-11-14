import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startIsolatedNavPostgres } from '../backtest/nav-postgres.integration-harness.js';
import { StrategyOptimizationRunService } from '../../src/strategy-optimization/strategy-optimization-run.service.js';

describe.skipIf(process.env.UNLIMITED_BACKTEST_BUDGET_POSTGRES !== '1')(
  '隔离 PostgreSQL 调用与回测次数不限额准入',
  () => {
    let isolated: Awaited<ReturnType<typeof startIsolatedNavPostgres>>;
    let runs: StrategyOptimizationRunService;
    let baselineVersionId: string;
    beforeAll(async () => {
      isolated = await startIsolatedNavPostgres();
      runs = new StrategyOptimizationRunService(isolated.prisma, {} as never);
      const strategy = await isolated.prisma.strategy.create({
        data: { name: '回测预算隔离样本', status: 'draft', schemaVersion: 2 },
      });
      const version = await isolated.prisma.strategyVersion.create({
        data: {
          strategyId: strategy.id,
          version: 1,
          schemaVersion: 2,
          schema: { schemaVersion: '2', name: '回测预算隔离样本' },
        },
      });
      baselineVersionId = version.id;
    }, 120000);
    afterAll(async () => {
      await isolated?.cleanup();
    }, 30000);

    async function experiment(maxBacktestRuns = 0, maxAiCalls = 2, tokenLimit = 100) {
      const id = randomUUID();
      const budget = {
        maxAiCalls,
        maxBacktestRuns,
        maxInputTokens: tokenLimit,
        maxOutputTokens: tokenLimit,
        maxCost: '1',
        maxDurationSeconds: 30,
      };
      await isolated.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OptimizationExperiment" (
        "id", "baselineStrategyVersionId", "status", "stage", "objective", "allowedParameterIds",
        "split", "runConfig", "dataFingerprint", "modelConfig", "budget", "maxRounds", "idempotencyKey"
      ) VALUES (
        ${id}::uuid, ${baselineVersionId}::uuid, 'running', 'proposing', '{}'::jsonb, '[]'::jsonb,
        '{}'::jsonb, '{}'::jsonb, ${id}, '[]'::jsonb, ${JSON.stringify(budget)}::jsonb, 1, ${id}
      )
    `);
      return id;
    }
    async function used(id: string, field: 'aiCallsUsed' | 'backtestRunsUsed' = 'backtestRunsUsed') {
      const rows = await isolated.prisma.$queryRaw<Array<{ backtestRunsUsed: number; aiCallsUsed: number }>>(Prisma.sql`
      SELECT "backtestRunsUsed", "aiCallsUsed" FROM "OptimizationExperiment" WHERE "id"=${id}::uuid
    `);
      return rows[0]![field];
    }
    it('Token 零值支持超出正数上限的并发累计及实际用量校正', async () => {
      const id = await experiment(0, 0, 0);
      await Promise.all([runs.reserveBudget(id, { inputTokens: 6_000_000, outputTokens: 2_000_000 }), runs.reserveBudget(id, { inputTokens: 6_000_000, outputTokens: 2_000_000 })]);
      await runs.reconcileTokenUsage(id, 6_000_000, 2_000_000, 7_000_000, 3_000_000);
      const rows = await isolated.prisma.$queryRaw<Array<{ inputTokensUsed: number; outputTokensUsed: number }>>(Prisma.sql`SELECT "inputTokensUsed", "outputTokensUsed" FROM "OptimizationExperiment" WHERE "id"=${id}::uuid`);
      expect(rows[0]).toEqual({ inputTokensUsed: 13_000_000, outputTokensUsed: 5_000_000 });
      expect(runs.outputTokenReservation({ budget: { maxOutputTokens: 0 } } as never)).toBeGreaterThan(1);
      await expect(runs.reserveBudget(id, { estimatedCost: 2 })).rejects.toThrow('预算或最长运行时长已耗尽');
    });
    it.each(['inputTokens', 'outputTokens'] as const)('有限 %s 仍按剩余额度原子准入并在实际超额时阻断', async field => {
      const id = await experiment();
      const results = await Promise.allSettled([runs.reserveBudget(id, { [field]: 60 }), runs.reserveBudget(id, { [field]: 60 })]);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      await expect(runs.reconcileTokenUsage(id, field === 'inputTokens' ? 60 : 0, field === 'outputTokens' ? 60 : 0, field === 'inputTokens' ? 110 : 0, field === 'outputTokens' ? 110 : 0)).rejects.toThrow('实际 token 用量超过');
    });
    it('调用次数 0 允许超过 30 次并原子累计，输出预留仍按计划分配', async () => {
      const id = await experiment(0, 0);
      await Promise.all([runs.reserveBudget(id, { aiCalls: 40 }), runs.reserveBudget(id, { aiCalls: 40 })]);
      expect(await used(id, 'aiCallsUsed')).toBe(80);
      expect(runs.outputTokenReservation({ budget: { maxAiCalls: 0, maxOutputTokens: 120 }, modelConfig: [{}, {}], maxRounds: 3 } as never)).toBe(20);
      expect(runs.outputTokenReservation({ budget: { maxAiCalls: 6, maxOutputTokens: 120 } } as never)).toBe(20);
    });
    it('有限调用次数并发申请只有剩余额度内的请求成功', async () => {
      const id = await experiment(0, 2);
      await runs.reserveBudget(id, { aiCalls: 1 });
      const results = await Promise.allSettled([runs.reserveBudget(id, { aiCalls: 1 }), runs.reserveBudget(id, { aiCalls: 1 })]);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(await used(id, 'aiCallsUsed')).toBe(2);
    });
    it.each([{ inputTokens: 101 }, { outputTokens: 101 }, { estimatedCost: 2 }])('调用不限额仍受其他预算限制 %j', async input => {
      const id = await experiment(0, 0);
      await expect(runs.reserveBudget(id, { ...input, aiCalls: 1 })).rejects.toThrow('预算或最长运行时长已耗尽');
      expect(await used(id, 'aiCallsUsed')).toBe(0);
    });
    it('0 不按零额度拒绝，并发回测准入继续原子累计且可超过 100 次', async () => {
      const id = await experiment(0, 0);
      await Promise.all([
        runs.reserveBudget(id, { backtestRuns: 150 }),
        runs.reserveBudget(id, { backtestRuns: 150 }),
      ]);
      expect(await used(id)).toBe(300);
    });
    it('有限次数边界仍生效，并发申请只有剩余额度内的请求成功', async () => {
      const id = await experiment(2);
      await runs.reserveBudget(id, { backtestRuns: 1 });
      const results = await Promise.allSettled([
        runs.reserveBudget(id, { backtestRuns: 1 }),
        runs.reserveBudget(id, { backtestRuns: 1 }),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(await used(id)).toBe(2);
    });
    it.each([{ aiCalls: 3 }, { inputTokens: 101 }, { outputTokens: 101 }, { estimatedCost: 2 }])(
      '不限回测仍执行其他预算 %j，失败不扣回测次数',
      async (input) => {
        const id = await experiment();
        await expect(runs.reserveBudget(id, { ...input, backtestRuns: 1 })).rejects.toThrow(
          '预算或最长运行时长已耗尽',
        );
        expect(await used(id)).toBe(0);
      },
    );
    it.each(['cancelled', 'expired'])('不限回测仍受 %s 条件约束', async (condition) => {
      const id = await experiment(0, 0);
      if (condition === 'cancelled')
        await isolated.prisma.$executeRaw(
          Prisma.sql`UPDATE "OptimizationExperiment" SET "cancelRequestedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid`,
        );
      else
        await isolated.prisma.$executeRaw(
          Prisma.sql`UPDATE "OptimizationExperiment" SET "createdAt"=CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE "id"=${id}::uuid`,
        );
      await expect(runs.reserveBudget(id, { aiCalls: 1, backtestRuns: 1 })).rejects.toThrow(
        '已耗尽，或实验已取消',
      );
      expect(await used(id)).toBe(0);
    });
  },
);
