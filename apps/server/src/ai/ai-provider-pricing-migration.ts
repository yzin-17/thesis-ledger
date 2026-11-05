import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { planAiProviderMigration } from './ai-provider-migration.js';
import { withAiProviderConfigurationTransaction } from './ai-provider-configuration-transaction.js';

type DatabaseIdentity = { database: string; role: string };
type MigrationClient = Pick<PrismaClient, '$transaction' | '$queryRaw'>;
type ReadClient = Pick<Prisma.TransactionClient, '$queryRaw'>;
type StoredPricingRow = {
  id: string;
  name: string;
  revision: string;
  settingsJson: string | null;
  inputPriceJson: string | null;
  outputPriceJson: string | null;
  currencyJson: string | null;
  legacyNumbersValid: boolean;
  modelNumbersValid: boolean;
};

export class AiPricingMigrationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AiPricingMigrationError';
  }
}

export type AiPricingMigrationPreview = {
  version: 1;
  dryRun: true;
  identity: DatabaseIdentity;
  fingerprint: string;
  scope: string[];
  items: Array<{
    name: string;
    revision: string;
    status: 'noop' | 'ready' | 'conflict';
    legacyPricingExact: Record<string, string>;
    addedModels: string[];
    preservedModels: string[];
    conflicts: string[];
  }>;
};

async function readPricingState(client: ReadClient, providerNames: readonly string[]) {
  const names = [...new Set(providerNames)].sort();
  const selection = names.length ? Prisma.sql`AND name IN (${Prisma.join(names)})` : Prisma.empty;
  const identities = await client.$queryRaw<DatabaseIdentity[]>`
    SELECT current_database()::text AS database, current_user::text AS role`;
  const identity = identities[0];
  if (!identity) throw new AiPricingMigrationError('TARGET_UNKNOWN', '无法确认数据库身份');
  const rows = await client.$queryRaw<StoredPricingRow[]>(Prisma.sql`
    SELECT id, name, "updatedAt"::text AS revision, settings::text AS "settingsJson",
      (settings->'costPer1kInput')::text AS "inputPriceJson",
      (settings->'costPer1kOutput')::text AS "outputPriceJson",
      (settings->'costCurrency')::text AS "currencyJson",
      NOT (settings ?| ARRAY['costPer1kInput','costPer1kOutput','costCurrency']) OR (
        CASE WHEN jsonb_typeof(settings->'costPer1kInput')='number'
          THEN (settings->>'costPer1kInput')::numeric >= 0 ELSE false END AND
        CASE WHEN jsonb_typeof(settings->'costPer1kOutput')='number'
          THEN (settings->>'costPer1kOutput')::numeric >= 0 ELSE false END
      ) AS "legacyNumbersValid",
      NOT EXISTS (
        SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(settings->'modelPricing')='object'
          THEN settings->'modelPricing' ELSE '{}'::jsonb END) AS prices(model,value)
        CROSS JOIN (VALUES ('costPer1kInput'),('costPer1kOutput')) AS fields(key)
        WHERE CASE WHEN jsonb_typeof(value->key)='number'
          THEN (value->>key)::numeric < 0 ELSE false END
      ) AS "modelNumbersValid"
    FROM "ProviderConfig" WHERE type='ai' ${selection} ORDER BY name COLLATE "C", id`);
  if (names.some((name) => !rows.some((row) => row.name === name)))
    throw new AiPricingMigrationError('SCOPE_MISSING', '指定的 AI Provider 不存在');
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        identity,
        scope: names,
        rows: rows.map(({ id, name, revision, settingsJson }) => ({
          id,
          name,
          revision,
          settingsJson,
        })),
      }),
    )
    .digest('hex');
  const items = rows.map((row) => {
    const plan = planAiProviderMigration({
      name: row.name,
      settings: row.settingsJson === null ? null : (JSON.parse(row.settingsJson) as unknown),
    });
    if (row.legacyNumbersValid === false || row.modelNumbersValid === false) {
      plan.status = 'conflict';
      plan.conflicts.push('数据库精确价格不是有效非负数，保留原值');
    }
    const legacyPricingExact = Object.fromEntries(
      [
        ['costPer1kInput', row.inputPriceJson],
        ['costPer1kOutput', row.outputPriceJson],
        ['costCurrency', row.currencyJson],
      ].filter((pair): pair is [string, string] => pair[1] !== null),
    );
    return {
      name: row.name,
      revision: row.revision,
      status: plan.status,
      legacyPricingExact,
      addedModels: Object.keys(plan.proposedModelPricing),
      preservedModels: plan.preservedModels,
      conflicts: plan.conflicts,
    };
  });
  const preview: AiPricingMigrationPreview = {
    version: 1,
    dryRun: true,
    identity,
    fingerprint,
    scope: names,
    items,
  };
  return { preview, rows };
}

