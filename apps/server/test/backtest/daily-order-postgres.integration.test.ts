import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { strategySchema, type BacktestStrategy } from '@thesis-ledger/schemas';
import { backtestStrategyPlanReadback } from '@thesis-ledger/domain';
import { PrismaService } from '../../src/platform/prisma.service.js';
import { StrategyCreationService } from '../../src/backtest/strategy-creation.service.js';
import { dailyOrderSnapshot, dailyOrderStrategy } from './daily-order-worker.fixture.js';

it.skipIf(!process.env.AI_PROVIDER_DATABASE_URL)(
  '隔离 PostgreSQL：正式保存→重读→冻结 Worker→完整回放与中文',
  async () => {
    const url = new URL(process.env.AI_PROVIDER_DATABASE_URL!);
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.pathname).toBe('/ai_provider_concurrency_fixture');
    const db = new PrismaService({ datasourceUrl: url.href });
    const root = await mkdtemp(join(tmpdir(), 'daily-order-postgres-'));
    try {
      for (const protection of [false, true]) {
        const definition = await dailyOrderStrategy(protection);
        const saved = await db.$transaction((tx) =>
          new StrategyCreationService().createInTransaction(tx, {
            ownerId: null,
            name: `独立日线委托样本 ${protection}`,
            definition,
            source: { kind: 'manual' },
          }),
        );
        expect(saved.versions[0]!.schema).toEqual(definition);
        const row = await db.strategyVersion.findUniqueOrThrow({
          where: { id: saved.versions[0]!.id },
        });
        expect(row.schema).toEqual(definition);
        const read = strategySchema.parse(row.schema) as BacktestStrategy;
        const f = await dailyOrderSnapshot(join(root, String(protection)), protection, read);
        const result = await f.run();
        expect(result.completeness).toBe('complete');
        expect(result.dailyOrders?.orders[0]).toMatchObject({
          state: protection ? 'cancelled' : 'expired',
        });
        expect(await f.run()).toEqual(result);
        const chinese = backtestStrategyPlanReadback(read).join('\n');
        expect(chinese).toContain('日线委托模拟');
        expect(chinese).toContain('下单时冻结的');
        if (protection) expect(chinese).toContain('每次成交后按量保护');
      }
    } finally {
      await db.$disconnect();
      await rm(root, { recursive: true, force: true });
    }
  },
  30000,
);
