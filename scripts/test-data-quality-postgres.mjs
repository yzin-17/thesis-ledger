import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = `ledger-data-quality-test-${randomUUID().slice(0, 8)}`;
const database = 'data_quality_fixture',
  owner = 'fixture_owner';
let container;
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(`${command} 失败：${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result.stdout.trim();
};
function cleanup() {
  if (!container) return;
  const id = container;
  container = undefined;
  run('docker', ['rm', '-f', id]);
  console.log('已清理本次数据质量隔离容器');
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    try {
      cleanup();
    } finally {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    }
  });
try {
  container = run('docker', [
    'run',
    '--pull',
    'never',
    '-d',
    '--name',
    name,
    '--label',
    'com.thesis-ledger.fixture=data-quality',
    '--tmpfs',
    '/var/lib/postgresql/data',
    '-p',
    '127.0.0.1::5432',
    '-e',
    `POSTGRES_USER=${owner}`,
    '-e',
    'POSTGRES_PASSWORD=isolated_fixture',
    '-e',
    `POSTGRES_DB=${database}`,
    'postgres:17-alpine',
  ]);
  if (!/^[a-f0-9]{64}$/.test(container)) throw new Error('隔离容器身份无效');
  for (let attempt = 0; ; attempt++) {
    if (
      spawnSync('docker', [
        'exec',
        container,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        owner,
        '-d',
        database,
      ]).status === 0
    )
      break;
    if (attempt >= 40) throw new Error('隔离 PostgreSQL 未就绪');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const sql = (input) =>
    run(
      'docker',
      [
        'exec',
        '-i',
        container,
        'psql',
        '-XqAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        owner,
        '-d',
        database,
        '-f',
        '-',
      ],
      { input },
    );
  if (sql('SELECT current_database(), current_user;') !== `${database}|${owner}`)
    throw new Error('隔离数据库身份不符');
  const migrationRoot = `${root}apps/server/prisma/migrations`;
  const migrations = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migration of migrations)
    sql(readFileSync(`${migrationRoot}/${migration}/migration.sql`, 'utf8'));
  const port = run('docker', ['port', container, '5432/tcp']).split(':').at(-1);
  const url = `postgresql://${owner}:isolated_fixture@127.0.0.1:${port}/${database}`;
  console.log(JSON.stringify({ database, owner, migrations: migrations.length, isolated: true }));
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@thesis-ledger/server',
      'exec',
      'vitest',
      'run',
      '--no-file-parallelism',
      'test/quality/data-quality-postgres.integration.test.ts',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: 120000,
      env: { ...process.env, DATABASE_URL: url, DATA_QUALITY_TEST_DATABASE_URL: url },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  cleanup();
}
