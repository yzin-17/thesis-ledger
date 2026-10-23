import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applyAiProviderPricingMigration,
  previewAiProviderPricingMigration,
} from '../../src/ai/ai-provider-pricing-migration.js';
import { assertIsolated, databaseUrl } from './ai-provider-postgres.fixture.js';
import { parseAiProviderModelPricing } from '../../src/ai/ai-provider.contracts.js';

const isolated = databaseUrl ? describe : describe.skip;
const prefix = 'pricing-migration-';
const historyId = '95000000-0000-4000-8000-000000000001';
const legacy = {
  models: ['model'],
  costPer1kInput: 0,
  costPer1kOutput: 0.00000123,
  costCurrency: 'USD',
  executionRoutes: [],
  marker: '保留其他设置',
};

let prisma: PrismaClient;
function setupPricingFixture() {
  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: databaseUrl ?? '' });
    await assertIsolated(prisma);
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await assertIsolated(prisma);
    await prisma.auditLog.deleteMany({ where: { actor: 'maintenance-ai-pricing' } });
    await prisma.aiRoutingSettings.deleteMany({ where: { id: 'pricing-migration-sentinel' } });
    await prisma.aiRun.deleteMany({ where: { id: historyId } });
    await prisma.providerConfig.deleteMany({ where: { name: { startsWith: prefix } } });
  });
}

const seed = async (suffix: string, settings = JSON.stringify(legacy), type = 'ai') => {
  const id = randomUUID(),
    name = prefix + suffix;
  await prisma.$executeRaw`
      INSERT INTO "ProviderConfig" (id,name,type,enabled,priority,capabilities,settings,
        "encryptedCredentials",quota,cost,health,"updatedAt")
      VALUES (${id}::uuid,${name},${type},false,991,'["research"]'::jsonb,${settings}::jsonb,
        decode('a501beef','hex'),'{"limit":123}'::jsonb,'{"currency":"CNY","amount":0.01}'::jsonb,
        'untested',timestamp '2026-10-01 00:00:00.123456')`;
  return { id, name };
};
const rows = () => prisma.$queryRaw<Array<{ value: string }>>`
    SELECT to_jsonb(t)::text AS value FROM "ProviderConfig" t
    WHERE name LIKE 'pricing-migration-%' ORDER BY name`;
const expectState = async (names: string[]) => {
  const preview = await previewAiProviderPricingMigration(prisma, names);
  return { identity: preview.identity, fingerprint: preview.fingerprint, providerNames: names };
};
const protectedState = () => prisma.$queryRaw<Array<{ value: string }>>`
    SELECT jsonb_build_object(
      'defaults',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "AiRoutingSettings" t),
      'history',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "AiRun" t)
    )::text AS value`;