export async function previewAiProviderPricingMigration(
  client: ReadClient,
  providerNames: readonly string[] = [],
) {
  return (await readPricingState(client, providerNames)).preview;
}

export async function applyAiProviderPricingMigration(
  client: MigrationClient,
  expected: { identity: DatabaseIdentity; fingerprint: string; providerNames?: readonly string[] },
) {
  if (
    !/^[a-f0-9]{64}$/.test(expected.fingerprint) ||
    !expected.identity.database ||
    !expected.identity.role
  )
    throw new AiPricingMigrationError(
      'EXPECTED_STATE_REQUIRED',
      '应用迁移必须提供预览指纹和数据库/角色',
    );
  return withAiProviderConfigurationTransaction(client, async (transaction) => {
    const { preview, rows } = await readPricingState(transaction, expected.providerNames ?? []);
    if (
      preview.identity.database !== expected.identity.database ||
      preview.identity.role !== expected.identity.role
    )
      throw new AiPricingMigrationError('TARGET_MISMATCH', '数据库或角色与预览不符');
    if (preview.items.some((item) => item.status === 'conflict'))
      throw new AiPricingMigrationError('MIGRATION_CONFLICT', '选中配置存在冲突，整批未写入');
    const ready = preview.items.filter((item) => item.status === 'ready');
    if (ready.length === 0) return { status: 'noop' as const, changed: [], preview };
    if (preview.fingerprint !== expected.fingerprint)
      throw new AiPricingMigrationError('PLAN_STALE', '配置已变化，请重新生成迁移预览');
    const traceId = randomUUID();
    const changed: string[] = [];
    for (const item of ready) {
      const row = rows.find((candidate) => candidate.name === item.name)!;
      const updated = await transaction.$queryRaw<Array<{ revision: string }>>`
        UPDATE "ProviderConfig" SET settings = jsonb_set(
          settings - ARRAY['costPer1kInput','costPer1kOutput','costCurrency']::text[],
          '{modelPricing}', coalesce(settings->'modelPricing','{}'::jsonb) || coalesce((
            SELECT jsonb_object_agg(model, jsonb_build_object(
              'costPer1kInput', settings->'costPer1kInput',
              'costPer1kOutput', settings->'costPer1kOutput',
              'costCurrency', settings->'costCurrency',
              'pricingVersion', ${`pricing-migration-${preview.fingerprint}`},
              'updatedAt', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'source', 'legacy_provider'))
            FROM jsonb_array_elements_text(settings->'models') AS models(model)
            WHERE NOT (coalesce(settings->'modelPricing','{}'::jsonb) ? model)
          ),'{}'::jsonb), true),
          "updatedAt" = greatest(date_trunc('milliseconds', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
            date_trunc('milliseconds', "updatedAt") + interval '1 millisecond')
        WHERE id=${row.id}::uuid AND type='ai' AND "updatedAt"::text=${row.revision}
          AND settings::text IS NOT DISTINCT FROM ${row.settingsJson}
        RETURNING "updatedAt"::text AS revision`;
      if (updated.length !== 1)
        throw new AiPricingMigrationError('PLAN_STALE', '配置已变化，整批迁移回滚');
      await transaction.auditLog.create({
        data: {
          actor: 'maintenance-ai-pricing',
          action: 'ai-provider.pricing-migrated',
          resource: 'ProviderConfig',
          resourceId: row.id,
          traceId,
          payload: {
            version: 1,
            name: row.name,
            sourceFingerprint: expected.fingerprint,
            beforeRevision: row.revision,
            afterRevision: updated[0]!.revision,
            legacyPricingExact: item.legacyPricingExact,
            addedModels: item.addedModels,
            preservedModels: item.preservedModels,
          },
        },
      });
      changed.push(row.name);
    }
    return { status: 'applied' as const, changed, preview };
  });
}
