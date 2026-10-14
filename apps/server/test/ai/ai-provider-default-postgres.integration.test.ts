import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { aiGenerationContracts } from '@thesis-ledger/schemas';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  databaseUrl,
  createStack,
  deferred,
  providerInput,
  reset,
  type ProviderStack,
} from './ai-provider-postgres.fixture.js';

const isolated = databaseUrl ? describe : describe.skip;
isolated('AI 研究默认引用：真实 PostgreSQL 与 HTTP 竞争', () => {
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
  const seed = async (name: string) => {
    const base = providerInput(name);
    const input = { ...base, enabled: true, executionRoutes: [...base.executionRoutes!] };
    input.executionRoutes.push({
      model: 'model',
      mode: 'native_schema',
      outputPolicy: 'manual',
      contract: aiGenerationContracts.parameterOptimization.ref,
    });
    const plan = await first.save.plan(input);
    await first.save.testAndSave(input, {
      operationId: randomUUID(),
      authorized: true,
      planFingerprint: plan.planFingerprint,
      maxCalls: plan.maxCalls,
      allowTextFallback: false,
    });
    return {
      ...input,
      expectedRevision: (await first.configs.findStored(name))!.updatedAt.toISOString(),
    };
  };
  it('同修订的默认 HTTP 更新只允许一个成功，排序不改变显式默认', async () => {
    const input = await seed('revision-provider');
    const body = {
      researchDefault: { providerId: input.name, model: 'model' },
      expectedRevision: '0',
    };
    const results = await Promise.all([
      first.request('/ai/settings', body, 'PATCH'),
      second.request('/ai/settings', body, 'PATCH'),
    ]);
    expect(results.map((row) => row.status).sort()).toEqual([200, 409]);
    const before = await first.routing.read();
    await first.save.save({ ...input, priority: 9 });
    expect(await first.routing.read()).toEqual(before);
  });
  it.each(['disable', 'delete', 'remove-purpose'] as const)(
    '设置默认与 %s 竞争不能产生悬空引用',
    async (action) => {
      const input = await seed(`race-${action}`);
      const blocker = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
      const locked = deferred();
      const release = deferred();
      const holding = blocker.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT name FROM "ProviderConfig" WHERE name = ${input.name} FOR UPDATE`;
          locked.resolve();
          await release.promise;
        },
        { timeout: 15_000 },
      );
      await locked.promise;
      let mutation: Promise<{ status: number; body: unknown }>;
      if (action === 'delete')
        mutation = first.request(
          `/ai/providers/${input.name}`,
          {
            expectedRevision: input.expectedRevision,
          },
          'DELETE',
        );
      else if (action === 'disable')
        mutation = first.request(
          `/ai/providers/${input.name}/enabled`,
          {
            enabled: false,
            expectedRevision: input.expectedRevision,
          },
          'PATCH',
        );
      else
        mutation = first.request('/ai/providers', {
          ...input,
          executionRoutes: input.executionRoutes.filter(
            (route) => route.contract.id !== 'research',
          ),
        });
      let setting: ReturnType<ProviderStack['request']> | undefined;
      try {
        await vi.waitFor(async () => {
          const rows = await second.prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
              AND wait_event_type = 'Lock' AND query LIKE '%UPDATE%ProviderConfig%'
              OR (datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%DELETE%ProviderConfig%')`;
          expect(Number(rows[0]?.count)).toBeGreaterThan(0);
        });
        setting = second.request(
          '/ai/settings',
          {
            researchDefault: { providerId: input.name, model: 'model' },
            expectedRevision: '0',
          },
          'PATCH',
        );
        await vi.waitFor(async () => {
          const rows = await second.prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
              AND wait_event_type = 'Lock' AND query LIKE '%pg_advisory_xact_lock%'`;
          const settings = await second.routing.read();
          expect(settings.researchDefault !== null || Number(rows[0]?.count) > 0).toBe(true);
        });
      } finally {
        release.resolve();
        await holding;
        await blocker.$disconnect();
      }
      expect((await mutation).status).toBe(action === 'remove-purpose' ? 201 : 200);
      expect((await first.routing.read()).researchDefault).toBeNull();
      expect((await setting!).status).toBe(400);
    },
    15_000,
  );
  it.each(['database-error', 'cas-zero'] as const)('清除默认后 Provider %s 会回滚整个事务', async (failure) => {
    const input = await seed('rollback-provider');
    await first.providers.updateRoutingSettings({
      researchDefault: { providerId: input.name, model: 'model' },
      expectedRevision: '0',
    });
    const statement = failure === 'cas-zero' ? 'RETURN NULL;' : "RAISE EXCEPTION 'controlled write failure';";
    await first.prisma.$executeRawUnsafe(
      `CREATE FUNCTION reject_provider_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${statement} END $$`,
    );
    await first.prisma.$executeRawUnsafe(
      `CREATE TRIGGER reject_provider_update BEFORE UPDATE ON "ProviderConfig" FOR EACH ROW EXECUTE FUNCTION reject_provider_update()`,
    );
    try {
      await expect(
        first.providers.setEnabled(input.name, false, {
          expectedRevision: input.expectedRevision,
          clearResearchDefault: true,
          expectedSettingsRevision: '1',
        }),
      ).rejects.toThrow(failure === 'cas-zero' ? 'Provider 配置已变化' : 'controlled write failure');
    } finally {
      await first.prisma.$executeRawUnsafe(
        'DROP TRIGGER reject_provider_update ON "ProviderConfig"',
      );
      await first.prisma.$executeRawUnsafe('DROP FUNCTION reject_provider_update()');
    }
    expect(await first.routing.read()).toEqual({
      researchDefault: { providerId: input.name, model: 'model' },
      revision: '1',
    });
    expect((await first.configs.findStored(input.name))?.enabled).toBe(true);
  });
  it('默认用途停用后不能设为默认，保存不能绕过默认 Provider 停用确认', async () => {
    const input = await seed('disabled-purpose');
    await first.save.save({
      ...input,
      executionRoutes: input.executionRoutes.map((route) => ({
        ...route,
        enabled: route.contract.id !== 'research',
      })),
    });
    expect(
      (
        await first.request(
          '/ai/settings',
          { researchDefault: { providerId: input.name, model: 'model' }, expectedRevision: '0' },
          'PATCH',
        )
      ).status,
    ).toBe(400);
    const revision = (await first.configs.findStored(input.name))!.updatedAt.toISOString();
    await first.save.save({ ...input, expectedRevision: revision });
    await first.providers.updateRoutingSettings({
      researchDefault: { providerId: input.name, model: 'model' },
      expectedRevision: '0',
    });
    const current = (await first.configs.findStored(input.name))!.updatedAt.toISOString();
    expect(
      (
        await first.request('/ai/providers', {
          ...input,
          enabled: false,
          expectedRevision: current,
        })
      ).status,
    ).toBe(409);
    expect((await first.configs.findStored(input.name))?.enabled).toBe(true);
  });
  it.each(['disable', 'delete'] as const)(
    '显式确认 %s 原子清除默认，过期设置版本保持原值',
    async (action) => {
      const input = await seed('clear-provider');
      await first.providers.updateRoutingSettings({
        researchDefault: { providerId: input.name, model: 'model' },
        expectedRevision: '0',
      });
      const path =
        action === 'delete' ? `/ai/providers/${input.name}` : `/ai/providers/${input.name}/enabled`;
      const method = action === 'delete' ? 'DELETE' : 'PATCH';
      const body = {
        expectedRevision: input.expectedRevision,
        ...(action === 'disable' ? { enabled: false } : {}),
      };
      expect((await first.request(path, body, method)).status).toBe(409);
      expect(
        (
          await first.request(
            path,
            { ...body, clearResearchDefault: true, expectedSettingsRevision: '0' },
            method,
          )
        ).status,
      ).toBe(409);
      expect((await first.routing.read()).revision).toBe('1');
      expect(
        (
          await first.request(
            path,
            { ...body, clearResearchDefault: true, expectedSettingsRevision: '1' },
            method,
          )
        ).status,
      ).toBe(200);
      expect(await first.routing.read()).toEqual({ researchDefault: null, revision: '2' });
      const row = await first.configs.findStored(input.name);
      if (action === 'delete') expect(row).toBeNull();
      else expect(row?.enabled).toBe(false);
    },
  );
  it('设置默认先进入临界区时，并发删除须重新检查并拒绝无确认操作', async () => {
    const input = await seed('selection-first');
    await first.prisma.aiRoutingSettings.create({ data: { id: 'global', revision: 0 } });
    const blocker = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    const locked = deferred();
    const release = deferred();
    const holding = blocker.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "AiRoutingSettings" WHERE id = 'global' FOR UPDATE`;
        locked.resolve();
        await release.promise;
      },
      { timeout: 15_000 },
    );
    await locked.promise;
    const setting = first.request(
      '/ai/settings',
      { researchDefault: { providerId: input.name, model: 'model' }, expectedRevision: '0' },
      'PATCH',
    );
    let removing: ReturnType<ProviderStack['request']> | undefined;
    try {
      await vi.waitFor(async () => {
        const rows = await second.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
            AND wait_event_type = 'Lock' AND query LIKE '%UPDATE%AiRoutingSettings%'`;
        expect(Number(rows[0]?.count)).toBeGreaterThan(0);
      });
      removing = second.request(
        `/ai/providers/${input.name}`,
        { expectedRevision: input.expectedRevision },
        'DELETE',
      );
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
    }
    expect((await setting).status).toBe(200);
    expect((await removing!).status).toBe(409);
    expect((await first.routing.read()).researchDefault).toEqual({
      providerId: input.name,
      model: 'model',
    });
    expect(await first.configs.findStored(input.name)).not.toBeNull();
  });
});
