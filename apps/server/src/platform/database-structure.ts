import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATION_NAME = /^\d{14}_[a-z0-9_-]+$/u;
const TRANSACTION_CONTROL = /^\s*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\s*;/imu;

export type DatabaseMigrationInput = {
  name: string;
  sqlPath: string;
  sql: string;
};

export type DatabaseStructureInput = {
  migrations: DatabaseMigrationInput[];
  currentHead: string;
  expectedTables: string[];
  prismaTables: string[];
  rawOwnedTables: string[];
};

export type DatabaseStructureReport = {
  currentHead: string;
  appliedMigrations: string[];
  databaseVersion: string | null;
  presentTables: string[];
  missingTables: string[];
  missingPrismaTables: string[];
  missingRawOwnedTables: string[];
  ready: boolean;
};

export type DatabaseExecutionTarget = {
  databaseName: string;
  ownerName: string;
};

type RawOwnedEntry = { name?: unknown; owner?: unknown; reason?: unknown };

export const resolvePrismaRoot = (override?: string) => {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    override,
    process.env.THESIS_LEDGER_SCHEMA_INPUT_ROOT,
    resolve(process.cwd(), 'apps/server/prisma'),
    resolve(process.cwd(), 'prisma'),
    resolve(moduleDir, '../../prisma'),
    resolve(moduleDir, '../../../prisma'),
  ].filter((value): value is string => Boolean(value));
  const found = candidates.find((candidate) => existsSync(join(candidate, 'migrations')));
  if (!found) throw new Error(`未找到 Prisma 结构输入目录: ${candidates.join(', ')}`);
  return found;
};

const parsePrismaModels = (schema: string) =>
  [...schema.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/gmu)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const parseCreatedTables = (sql: string) =>
  [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/giu)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const parseDroppedTables = (sql: string) =>
  [...sql.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/giu)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const uniqueSorted = (values: string[]) =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

export const discoverDatabaseStructure = async (
  prismaRoot?: string,
): Promise<DatabaseStructureInput> => {
  const root = resolvePrismaRoot(prismaRoot);
  const migrationsRoot = join(root, 'migrations');
  const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (entries.length === 0) throw new Error(`迁移目录为空: ${migrationsRoot}`);

  const migrations: DatabaseMigrationInput[] = [];
  const createdTables = new Set<string>();
  for (const name of entries) {
    if (!MIGRATION_NAME.test(name)) throw new Error(`迁移目录命名无效: ${name}`);
    const sqlPath = join(migrationsRoot, name, 'migration.sql');
    let sql: string;
    try {
      sql = await readFile(sqlPath, 'utf8');
    } catch {
      throw new Error(`迁移 SQL 不存在: ${sqlPath}`);
    }
    if (!sql.trim()) throw new Error(`迁移 SQL 为空: ${name}`);
    migrations.push({ name, sqlPath, sql });
    for (const table of parseCreatedTables(sql)) createdTables.add(table);
    for (const table of parseDroppedTables(sql)) createdTables.delete(table);
  }

  const schema = await readFile(join(root, 'schema.prisma'), 'utf8');
  const prismaTables = uniqueSorted(parsePrismaModels(schema));
  const rawManifest = JSON.parse(await readFile(join(root, 'raw-owned-tables.json'), 'utf8')) as {
    tables?: RawOwnedEntry[];
  };
  if (!Array.isArray(rawManifest.tables)) throw new Error('raw-owned table manifest 格式无效');
  const rawOwnedTables = rawManifest.tables.map((entry) => {
    if (
      typeof entry.name !== 'string' ||
      !entry.name ||
      typeof entry.owner !== 'string' ||
      !entry.owner ||
      typeof entry.reason !== 'string' ||
      !entry.reason
    )
      throw new Error('raw-owned table manifest 每项必须包含 name / owner / reason');
    return entry.name;
  });
  if (new Set(rawOwnedTables).size !== rawOwnedTables.length)
    throw new Error('raw-owned table manifest 存在重复声明');

  const expectedTables = uniqueSorted([...createdTables]);
  const coveredTables = new Set([...prismaTables, ...rawOwnedTables]);
  for (const table of expectedTables) {
    if (!coveredTables.has(table)) throw new Error(`迁移表 ${table} 未被 Prisma 或 raw-owned 覆盖`);
  }
  for (const table of [...prismaTables, ...rawOwnedTables]) {
    if (!expectedTables.includes(table)) throw new Error(`结构声明表 ${table} 未在迁移链创建`);
  }

  return {
    migrations,
    currentHead: entries.at(-1)!,
    expectedTables,
    prismaTables,
    rawOwnedTables: uniqueSorted(rawOwnedTables),
  };
};

