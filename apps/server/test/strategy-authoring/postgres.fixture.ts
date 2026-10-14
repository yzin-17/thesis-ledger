import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { discoverDatabaseStructure } from '../../src/platform/database-structure.js';

export const isolatedContainer = process.env.NL_AUTHORING_TEST_CONTAINER ?? 'disabled';
export const fixtureDatabase = 'journal_review_fixture';
export const fixtureOwner = 'fixture_owner';
export const fixtureAppRole = 'fixture_app';
export const legacyStrategy = '11111111-1111-4111-8111-111111111111';
export const legacyVersion = '22222222-2222-4222-8222-222222222222';

function requireFixture() {
  if (
    process.env.AUTHORING_ISOLATED !== '1' ||
    !/^ledger-journal-test-[a-f0-9]{8}$/.test(isolatedContainer)
  )
    throw new Error('只允许维护入口本次创建的隔离数据库');
}
export function ownerSql(sql: string) {
  requireFixture();
  if (!/^SELECT\b/i.test(sql.trim())) throw new Error('容器 SQL 仅允许只读查询');
  return execFileSync(
    'docker',
    [
      'exec',
      isolatedContainer,
      'psql',
      '-XAtq',
      '-U',
      fixtureOwner,
      '-d',
      fixtureDatabase,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `BEGIN READ ONLY; ${sql}; COMMIT;`,
    ],
    { encoding: 'utf8', timeout: 10000 },
  ).trim();
}
export function fixtureClient() {
  requireFixture();
  const url = new URL(process.env.JOURNAL_REVIEW_DATABASE_URL!);
  if (
    url.hostname !== '127.0.0.1' ||
    url.pathname !== `/${fixtureDatabase}` ||
    url.username !== fixtureOwner
  )
    throw new Error('隔离数据库连接目标不符');
  url.username = fixtureAppRole;
  return new PrismaClient({ datasourceUrl: url.toString() });
}
export async function migrateFixture() {
  const structure = await discoverDatabaseStructure();
  if (ownerSql('SELECT current_database(), current_user') !== `${fixtureDatabase}|${fixtureOwner}`)
    throw new Error('隔离目标不符');
  if (ownerSql('SELECT version FROM "SchemaVersion" WHERE id=1') !== structure.currentHead)
    throw new Error('维护入口初始化的结构 head 不匹配');
  const tables = ownerSql("SELECT tablename FROM pg_tables WHERE schemaname='public'").split('\n');
  const missing = structure.expectedTables.filter((table) => !tables.includes(table));
  if (missing.length) throw new Error(`预期表缺失: ${missing.join(',')}`);
  return structure;
}
