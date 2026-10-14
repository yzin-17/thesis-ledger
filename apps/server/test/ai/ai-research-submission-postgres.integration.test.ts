import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStack,
  databaseUrl,
  deferred,
  providerInput,
  reset,
  type ProviderStack,
} from './ai-provider-postgres.fixture.js';

describe.skipIf(!databaseUrl)('研究提交与冻结：隔离 PostgreSQL/HTTP', () => {
  let first: ProviderStack;
  let second: ProviderStack;
  beforeEach(async () => {
    await first?.close();
    await second?.close();
    first = await createStack();
    second = await createStack();
    await reset(first);
    await first.prisma.aiRun.deleteMany();
  });
  afterAll(async () => {
    await first?.close();
    await second?.close();
  });
  const seed = async (name: string) => {
    const input = providerInput(name);
    const plan = await first.save.plan(input);
    await first.save.testAndSave(input, {
      operationId: randomUUID(),
      authorized: true,
      allowTextFallback: false,
      planFingerprint: plan.planFingerprint,
      maxCalls: plan.maxCalls,
    });
    await second.providers.refreshRegistry();
    return input;
  };
  const body = (revision: string) => ({
    question: '隔离研究提交验收',
    context: { scope: 'portfolio' },
    researchSettingsRevision: revision,
  });
  const select = (providerId: string, revision: string) =>
    first.providers.updateRoutingSettings({
      researchDefault: { providerId, model: 'model' },
      expectedRevision: revision,
    });

  it('缺少默认阻断，过期设置版本冲突均不创建任务', async () => {
    await seed('selected');
    expect((await first.request('/ai/runs', body('0'))).status).toBe(400);
    await select('selected', '0');
    expect((await first.request('/ai/runs', body('0'))).status).toBe(409);
    expect(await first.prisma.aiRun.count()).toBe(0);
  });

  it('创建冻结唯一 Provider/Model/价格/修订，后续排序和默认变化不重写旧任务', async () => {
    const input = await seed('selected');
    await seed('next');
    await select('selected', '0');
    const created = await first.request('/ai/runs', body('1'));
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const before = await first.prisma.aiRun.findUniqueOrThrow({ where: { id } });
    expect(before).toMatchObject({
      status: 'queued',
      provider: 'selected',
      model: 'model',
      modelMetadata: {
        researchSettingsRevision: '1',
        researchDefault: { providerId: 'selected', model: 'model' },
        researchRoutes: [
          {
            provider: 'selected',
            model: 'model',
            pricing: { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' },
          },
        ],
      },
    });
    await select('next', '1');
    const current = await first.configs.findStored(input.name);
    await first.save.save({
      ...input,
      priority: 99,
      expectedRevision: current!.updatedAt.toISOString(),
    });
    expect(await first.prisma.aiRun.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });

  it('研究创建临界区未提交时，默认切换须等待，随后旧修订提交返回冲突', async () => {
    await seed('selected');
    await seed('next');
    await select('selected', '0');
    const blocker = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    const locked = deferred();
    const release = deferred();
    const holding = blocker.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('LOCK TABLE "AiRun" IN EXCLUSIVE MODE');
        locked.resolve();
        await release.promise;
      },
      { timeout: 15000 },
    );
    await locked.promise;
    const creation = first.request('/ai/runs', body('1'));
    let setting: Promise<unknown> | undefined;
    try {
      await vi.waitFor(async () => {
        const rows = await second.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
            AND wait_event_type = 'Lock' AND query LIKE '%INSERT%AiRun%'`;
        expect(Number(rows[0]?.count)).toBeGreaterThan(0);
      });
      setting = second.providers.updateRoutingSettings({
        researchDefault: { providerId: 'next', model: 'model' },
        expectedRevision: '1',
      });
      await vi.waitFor(async () => {
        const rows = await second.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
            AND wait_event_type = 'Lock' AND query LIKE '%pg_advisory_xact_lock%'`;
        expect(Number(rows[0]?.count)).toBeGreaterThan(0);
      });
    } finally {
      release.resolve();
      await holding;
      await blocker.$disconnect();
      await creation;
      await setting;
    }
    expect((await creation).status).toBe(201);
    expect((await first.request('/ai/runs', body('1'))).status).toBe(409);
    expect(await first.prisma.aiRun.count()).toBe(1);
  }, 15000);
});
