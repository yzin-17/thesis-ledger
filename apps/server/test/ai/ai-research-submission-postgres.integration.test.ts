import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { researchSubmissionReceiptV2Schema } from '@thesis-ledger/schemas';
import { createResearchSubmissionPostgresHarness } from '../research/research-submission-postgres.fixture.js';
import { researchFixtureNow } from '../research/research-data-http.fixture.js';
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
  let submission: Awaited<ReturnType<typeof createResearchSubmissionPostgresHarness>>;
  const instrumentId = '00000000-0000-4000-8000-000000000001';
  beforeEach(async () => {
    await submission?.close();
    await first?.close();
    await second?.close();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(researchFixtureNow));
    vi.stubEnv('STRATEGY_IDENTITY_MODE', undefined);
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
    first = await createStack();
    second = await createStack();
    await reset(first);
    await first.prisma.aiToolCall.deleteMany();
    await first.prisma.aiRun.deleteMany();
    await first.prisma.instrument.upsert({
      where: { id: instrumentId },
      create: { id: instrumentId, market: 'SH', instrumentType: 'STOCK',
        canonicalCode: '600519', displayName: '受控规范标的', generation: 1 },
      update: { active: true, generation: 1 },
    });
    submission = await createResearchSubmissionPostgresHarness(first.prisma, { runs: first.runs });
  });
  afterAll(async () => {
    await submission?.close();
    await first?.close();
    await second?.close();
    vi.unstubAllEnvs();
    vi.useRealTimers();
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
  const submit = (revision: string) => submission.post(submission.input(revision));
  const select = (providerId: string, revision: string) =>
    first.providers.updateRoutingSettings({
      researchDefault: { providerId, model: 'model' },
      expectedRevision: revision,
    });

  it('缺少默认阻断，过期设置版本冲突均不创建任务', async () => {
    await seed('selected');
    expect((await submit('0')).status).toBe(400);
    await select('selected', '0');
    expect((await submit('0')).status).toBe(409);
    expect(await first.prisma.aiRun.count()).toBe(0);
  });

  it('创建冻结唯一 Provider/Model/价格/修订，后续排序和默认变化不重写旧任务', async () => {
    const input = await seed('selected');
    await seed('next');
    await select('selected', '0');
    const created = await submit('1');
    const body: unknown = await created.json();
    expect(created.status, JSON.stringify(body)).toBe(200);
    const { runId: id } = researchSubmissionReceiptV2Schema.parse(body);
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
    const creation = submit('1');
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
    expect((await creation).status).toBe(200);
    expect((await submit('1')).status).toBe(409);
    expect(await first.prisma.aiRun.count()).toBe(1);
  }, 15000);
});
