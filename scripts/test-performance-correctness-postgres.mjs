import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const serverRoot = `${root}apps/server/`;
const container = `ledger-performance-test-${randomUUID().slice(0, 8)}`;
const database = 'portfolio_valuation_fixture';
const owner = 'fixture_owner';
const defaultTests = [
  'test/performance/target-postgres.integration.test.ts',
  'test/performance/correctness-http-postgres.integration.test.ts',
];
const allowedAdditionalTests = new Set(['test/risk/valuation-postgres.integration.test.ts']);
const additionalTests = process.argv.slice(2);

for (const testFile of additionalTests) {
  if (!allowedAdditionalTests.has(testFile)) throw new Error(`不允许的隔离测试文件：${testFile}`);
}
const testFiles = [...defaultTests, ...additionalTests];
for (const testFile of testFiles) {
  if (!existsSync(`${serverRoot}${testFile}`)) throw new Error(`隔离测试文件不存在：${testFile}`);
}

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
      database,
    ]);
    if (ready.status === 0) break;
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
  if (migrations.length === 0) throw new Error('未发现数据库 migration');
  for (const migration of migrations)
    sql(readFileSync(`${migrationRoot}/${migration}/migration.sql`, 'utf8'));
  if (sql('SELECT version FROM "SchemaVersion" WHERE id=1;') !== migrations.at(-1))
    throw new Error('隔离数据库结构 head 与实际 migration 输入不一致');

  const port = run('docker', ['port', container, '5432/tcp']).split(':').at(-1);
  const url = `postgresql://${owner}:isolated_fixture@127.0.0.1:${port}/${database}`;
  console.log(
    JSON.stringify({
      database,
      owner,
      migrations: migrations.length,
      head: migrations.at(-1),
      tests: testFiles,
      isolated: true,
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
      ...testFiles,
    ],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: 180_000,
      env: {
        ...process.env,
        DATABASE_URL: url,
        PORTFOLIO_VALUATION_DATABASE_URL: url,
        PERFORMANCE_CORRECTNESS_DATABASE_URL: url,
        RISK_VALUATION_DATABASE_URL: url,
      },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (started) {
    run('docker', ['rm', '-f', container]);
    console.log('已清理本次收益正确性隔离容器');
  }
}
