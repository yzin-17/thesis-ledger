import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient, type Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, expect, vi } from 'vitest';
import {
  researchStrategyMaterialV2Schema,
  researchSubmissionReceiptV2Schema,
} from '@thesis-ledger/schemas';
import { assertIsolated, databaseUrl } from '../ai/ai-provider-postgres.fixture.js';
import { localIdentityPrincipal } from '../../src/identity/local-workspace.js';
import { verifyAiFrozenResearchV2 } from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { createResearchSubmissionPostgresHarness } from './research-submission-postgres.fixture.js';
import { researchFixtureNow } from './research-data-http.fixture.js';

/** 仅由已核对隔离库的测试使用；不调用交易、投影重建或通知入口。 */
export async function seedResearchPrivateRows(prisma: PrismaClient, ownerId: string) {
  const primary = await prisma.account.create({
    data: { name: '受控模拟范围甲', type: 'broker', mode: 'shadow', currency: 'CNY' },
  });
  const second = await prisma.account.create({
    data: { name: '受控模拟范围乙', type: 'broker', mode: 'shadow', currency: 'CNY' },
  });
  const actual = await prisma.account.create({
    data: { name: '受控实际范围', type: 'broker', mode: 'actual', currency: 'CNY' },
  });
  const assets = [
    ['600519.SH', 'CNY'],
    ['UNKNOWN_RESEARCH', 'unrecorded'],
  ] as const;
  for (const [symbol, currency] of assets)
    await prisma.asset.upsert({
      where: { symbol },
      create: { symbol, name: '受控账本标的', market: 'SH', assetType: 'stock', currency },
      update: { currency },
    });
  await prisma.position.createMany({
    data: [
      {
        accountId: primary.id,
        symbol: '600519.SH',
        quantity: '2.0000001',
        costPrice: '80',
        source: 'controlled-read-fixture',
      },
      {
        accountId: primary.id,
        symbol: 'UNKNOWN_RESEARCH',
        quantity: '7',
        costPrice: '10',
        source: 'controlled-read-fixture',
      },
      {
        accountId: second.id,
        symbol: '600519.SH',
        quantity: '3',
        costPrice: '70',
        source: 'controlled-read-fixture',
      },
      {
        accountId: actual.id,
        symbol: '600519.SH',
        quantity: '99',
        costPrice: '60',
        source: 'controlled-read-fixture',
      },
    ],
  });
  await prisma.accountLedgerState.create({
    data: { accountId: primary.id, ledgerRevision: 3n, projectionGeneration: 2n },
  });
  await prisma.cashBalance.create({
    data: {
      accountId: primary.id,
      currency: 'CNY',
      settledAmount: '100',
      pendingReceivable: '0',
      pendingPayable: '0',
      completeness: 'complete',
      issues: [],
      projectionGeneration: 2n,
    },
  });
  const raw = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/research-private-v2.samples.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { strategy: unknown };
  const definition = researchStrategyMaterialV2Schema.parse(raw.strategy).definition;
  const strategy = await prisma.strategy.create({
    data: { name: '受控研究策略', schemaVersion: 2, ownerId },
  });
  const foreign = await prisma.strategy.create({
    data: { name: '受控他人策略', schemaVersion: 2, ownerId: randomUUID() },
  });
  const version = await prisma.strategyVersion.create({
    data: {
      strategyId: strategy.id,
      version: 1,
      schemaVersion: 2,
      schema: definition as Prisma.InputJsonValue,
    },
  });
  const foreignVersion = await prisma.strategyVersion.create({
    data: {
      strategyId: foreign.id,
      version: 1,
      schemaVersion: 2,
      schema: definition as Prisma.InputJsonValue,
    },
  });
  return {
    primary,
    second,
    actual,
    strategy,
    version,
    foreignVersion,
    async cleanup() {
      const ids = [primary.id, second.id, actual.id];
      await prisma.position.deleteMany({ where: { accountId: { in: ids } } });
      await prisma.cashBalance.deleteMany({ where: { accountId: { in: ids } } });
      await prisma.accountLedgerState.deleteMany({ where: { accountId: { in: ids } } });
      await prisma.account.deleteMany({ where: { id: { in: ids } } });
      await prisma.strategyVersion.deleteMany({
        where: { strategyId: { in: [strategy.id, foreign.id] } },
      });
      await prisma.strategy.deleteMany({ where: { id: { in: [strategy.id, foreign.id] } } });
    },
  };
}

/** 生命周期集中在专用隔离 fixture；病例仅声明业务断言。 */
export function useResearchPrivatePostgresFixture() {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof createResearchSubmissionPostgresHarness>>;
  let rows: Awaited<ReturnType<typeof seedResearchPrivateRows>> | undefined;
  let input: ReturnType<typeof harness.input>;
  const users: string[] = [];
  const instrumentId = '00000000-0000-4000-8000-000000000001';
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(researchFixtureNow));
    const url = new URL(databaseUrl ?? '');
    url.searchParams.set('connection_limit', '1');
    prisma = new PrismaClient({ datasourceUrl: url.toString() });
    await assertIsolated(prisma);
    harness = await createResearchSubmissionPostgresHarness(prisma);
  });
  beforeEach(async () => {
    await prisma.aiToolCall.deleteMany();
    await prisma.aiRun.deleteMany();
    await rows?.cleanup();
    await prisma.aiRoutingSettings.deleteMany();
    vi.stubEnv('STRATEGY_IDENTITY_MODE', undefined);
    vi.stubEnv('AI_RESEARCH_V2_WRITES_ENABLED', 'true');
    vi.stubEnv('AI_RESEARCH_PREPARATION_TIMEOUT_MS', '30000');
    vi.stubEnv('AI_RESEARCH_POLICY_JSON', undefined);
    await prisma.instrument.upsert({
      where: { id: instrumentId },
      create: {
        id: instrumentId,
        market: 'SH',
        instrumentType: 'STOCK',
        canonicalCode: '600519',
        displayName: '受控目录标的',
        generation: 1,
      },
      update: { active: true, generation: 1 },
    });
    rows = await seedResearchPrivateRows(prisma, localIdentityPrincipal()!.id);
    harness.data.setMode('available');
    harness.models.setMode('valid');
    harness.redis.clear();
    harness.dispatch.dispatch.mockClear();
    input = harness.input((await harness.models.configureDefault()).revision);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    if (harness) {
      await harness.close();
      await prisma.aiToolCall.deleteMany();
      await prisma.aiRun.deleteMany();
      await rows?.cleanup();
      await prisma.identitySession.deleteMany({ where: { userId: { in: users } } });
      await prisma.identityUser.deleteMany({ where: { id: { in: users } } });
    }
    await prisma?.$disconnect();
  });
  return {
    get prisma() {
      return prisma;
    },
    get harness() {
      return harness;
    },
    get rows() {
      if (!rows) throw new Error('隔离范围尚未准备');
      return rows;
    },
    get input() {
      return input;
    },
    users,
    async saved(response: Response) {
      expect(response.status).toBe(200);
      const receipt = researchSubmissionReceiptV2Schema.parse(await response.json());
      const run = await prisma.aiRun.findUniqueOrThrow({ where: { id: receipt.runId } });
      return {
        run,
        frozen: verifyAiFrozenResearchV2(
          (run.modelMetadata as Record<string, unknown>).frozenResearch,
        ),
      };
    },
  };
}