isolated('模型价格显式迁移：PostgreSQL 精确保留与幂等', () => {
  setupPricingFixture();
  it('数据库内精确复制零与高精度数字，保留已有价格元数据、凭据、默认和历史', async () => {
    const source = await seed(
      'precise',
      `{
      "models":["existing","copied","__proto__"],"costPer1kInput":0,
      "costPer1kOutput":0.00000012345678901234567890123456789,"costCurrency":"USD",
      "modelPricing":{"existing":{"costPer1kInput":0.33333333333333333333333333,
        "costCurrency":"CNY","pricingVersion":"user-v1",
        "updatedAt":"2026-10-01T00:00:00.000Z","source":"user"}},
      "sentinel":0.12345678901234567890123456789,"executionRoutes":[]}`,
    );
    const other = await seed('other-type', JSON.stringify(legacy), 'market-data');
    await prisma.aiRoutingSettings.create({
      data: {
        id: 'pricing-migration-sentinel',
        researchDefaultProvider: source.name,
        researchDefaultModel: 'existing',
        revision: 7,
      },
    });
    await prisma.aiRun.create({
      data: {
        id: historyId,
        provider: source.name,
        model: 'existing',
        promptVersion: 'legacy-fixture',
        status: 'succeeded',
        question: '迁移保留样例',
        result: { retained: true, price: '0.1234567890123456789' },
      },
    });
    const protection = await protectedState();
    const before = await prisma.$queryRaw<
      Array<{ settings: string; stable: string; existing: string; sentinel: string }>
    >`
      SELECT settings::text AS settings,(to_jsonb(t)-'settings'-'updatedAt')::text AS stable,
        (settings->'modelPricing'->'existing')::text AS existing,(settings->'sentinel')::text AS sentinel
      FROM "ProviderConfig" t WHERE id=${source.id}::uuid`;
    const otherBefore = await prisma.providerConfig.findUnique({ where: { id: other.id } });
    const preview = await previewAiProviderPricingMigration(prisma, [source.name]);
    expect(preview.items[0]?.legacyPricingExact.costPer1kOutput).toBe(
      '0.00000012345678901234567890123456789',
    );
    expect(preview.items[0]?.addedModels).toEqual(['copied', '__proto__']);
    expect(JSON.stringify(preview)).not.toContain('a501beef');
    expect(JSON.stringify(preview)).not.toContain('sentinel');
    const result = await applyAiProviderPricingMigration(prisma, await expectState([source.name]));
    expect(result).toMatchObject({ status: 'applied', changed: [source.name] });
    const after = await prisma.$queryRaw<
      Array<{
        stable: string;
        existing: string;
        sentinel: string;
        input: string;
        output: string;
        special: string;
        retired: boolean;
        aligned: boolean;
      }>
    >`
      SELECT (to_jsonb(t)-'settings'-'updatedAt')::text AS stable,
        (settings->'modelPricing'->'existing')::text AS existing,(settings->'sentinel')::text AS sentinel,
        (settings->'modelPricing'->'copied'->'costPer1kInput')::text AS input,
        (settings->'modelPricing'->'copied'->'costPer1kOutput')::text AS output,
        (settings->'modelPricing'->'__proto__')::text AS special,
        NOT (settings ?| ARRAY['costPer1kInput','costPer1kOutput','costCurrency']) AS retired,
        "updatedAt"=date_trunc('milliseconds',"updatedAt") AS aligned
      FROM "ProviderConfig" t WHERE id=${source.id}::uuid`;
    expect(after[0]).toMatchObject({
      stable: before[0]!.stable,
      existing: before[0]!.existing,
      sentinel: before[0]!.sentinel,
      input: '0',
      output: preview.items[0]!.legacyPricingExact.costPer1kOutput,
      retired: true,
      aligned: true,
    });
    expect(JSON.parse(after[0]!.special)).toMatchObject({ costPer1kInput: 0, costCurrency: 'USD' });
    const stored = await prisma.providerConfig.findUniqueOrThrow({ where: { id: source.id } });
    const settings = stored.settings as Record<string, unknown>;
    expect(
      parseAiProviderModelPricing(settings.modelPricing, ['existing', 'copied', '__proto__']),
    ).toMatchObject({
      existing: { pricingVersion: 'user-v1', source: 'user' },
      copied: { source: 'legacy_provider', costPer1kInput: 0 },
      ['__proto__']: { source: 'legacy_provider', costPer1kInput: 0 },
    });
    expect(await protectedState()).toEqual(protection);
    expect(await prisma.providerConfig.findUnique({ where: { id: other.id } })).toEqual(
      otherBefore,
    );
    const audits = await prisma.auditLog.findMany({ where: { actor: 'maintenance-ai-pricing' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.payload).toMatchObject({
      legacyPricingExact: preview.items[0]!.legacyPricingExact,
    });
  });

  it('同计划重试无第二次写入，未来模型不再继承旧全局价格', async () => {
    const source = await seed('repeat');
    const expected = await expectState([source.name]);
    await applyAiProviderPricingMigration(prisma, expected);
    const first = await rows();
    expect(await applyAiProviderPricingMigration(prisma, expected)).toMatchObject({
      status: 'noop',
      changed: [],
    });
    expect(await rows()).toEqual(first);
    await prisma.$executeRaw`UPDATE "ProviderConfig" SET settings=jsonb_set(settings,'{models}',
      (settings->'models') || '["new-model"]'::jsonb) WHERE id=${source.id}::uuid`;
    const edited = await rows();
    expect(await applyAiProviderPricingMigration(prisma, expected)).toMatchObject({
      status: 'noop',
    });
    expect(await rows()).toEqual(edited);
    const row = await prisma.providerConfig.findUniqueOrThrow({ where: { id: source.id } });
    expect(row.settings).not.toHaveProperty('modelPricing.new-model');
    expect(await prisma.auditLog.count({ where: { actor: 'maintenance-ai-pricing' } })).toBe(1);
  });
});

isolated('模型价格显式迁移：PostgreSQL 冲突、竞争与整批回滚', () => {
  setupPricingFixture();
  it.each([
    { models: ['model'], costPer1kInput: 0 },
    {
      ...legacy,
      executionRoutes: [
        { model: 'model', contract: { id: 'research' } },
        { model: 'model', contract: { id: 'research' } },
      ],
    },
  ])('缺字段或旧路由冲突整批保留，其他 ready 配置也不写 %j', async (settings) => {
    const ready = await seed('ready');
    const conflict = await seed('conflict', JSON.stringify(settings));
    const before = await rows();
    const preview = await previewAiProviderPricingMigration(prisma, [ready.name, conflict.name]);
    expect(preview.items.some((item) => item.status === 'conflict')).toBe(true);
    await expect(
      applyAiProviderPricingMigration(prisma, {
        identity: preview.identity,
        fingerprint: preview.fingerprint,
        providerNames: [ready.name, conflict.name],
      }),
    ).rejects.toMatchObject({ code: 'MIGRATION_CONFLICT' });
    expect(await rows()).toEqual(before);
    expect(await prisma.auditLog.count({ where: { actor: 'maintenance-ai-pricing' } })).toBe(0);
  });

  it('预览后有新编辑时拒绝原计划，目标和范围错误同样不写', async () => {
    const source = await seed('stale');
    const expected = await expectState([source.name]);
    await prisma.$executeRaw`UPDATE "ProviderConfig" SET settings=jsonb_set(settings,
      '{costPer1kInput}','0.5'::jsonb) WHERE id=${source.id}::uuid`;
    const before = await rows();
    await expect(applyAiProviderPricingMigration(prisma, expected)).rejects.toMatchObject({
      code: 'PLAN_STALE',
    });
    await expect(
      applyAiProviderPricingMigration(prisma, {
        ...expected,
        identity: { ...expected.identity, database: 'other' },
      }),
    ).rejects.toMatchObject({ code: 'TARGET_MISMATCH' });
    await expect(
      previewAiProviderPricingMigration(prisma, ['missing-provider']),
    ).rejects.toMatchObject({ code: 'SCOPE_MISSING' });
    expect(await rows()).toEqual(before);
  });

  it.each(['legacy', 'model'])('极小负数在数据库中精确拒绝，不被 JS 下溢为零 %s', async (kind) => {
    const tiny = `-0.${'0'.repeat(399)}1`;
    expect(JSON.parse(tiny)).toBe(-0);
    const settings =
      kind === 'legacy'
        ? JSON.stringify(legacy).replace('"costPer1kInput":0', `"costPer1kInput":${tiny}`)
        : JSON.stringify({
            ...legacy,
            modelPricing: {
              model: {
                costPer1kInput: 'TINY_NEGATIVE',
                pricingVersion: 'old',
                updatedAt: '2026-10-01T00:00:00.000Z',
                source: 'user',
              },
            },
          }).replace('"TINY_NEGATIVE"', tiny);
    const source = await seed('tiny-negative', settings);
    const before = await rows();
    const preview = await previewAiProviderPricingMigration(prisma, [source.name]);
    expect(preview.items[0]?.status).toBe('conflict');
    await expect(
      applyAiProviderPricingMigration(prisma, await expectState([source.name])),
    ).rejects.toMatchObject({ code: 'MIGRATION_CONFLICT' });
    expect(await rows()).toEqual(before);
    expect(await prisma.auditLog.count({ where: { actor: 'maintenance-ai-pricing' } })).toBe(0);
  });

  it('两个独立 CLI 进程竞争同一计划只迁移一次、审计一次', async () => {
    const source = await seed('race');
    const expected = await expectState([source.name]);
    const execute = promisify(execFile);
    const args = [
      '--import',
      'tsx',
      fileURLToPath(new URL('../../src/ai/ai-provider-pricing-migration.cli.ts', import.meta.url)),
      '--apply',
      '--provider',
      source.name,
      '--expected-fingerprint',
      expected.fingerprint,
      '--expected-database',
      expected.identity.database,
      '--expected-role',
      expected.identity.role,
    ];
    const options = { env: { ...process.env, DATABASE_URL: databaseUrl }, timeout: 15000 };
    const results = await Promise.all([
      execute(process.execPath, args, options),
      execute(process.execPath, args, options),
    ]);
    expect(results.map((value) => JSON.parse(value.stdout).status).sort()).toEqual([
      'applied',
      'noop',
    ]);
    expect(results.map((value) => value.stderr)).toEqual(['', '']);
    expect(await prisma.auditLog.count({ where: { actor: 'maintenance-ai-pricing' } })).toBe(1);
  });

  it('第二项审计故障使价格、修订和第一项审计全部回滚', async () => {
    const first = await seed('a');
    const second = await seed('b');
    const expected = await expectState([first.name, second.name]);
    const before = await rows();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION pricing_migration_fail_audit() RETURNS trigger
      LANGUAGE plpgsql AS $body$ BEGIN
        IF NEW."resourceId"='${second.id}' THEN RAISE EXCEPTION 'controlled-pricing-audit-failure'; END IF;
        RETURN NEW; END $body$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER pricing_migration_fail_audit BEFORE INSERT ON "AuditLog"
      FOR EACH ROW EXECUTE FUNCTION pricing_migration_fail_audit()`);
    try {
      await expect(applyAiProviderPricingMigration(prisma, expected)).rejects.toThrow(
        'controlled-pricing-audit-failure',
      );
      expect(await rows()).toEqual(before);
      expect(await prisma.auditLog.count({ where: { actor: 'maintenance-ai-pricing' } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER pricing_migration_fail_audit ON "AuditLog"');
      await prisma.$executeRawUnsafe('DROP FUNCTION pricing_migration_fail_audit()');
    }
  });
});
