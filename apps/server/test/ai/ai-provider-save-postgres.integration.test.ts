import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  databaseUrl,
  createStack,
  deferred,
  providerInput,
  reset,
  type ProviderStack,
} from './ai-provider-postgres.fixture.js';

const isolated = databaseUrl ? describe : describe.skip;
isolated('AI Provider 保存：真实 PostgreSQL 与 HTTP 竞争', () => {
  let first: ProviderStack;
  let second: ProviderStack;
  beforeEach(async () => {
    await first?.close();
    await second?.close();
    first = await createStack();
    second = await createStack();
    await reset(first);
  });
  afterAll(async () => {
    await first?.close();
    await second?.close();
  });
  const authorization = async (
    stack: ProviderStack,
    input: unknown,
    operationId = randomUUID(),
  ) => {
    const plan = await stack.save.plan(input);
    return {
      operationId,
      authorized: true as const,
      allowTextFallback: false,
      planFingerprint: plan.planFingerprint,
      maxCalls: plan.maxCalls,
    };
  };
  it('同名首次 HTTP 创建只有一项成功，另一项返回 409', async () => {
    const input = { ...providerInput('new-provider'), enabled: false };
    const results = await Promise.all([
      first.request('/ai/providers', input),
      second.request('/ai/providers', input),
    ]);
    expect(results.map((row) => row.status).sort()).toEqual([201, 409]);
    expect(await first.prisma.providerConfig.count()).toBe(1);
    expect(first.sdk.generate).not.toHaveBeenCalled();
  });
  it('同版本 HTTP 编辑只有一个获准，不允许后写覆盖', async () => {
    const input = { ...providerInput('edited-provider'), enabled: false };
    await first.save.save(input);
    const row = await first.configs.findStored(input.name);
    const revision = row!.updatedAt.toISOString();
    const results = await Promise.all([
      first.request('/ai/providers', { ...input, priority: 1, expectedRevision: revision }),
      second.request('/ai/providers', { ...input, priority: 2, expectedRevision: revision }),
    ]);
    expect(results.map((row) => row.status).sort()).toEqual([201, 409]);
    const winner = results.findIndex((row) => row.status === 201) + 1;
    expect((await first.configs.findStored(input.name))?.priority).toBe(winner);
  });
  it('跨服务相同授权 UUID 只发送一次生成，重放被数据库拒绝', async () => {
    const input = providerInput('operation-provider');
    const auth = await authorization(first, input);
    const started = deferred();
    const release = deferred();
    first.sdk.generate.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
      return {
        output: {},
        usage: { status: 'reported', inputTokens: 8, outputTokens: 4 },
        providerCost: null,
        providerCostCurrency: null,
      };
    });
    const running = first.request('/ai/providers/test-and-save', {
      provider: input,
      authorization: auth,
    });
    await Promise.race([
      started.promise,
      running.then((result) => {
        throw new Error(`验证未执行：HTTP ${result.status}`);
      }),
    ]);
    try {
      const duplicate = await second.request('/ai/providers/test-and-save', {
        provider: input,
        authorization: auth,
      });
      expect(duplicate.status).toBe(409);
      expect(second.sdk.generate).not.toHaveBeenCalled();
    } finally {
      release.resolve();
    }
    expect((await running).status).toBe(201);
    expect(first.sdk.generate).toHaveBeenCalledOnce();
    expect(await first.prisma.providerHealthCheck.count({ where: { id: auth.operationId } })).toBe(
      1,
    );
  });
  it('测试成功后 CAS 冲突保留获胜配置和审计，新实例可复用成功而不再调用', async () => {
    const input = providerInput('cas-provider');
    await first.save.save({ ...input, enabled: false });
    const row = await first.configs.findStored(input.name);
    const draft = { ...input, enabled: true, expectedRevision: row!.updatedAt.toISOString() };
    const auth = await authorization(first, draft);
    const started = deferred();
    const release = deferred();
    first.sdk.generate.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
      return {
        output: {},
        usage: { status: 'reported', inputTokens: 8, outputTokens: 4 },
        providerCost: null,
        providerCostCurrency: null,
      };
    });
    const running = first.request('/ai/providers/test-and-save', {
      provider: draft,
      authorization: auth,
    });
    await Promise.race([
      started.promise,
      running.then((result) => {
        throw new Error(`验证未执行：HTTP ${result.status}`);
      }),
    ]);
    try {
      const other = await second.request('/ai/providers', {
        ...draft,
        enabled: false,
        priority: 7,
      });
      expect(other.status).toBe(201);
    } finally {
      release.resolve();
    }
    expect((await running).status).toBe(409);
    const winner = await first.configs.findStored(input.name);
    expect(winner).toMatchObject({ enabled: false, priority: 7 });
    expect(await first.journal.passed(input.name)).toHaveLength(1);
    const fresh = await createStack();
    try {
      const retry = { ...draft, priority: 7, expectedRevision: winner!.updatedAt.toISOString() };
      expect((await fresh.save.plan(retry)).maxCalls).toBe(0);
      await fresh.save.save(retry);
      expect(fresh.sdk.generate).not.toHaveBeenCalled();
      expect((await fresh.configs.findStored(input.name))?.enabled).toBe(true);
    } finally {
      await fresh.close();
    }
  });
  it('删除后的过期草稿不能重新创建同名 Provider', async () => {
    const input = { ...providerInput('deleted-provider'), enabled: false };
    await first.save.save(input);
    const row = await first.configs.findStored(input.name);
    const revision = row!.updatedAt.toISOString();
    await first.providers.remove(input.name, { expectedRevision: revision });
    expect(
      (await second.request('/ai/providers', { ...input, expectedRevision: revision })).status,
    ).toBe(409);
    expect(await first.configs.findStored(input.name)).toBeNull();
  });
});
