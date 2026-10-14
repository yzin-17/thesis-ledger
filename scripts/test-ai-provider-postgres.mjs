import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const container = `ledger-ai-provider-test-${randomUUID().slice(0, 8)}`;
const database = 'ai_provider_concurrency_fixture';
const owner = 'fixture_owner';
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
  const tests = process.argv.slice(2);
  if (
    tests.length === 0 ||
    tests.some((test) => test.endsWith('ai-research-process-recovery.integration.test.ts'))
  ) {
    run('pnpm', ['--filter', '@thesis-ledger/server...', 'build'], { timeout: 120_000 });
    console.log('已构建当前 Server 与依赖，独立恢复进程使用本次产物');
  }
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
  const identity = sql('SELECT current_database(), current_user;');
  if (identity !== `${database}|${owner}`) throw new Error('隔离数据库身份不符');
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
      ...(tests.length
        ? tests
        : [
            'test/ai/ai-provider-save-postgres.integration.test.ts',
            'test/ai/ai-provider-default-postgres.integration.test.ts',
            'test/ai/ai-research-submission-postgres.integration.test.ts',
            'test/ai/ai-research-process-recovery.integration.test.ts',
          ]),
    ],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: 120_000,
      env: {
        ...process.env,
        DATABASE_URL: url,
        AI_PROVIDER_DATABASE_URL: url,
        AI_EXECUTION_DATABASE_URL: url,
      },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (started) run('docker', ['rm', '-f', container]);
}
