import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assertDevelopmentRebuildAuthorization,
  buildDatabaseRebuildSql,
  buildDatabaseStructureCheckSql,
  discoverDatabaseStructure,
} from './database-structure.js';

const databaseName = () => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is required');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL 无效');
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//u, ''));
  if (!name) throw new Error('DATABASE_URL 缺少数据库名');
  return name;
};

const expectedTarget = () =>
  `${process.env.DEV_DATABASE_PROJECT ?? 'thesis-ledger-dev'}/${databaseName()}`;

const executionTarget = () => {
  const urlDatabase = databaseName();
  const expectedDatabase = process.env.DEV_DATABASE_EXPECTED_DATABASE ?? urlDatabase;
  if (expectedDatabase !== urlDatabase)
    throw new Error('DEV_DATABASE_EXPECTED_DATABASE 必须与 DATABASE_URL 数据库名一致');
  const expectedOwner = process.env.DEV_DATABASE_EXPECTED_OWNER;
  if (!expectedOwner) throw new Error('DEV_DATABASE_EXPECTED_OWNER is required');
  return { databaseName: expectedDatabase, ownerName: expectedOwner };
};

const permissionsPath = () =>
  process.env.DEV_DATABASE_PERMISSIONS_SQL ??
  resolve(process.cwd(), '../thesis-ledger-infra/scripts/bootstrap-app-role.sql');

const main = async () => {
  const mode = process.env.DEV_DATABASE_MODE ?? 'check';
  if (mode !== 'check' && mode !== 'rebuild')
    throw new Error('DEV_DATABASE_MODE 必须是 check 或 rebuild');
  const input = await discoverDatabaseStructure(process.env.THESIS_LEDGER_SCHEMA_INPUT_ROOT);
  const target = executionTarget();
  if (mode === 'check') {
    process.stdout.write(buildDatabaseStructureCheckSql(input, target));
    return;
  }
  assertDevelopmentRebuildAuthorization({
    mode,
    allowDataLoss: process.env.DEV_DATABASE_ALLOW_DATA_LOSS ?? '',
    confirm: process.env.DEV_DATABASE_CONFIRM ?? '',
    expectedTarget: expectedTarget(),
  });
  const permissionsSql = await readFile(permissionsPath(), 'utf8');
  process.stdout.write(buildDatabaseRebuildSql(input, permissionsSql, target));
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