export const discoverCurrentSchemaVersionSync = (prismaRoot?: string) => {
  const root = resolvePrismaRoot(prismaRoot);
  const entries = readdirSync(join(root, 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && MIGRATION_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const currentHead = entries.at(-1);
  if (!currentHead) throw new Error(`迁移目录为空: ${join(root, 'migrations')}`);
  return currentHead;
};

const stripBoundaryTransaction = (sql: string, name: string) => {
  let normalized = sql
    .trim()
    .replace(/^(?:(?:--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/|\s+))*/u, '')
    .trimStart();
  if (/^BEGIN\s*;/iu.test(normalized))
    normalized = normalized.replace(/^BEGIN\s*;/iu, '').trimStart();
  normalized = normalized.replace(/(?:\r?\n\s*--[^\r\n]*)+\s*$/u, '').trimEnd();
  if (/COMMIT\s*;\s*$/iu.test(normalized))
    normalized = normalized.replace(/COMMIT\s*;\s*$/iu, '').trimEnd();
  if (TRANSACTION_CONTROL.test(normalized)) throw new Error(`迁移 ${name} 含非边界事务控制语句`);
  if (/CREATE\s+(?:UNLOGGED\s+)?INDEX\s+CONCURRENTLY|CREATE\s+DATABASE/iu.test(normalized))
    throw new Error(`迁移 ${name} 含不支持的非事务 SQL`);
  return normalized;
};

export const normalizeMigrationSql = (input: DatabaseMigrationInput) =>
  stripBoundaryTransaction(input.sql, input.name);

const sqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

const targetGuardSql = (target: DatabaseExecutionTarget) =>
  [
    '\\set ON_ERROR_STOP on',
    `SELECT current_database() IS DISTINCT FROM ${sqlLiteral(target.databaseName)} OR current_user IS DISTINCT FROM ${sqlLiteral(target.ownerName)} AS target_mismatch \\gset`,
    '\\if :target_mismatch',
    '\\echo database rebuild target mismatch',
    'SELECT 1 / 0 AS invalid_database_target;',
    '\\endif',
  ].join('\n');

export const buildDatabaseRebuildSql = (
  input: DatabaseStructureInput,
  permissionsSql: string,
  target: DatabaseExecutionTarget,
) => {
  const migrationsSql = input.migrations.map(normalizeMigrationSql).join('\n\n');
  const expected = input.expectedTables.map((table) => `(${sqlLiteral(table)})`).join(', ');
  return [
    targetGuardSql(target),
    'BEGIN;',
    'DROP SCHEMA IF EXISTS public CASCADE;',
    'CREATE SCHEMA public;',
    migrationsSql,
    permissionsSql.trim(),
    `INSERT INTO "SchemaVersion" ("id", "version") VALUES (1, ${sqlLiteral(input.currentHead)}) ON CONFLICT ("id") DO UPDATE SET "version" = EXCLUDED."version", "updatedAt" = CURRENT_TIMESTAMP;`,
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM (VALUES ${expected}) AS expected("name") WHERE to_regclass(format('public.%I', expected."name")) IS NULL) THEN RAISE EXCEPTION 'database structure is incomplete'; END IF; IF (SELECT "version" FROM "SchemaVersion" WHERE "id" = 1) IS DISTINCT FROM ${sqlLiteral(input.currentHead)} THEN RAISE EXCEPTION 'database schema head mismatch'; END IF; END $$;`,
    'COMMIT;',
    '',
  ].join('\n');
};

export const buildDatabaseStructureCheckSql = (
  input: DatabaseStructureInput,
  target: DatabaseExecutionTarget,
) => {
  const expected = input.expectedTables.map((table) => `(${sqlLiteral(table)})`).join(', ');
  return [
    targetGuardSql(target),
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM (VALUES ${expected}) AS expected("name") WHERE to_regclass(format('public.%I', expected."name")) IS NULL) THEN RAISE EXCEPTION 'database structure is incomplete'; END IF; IF (SELECT "version" FROM "SchemaVersion" WHERE "id" = 1) IS DISTINCT FROM ${sqlLiteral(input.currentHead)} THEN RAISE EXCEPTION 'database schema head mismatch'; END IF; END $$;`,
    '',
  ].join('\n');
};

export const assertDevelopmentRebuildAuthorization = ({
  mode,
  allowDataLoss,
  confirm,
  expectedTarget,
}: {
  mode: string;
  allowDataLoss: string;
  confirm: string;
  expectedTarget: string;
}) => {
  if (mode !== 'check' && mode !== 'rebuild')
    throw new Error('DEV_DATABASE_MODE 必须是 check 或 rebuild');
  if (mode === 'check') return;
  if (!expectedTarget) throw new Error('DEV_DATABASE_CONFIRM 目标不能为空');
  if (process.env.NODE_ENV !== 'development')
    throw new Error('DEV_DATABASE_MODE=rebuild 仅允许 NODE_ENV=development');
  if (allowDataLoss !== 'true')
    throw new Error('DEV_DATABASE_ALLOW_DATA_LOSS=true 是重建数据库的必需确认');
  if (confirm !== expectedTarget)
    throw new Error(`DEV_DATABASE_CONFIRM 必须精确匹配 ${expectedTarget}`);
};

export const inspectDatabaseStructure = async (
  input: DatabaseStructureInput,
  readTables: () => Promise<unknown>,
  readVersion: () => Promise<unknown>,
): Promise<DatabaseStructureReport> => {
  const tableResult = await readTables();
  const presentTables = uniqueSorted(
    Array.isArray(tableResult)
      ? tableResult.flatMap((row) => {
          if (!row || typeof row !== 'object') return [];
          const value = (row as { tableName?: unknown }).tableName;
          return typeof value === 'string' ? [value] : [];
        })
      : [],
  );
  const versionResult = await readVersion();
  const versionRows = Array.isArray(versionResult) ? (versionResult as unknown[]) : [];
  const versionRow = versionRows[0];
  const databaseVersion =
    versionRow &&
    typeof versionRow === 'object' &&
    typeof (versionRow as { version?: unknown }).version === 'string'
      ? (versionRow as { version: string }).version
      : null;
  const missingTables = input.expectedTables.filter((table) => !presentTables.includes(table));
  const missingPrismaTables = input.prismaTables.filter((table) => missingTables.includes(table));
  const missingRawOwnedTables = input.rawOwnedTables.filter((table) =>
    missingTables.includes(table),
  );
  return {
    currentHead: input.currentHead,
    appliedMigrations: input.migrations.map((migration) => migration.name),
    databaseVersion,
    presentTables,
    missingTables,
    missingPrismaTables,
    missingRawOwnedTables,
    ready: databaseVersion === input.currentHead && missingTables.length === 0,
  };
};
