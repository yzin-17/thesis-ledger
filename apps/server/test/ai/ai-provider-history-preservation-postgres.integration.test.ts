import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AiExecutionStateStore } from '../../src/ai/ai-execution-state.store.js';
import { parseAiProviderSettings } from '../../src/ai/ai-provider-summary.js';
import { routeSnapshotsFromProviderRow } from '../../src/ai/ai-provider-readiness.persistence.js';
import { configurationFingerprint } from '../../src/ai/ai-provider-readiness.js';
import {
  applyAiProviderPricingMigration,
  previewAiProviderPricingMigration,
} from '../../src/ai/ai-provider-pricing-migration.js';
import {
  assertIsolated,
  createStack,
  databaseUrl,
  providerInput,
  reset,
  type ProviderStack,
} from './ai-provider-postgres.fixture.js';

const isolated = databaseUrl ? describe : describe.skip;
const promptVersion = 'history-pricing-preservation-fixture';
const providerName = 'history-pricing-preservation';
const oldPricing = { costPer1kInput: 0.1, costPer1kOutput: 0.2, costCurrency: 'USD' };
let stack: ProviderStack;

async function seedProvider() {
  const input = {
    ...providerInput(providerName),
    enabled: false,
    modelPricing: { model: oldPricing },
  };
  expect((await stack.request('/ai/providers', input)).status).toBe(201);
  return input;
}

async function seedHistory() {
  const provider = await stack.prisma.providerConfig.findUniqueOrThrow({
    where: { name: providerName },
  });
  const route = routeSnapshotsFromProviderRow(
    provider,
    parseAiProviderSettings(provider.settings),
    'untested',
  )[0]!;
  expect(route).toMatchObject(oldPricing);
  const pricing = { ...oldPricing, pricingVersion: route.pricingVersion };
  const run = await stack.prisma.aiRun.create({
    data: {
      provider: providerName,
      model: 'model',
      promptVersion,
      status: 'running',
      executionAttempt: 1,
      startedAt: new Date(),
      claimedAt: new Date(),
      leaseUntil: new Date(Date.now() + 60000),
      modelMetadata: {
        researchRoutes: [
          {
            provider: providerName,
            model: 'model',
            pricing,
            configurationFingerprint: configurationFingerprint(route),
          },
        ],
      } as Prisma.InputJsonValue,
    },
  });
  const store = new AiExecutionStateStore(stack.prisma as never);
  const ownership = { runId: run.id, executionAttempt: 1 };
  expect(
    await store.initialize(ownership, {
      version: 'sdk-execution-v1',
      contract: aiGenerationContracts.research.ref,
      frozenPolicy: null,
      deadlineAt: new Date(Date.now() + 60000).toISOString(),
      generationStatus: 'pending',
      usageCompleteness: 'unknown',
      requests: [],
      continuationBlockedReason: null,
    }),
  ).not.toBeNull();
  const prepared = await store.prepareRequest({
    ...ownership,
    requestId: randomUUID(),
    reservation: {
      aiCalls: 1,
      inputTokens: 1000,
      outputTokens: 1000,
      cost: {
        status: 'estimated',
        amount: '0.3',
        currency: 'USD',
        source: 'frozen_provider_pricing',
        pricingVersion: route.pricingVersion ?? null,
      },
    },
  });
  expect(prepared).not.toBeNull();
  expect(await store.authorizeDispatch(ownership, prepared!.requestId)).toBe(true);
  expect(
    await store.completeAndSettle({
      ...ownership,
      requestId: prepared!.requestId,
      outcome: {
        status: 'complete',
        finishReason: 'stop',
        contract: aiGenerationContracts.research.ref,
        schemaAccepted: true,
      },
      result: { syntheticHistory: true },
      revision: {
        revision: 1,
        usage: { status: 'reported', inputTokens: 1000, outputTokens: 1000 },
        cost: {
          status: 'known',
          amount: '0.25',
          currency: 'USD',
          source: 'controlled_history_fixture',
          pricingVersion: route.pricingVersion ?? null,
        },
        recordedAt: new Date().toISOString(),
      },
    }),
  ).toMatchObject({ applied: true });
  const stored = await stack.prisma.aiRun.findUniqueOrThrow({ where: { id: run.id } });
  expect(stored).toMatchObject({ status: 'succeeded', cost: new Prisma.Decimal('0.25') });
  return run.id;
}

const rawHistory = (id: string) => stack.prisma.$queryRaw<Array<{ value: string }>>`
  SELECT to_jsonb(t)::text AS value FROM "AiRun" t WHERE id=${id}::uuid`;

