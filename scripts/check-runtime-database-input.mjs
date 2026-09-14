import { mkdtemp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePrismaRoot = resolve(root, 'apps/server/prisma');
const sourceMigrationsRoot = resolve(sourcePrismaRoot, 'migrations');
const stagingRoot = await mkdtemp(join(tmpdir(), 'thesis-ledger-runtime-input-'));
const archiveRoot = join(stagingRoot, 'archive');
const runtimeRoot = join(stagingRoot, 'runtime');
await mkdir(archiveRoot);
await mkdir(runtimeRoot);
const entries = (await readdir(sourceMigrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const currentHead = entries.at(-1);
if (!currentHead) throw new Error('迁移目录为空');

try {
  const deploy = spawnSync(
    'pnpm',
    ['--filter', '@thesis-ledger/server', 'pack', '--pack-destination', archiveRoot],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (deploy.status !== 0)
    throw new Error(`runtime package 打包失败:\n${deploy.stderr || deploy.stdout}`);
  const archiveName = (await readdir(archiveRoot)).find((entry) => entry.endsWith('.tgz'));
  if (!archiveName) throw new Error('runtime package 未生成 tarball');
  const extract = spawnSync('tar', ['-xzf', join(archiveRoot, archiveName), '-C', runtimeRoot], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (extract.status !== 0)
    throw new Error(`runtime package 解包失败:\n${extract.stderr || extract.stdout}`);
  const runtimePackageRoot = join(runtimeRoot, 'package');

  const sourceSchema = await readFile(resolve(sourcePrismaRoot, 'schema.prisma'), 'utf8');
  const runtimeSchema = await readFile(join(runtimePackageRoot, 'prisma/schema.prisma'), 'utf8');
  if (sourceSchema !== runtimeSchema) throw new Error('runtime schema.prisma 输入不一致');
  const sourceRawOwned = await readFile(resolve(sourcePrismaRoot, 'raw-owned-tables.json'), 'utf8');
  const runtimeRawOwned = await readFile(
    join(runtimePackageRoot, 'prisma/raw-owned-tables.json'),
    'utf8',
  );
  if (sourceRawOwned !== runtimeRawOwned) throw new Error('runtime raw-owned manifest 输入不一致');
  const runtimeMigrationsRoot = join(runtimePackageRoot, 'prisma/migrations');
  const runtimeEntries = (await readdir(runtimeMigrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(entries) !== JSON.stringify(runtimeEntries))
    throw new Error('runtime migration 目录集合不一致');
  for (const name of entries) {
    const sourceSql = await readFile(resolve(sourceMigrationsRoot, name, 'migration.sql'), 'utf8');
    const runtimeSql = await readFile(
      join(runtimePackageRoot, 'prisma/migrations', name, 'migration.sql'),
      'utf8',
    );
    if (!sourceSql.trim() || sourceSql !== runtimeSql)
      throw new Error(`runtime migration 输入不一致: ${name}`);
  }

  const executor = join(runtimePackageRoot, 'dist/src/platform/dev-database-rebuild.js');
  await stat(executor);
  const execution = spawnSync(process.execPath, [executor], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DEV_DATABASE_MODE: 'check',
      DEV_DATABASE_EXPECTED_DATABASE: 'thesis_ledger_runtime_check',
      DEV_DATABASE_EXPECTED_OWNER: 'thesis_owner_runtime_check',
      DATABASE_URL:
        'postgresql://placeholder:placeholder@postgres:5432/thesis_ledger_runtime_check',
      THESIS_LEDGER_SCHEMA_INPUT_ROOT: join(runtimePackageRoot, 'prisma'),
    },
  });
  if (execution.status !== 0 || !execution.stdout.includes(currentHead))
    throw new Error(`runtime 结构执行器验证失败:\n${execution.stderr || execution.stdout}`);
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}

console.log(
  `Runtime database input passed (${entries.length} migration SQL files and packaged executor)`,
);
