import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// 固定独立数据库、随机容器、tmpfs 和回环随机端口；不接受业务库或容器参数。
if (process.argv.length !== 2) throw new Error('账本隔离入口不接受目标参数');
const root = fileURLToPath(new URL('../', import.meta.url));
const container = `ledger-current-test-${randomUUID().slice(0, 8)}`;
const databases = ['ledger_current_fixture', 'ledger_envelope_fixture'];
const owner = 'fixture_owner';
const password = 'isolated_fixture';
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`,
    );
  return result.stdout.trim();
};
let started = false;
try {
  run('docker', [
    'run',
    '--pull',
    'never',
    '-d',
    '--name',
    container,
    '--label',
    'thesis-ledger.fixture=ledger-current',
    '--tmpfs',
    '/var/lib/postgresql/data',
    '-p',
    '127.0.0.1::5432',
    '-e',
    `POSTGRES_USER=${owner}`,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    `POSTGRES_DB=${databases[0]}`,
    'postgres:17-alpine',
  ]);
  started = true;
  for (let attempt = 0; ; attempt++) {
    const ready = spawnSync('docker', [
      'exec',
      container,
      'pg_isready',
      '-h',
      '127.0.0.1',
      '-U',
      owner,
      '-d',
      databases[0],
    ]);
    if (ready.status === 0) break;
    if (attempt >= 40) throw new Error('账本隔离 PostgreSQL 未就绪');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const sql = (database, input) =>
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
  sql(databases[0], `CREATE DATABASE ${databases[1]} OWNER ${owner};`);
  const migrationRoot = `${root}apps/server/prisma/migrations`;
  const migrations = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const database of databases) {
    if (sql(database, 'SELECT current_database(), current_user;') !== `${database}|${owner}`)
      throw new Error('账本隔离数据库身份不符');
    for (const migration of migrations)
      sql(database, readFileSync(`${migrationRoot}/${migration}/migration.sql`, 'utf8'));
  }
  const binding = run('docker', ['port', container, '5432/tcp']);
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('隔离端口必须仅绑定回环地址');
  const port = binding.split(':').at(-1);
  const url = (database) => `postgresql://${owner}:${password}@127.0.0.1:${port}/${database}`;
  console.log(
    JSON.stringify({
      databases,
      owner,
      migrations: migrations.length,
      head: migrations.at(-1),
      isolated: true,
      storage: 'tmpfs',
    }),
  );
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@thesis-ledger/server',
      'exec',
      'vitest',
      'run',
      '--no-file-parallelism',
      'test/ledger/current-envelope-commands.integration.test.ts',
      'test/ledger/current-envelope-http.integration.test.ts',
      'test/ledger/ledger-envelope-postgres.integration.test.ts',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: 120_000,
      env: {
        ...process.env,
        DATABASE_URL: url(databases[0]),
        LEDGER_CURRENT_TEST_DATABASE_URL: url(databases[0]),
        LEDGER_ENVELOPE_TEST_DATABASE_URL: url(databases[1]),
      },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (started) {
    run('docker', ['rm', '-f', container]);
    console.log('已清理本次账本隔离容器；业务容器、数据库和卷未作为操作目标');
  }
}