async function historyView(id: string) {
  const detail = await stack.request(`/ai/runs/${id}`, undefined, 'GET');
  expect(detail.status).toBe(200);
  expect(detail.body).toMatchObject({
    cost: '0.25',
    status: 'succeeded',
    execution: {
      requests: [
        { cost: { amount: '0.25', currency: 'USD' }, reservation: { cost: { amount: '0.3' } } },
      ],
    },
  });
  return detail.body;
}

isolated('历史价格：真实 PostgreSQL 与 HTTP 读取保护，零模型请求', () => {
  beforeAll(async () => {
    stack = await createStack();
  });
  afterAll(async () => {
    await stack?.close();
  });
  beforeEach(async () => {
    await assertIsolated(stack.prisma);
    await stack.prisma.aiRun.deleteMany({ where: { promptVersion } });
    await reset(stack);
  });

  it('普通改价至 9/9 后，历史冻结、费用和计量修订不重算', async () => {
    const input = await seedProvider(),
      id = await seedHistory();
    const before = await rawHistory(id),
      view = await historyView(id);
    const range = new URLSearchParams({
      start: new Date(Date.now() - 60000).toISOString(),
      end: new Date(Date.now() + 60000).toISOString(),
    });
    const usageBefore = await stack.request(`/ai/runs/usage/summary?${range}`, undefined, 'GET');
    expect(usageBefore.status).toBe(200);
    const current = await stack.configs.findStored(providerName);
    expect(
      (
        await stack.request('/ai/providers', {
          ...input,
          modelPricing: { model: { ...oldPricing, costPer1kInput: 9, costPer1kOutput: 9 } },
          expectedRevision: current!.updatedAt.toISOString(),
        })
      ).status,
    ).toBe(201);
    expect((await stack.providers.list())[0]?.modelPricing?.model).toMatchObject({
      costPer1kInput: 9,
    });
    expect(await rawHistory(id)).toEqual(before);
    expect(await historyView(id)).toEqual(view);
    expect(await stack.request(`/ai/runs/usage/summary?${range}`, undefined, 'GET')).toEqual(
      usageBefore,
    );
    expect(stack.sdk.generate).not.toHaveBeenCalled();
  });

  it('显式迁移 legacy 全局价格后，历史原始 JSON 与费用投影保持', async () => {
    await seedProvider();
    await stack.prisma.$executeRaw`UPDATE "ProviderConfig" SET settings=(settings-'modelPricing') ||
      '{"costPer1kInput":0.1,"costPer1kOutput":0.2,"costCurrency":"USD"}'::jsonb
      WHERE name=${providerName}`;
    const id = await seedHistory(),
      before = await rawHistory(id),
      view = await historyView(id);
    const preview = await previewAiProviderPricingMigration(stack.prisma, [providerName]);
    expect(
      await applyAiProviderPricingMigration(stack.prisma, {
        identity: preview.identity,
        fingerprint: preview.fingerprint,
        providerNames: [providerName],
      }),
    ).toMatchObject({ status: 'applied' });
    expect(await rawHistory(id)).toEqual(before);
    expect(await historyView(id)).toEqual(view);
    expect(stack.sdk.generate).not.toHaveBeenCalled();
  });

  it('旧客户端漏传模型价格返回 409，配置与历史均未写入', async () => {
    const input = await seedProvider(),
      id = await seedHistory();
    const row = await stack.prisma.providerConfig.findUniqueOrThrow({
      where: { name: providerName },
    });
    const before = await rawHistory(id);
    const legacyInput: Record<string, unknown> = { ...input };
    delete legacyInput.modelPricing;
    expect(
      (
        await stack.request('/ai/providers', {
          ...legacyInput,
          ...oldPricing,
          expectedRevision: row.updatedAt.toISOString(),
        })
      ).status,
    ).toBe(409);
    expect(await stack.prisma.providerConfig.findUnique({ where: { id: row.id } })).toEqual(row);
    expect(await rawHistory(id)).toEqual(before);
    await historyView(id);
    expect(stack.sdk.generate).not.toHaveBeenCalled();
  });

  it('正常删除已停用配置后，旧任务与原费用仍可读取', async () => {
    await seedProvider();
    const id = await seedHistory(),
      before = await rawHistory(id),
      view = await historyView(id);
    const row = await stack.configs.findStored(providerName);
    expect(
      (
        await stack.request(
          `/ai/providers/${providerName}`,
          { expectedRevision: row!.updatedAt.toISOString() },
          'DELETE',
        )
      ).status,
    ).toBe(200);
    expect(await stack.configs.findStored(providerName)).toBeNull();
    expect(await rawHistory(id)).toEqual(before);
    expect(await historyView(id)).toEqual(view);
    expect(stack.sdk.generate).not.toHaveBeenCalled();
  });
});
