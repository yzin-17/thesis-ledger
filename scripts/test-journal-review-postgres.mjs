import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const container = `ledger-journal-test-${randomUUID().slice(0, 8)}`;
const withRedis = process.env.AUTHORING_WITH_REDIS === '1';
if (withRedis && !process.argv.includes('test/strategy-authoring/authoring-execution.integration.test.ts'))
  throw new Error('Redis 隔离仅供明确的编写执行验收入口');
const redisContainer = `${container}-redis`;
const queueScope = randomUUID();
const database = 'journal_review_fixture';
const owner = 'fixture_owner';
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 60000,
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
let redisStarted = false;
try {
  run('pnpm', ['--filter', '@thesis-ledger/server...', 'build'], { timeout: 120000 });
  console.log('已构建当前结构初始化入口及 Server 依赖');
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
  const port = run('docker', ['port', container, '5432/tcp']).split(':').at(-1);
  const url = `postgresql://${owner}:isolated_fixture@127.0.0.1:${port}/${database}`;
  const initialization = run(
    process.execPath,
    ['apps/server/dist/src/platform/dev-database-rebuild.js'],
    {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DATABASE_URL: url,
        DEV_DATABASE_MODE: 'rebuild',
        DEV_DATABASE_ALLOW_DATA_LOSS: 'true',
        DEV_DATABASE_PROJECT: 'journal-isolation',
        DEV_DATABASE_CONFIRM: `journal-isolation/${database}`,
        DEV_DATABASE_EXPECTED_DATABASE: database,
        DEV_DATABASE_EXPECTED_OWNER: owner,
        DEV_DATABASE_PERMISSIONS_SQL: `${root}apps/server/test/journal/app-role.fixture.sql`,
        THESIS_LEDGER_SCHEMA_INPUT_ROOT: `${root}apps/server/prisma`,
      },
    },
  );
  sql(initialization);
  if (sql('SELECT version FROM "SchemaVersion" WHERE id = 1;') !== migrations.at(-1))
    throw new Error('复盘隔离数据库结构 head 不符');
  console.log(
    JSON.stringify({
      database,
      owner,
      migrations: migrations.length,
      head: migrations.at(-1),
      isolated: true,
    }),
  );
  let redisUrl;
  if (withRedis) {
    run('docker', ['run', '--pull', 'never', '-d', '--name', redisContainer, '-p', '127.0.0.1::6379',
      'redis:8-alpine', 'redis-server', '--save', '', '--appendonly', 'no']);
    redisStarted = true;
    for (let attempt = 0; ; attempt++) {
      const ready = spawnSync('docker', ['exec', redisContainer, 'redis-cli', 'ping']);
      if (ready.status === 0 && ready.stdout.toString().trim() === 'PONG') break;
      if (attempt >= 40) throw new Error('隔离 Redis 未就绪');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const redisPort = run('docker', ['port', redisContainer, '6379/tcp']).split(':').at(-1);
    redisUrl = `redis://127.0.0.1:${redisPort}`;
    console.log('已启动独立 Redis 与随机编写队列范围');
  }
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@thesis-ledger/server',
      'exec',
      'vitest',
      'run',
      '--no-file-parallelism',
      ...(process.argv.length > 2
        ? process.argv.slice(2)
        : [
            'test/journal/projection-postgres.integration.test.ts',
            'test/journal/snapshots-postgres.integration.test.ts',
            'test/journal/ai-postgres.integration.test.ts',
          ]),
    ],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: 120000,
      env: { ...process.env, DATABASE_URL: url, JOURNAL_REVIEW_DATABASE_URL: url, AI_EXECUTION_DATABASE_URL: url,
        ...(withRedis ? { NODE_ENV: 'test', AUTHORING_ISOLATED: '1', AUTHORING_TEST_SCOPE: queueScope, REDIS_URL: redisUrl } : {}) },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (redisStarted) { run('docker', ['rm', '-f', redisContainer]); console.log('已清理本次隔离 Redis'); }
  if (started) {
    run('docker', ['rm', '-f', container]);
    console.log('已清理本次复盘隔离容器');
  }
}
