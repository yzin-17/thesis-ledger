import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Dedicated, disposable resources. Never connects to the development stack,
// pulls/builds images, creates volumes, or changes application/notification setup.
const root = fileURLToPath(new URL('../', import.meta.url));
const id = randomUUID();
const postgres = `ledger-risk-pg-${id.slice(0, 8)}`;
const redis = `ledger-risk-redis-${id.slice(0, 8)}`;
const database = 'risk_monitoring_fixture';
const owner = 'fixture_owner';
const started = [];
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(`${command}: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result.stdout.trim();
}
async function ready(name, args) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = spawnSync('docker', ['exec', name, ...args], { encoding: 'utf8' });
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Isolated service not ready: ${name}`);
}
try {
  run('docker', [
    'run',
    '--pull',
    'never',
    '-d',
    '--name',
    postgres,
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
  started.push(postgres);
  run('docker', [
    'run',
    '--pull',
    'never',
    '-d',
    '--name',
    redis,
    '--tmpfs',
    '/data',
    '-p',
    '127.0.0.1::6379',
    'redis:8-alpine',
    'redis-server',
    '--save',
    '',
    '--appendonly',
    'no',
  ]);
  started.push(redis);
  await ready(postgres, ['pg_isready', '-h', '127.0.0.1', '-U', owner, '-d', database]);
  await ready(redis, ['redis-cli', 'ping']);
  const sql = (input) =>
    run(
      'docker',
      [
        'exec',
        '-i',
        postgres,
        'psql',
        '-XqAt',
        '-h',
        '127.0.0.1',
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
  if (sql('SELECT current_database(), current_user') !== `${database}|${owner}`)
    throw new Error('Isolated database identity mismatch');
  const directory = `${root}apps/server/prisma/migrations`;
  const migrations = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migration of migrations)
    sql(readFileSync(`${directory}/${migration}/migration.sql`, 'utf8'));
  run('docker', ['exec', redis, 'redis-cli', 'SET', 'fixture:owner', id]);
  const pgPort = run('docker', ['port', postgres, '5432/tcp']).split(':').at(-1);
  const redisPort = run('docker', ['port', redis, '6379/tcp']).split(':').at(-1);
  const databaseUrl = `postgresql://${owner}:isolated_fixture@127.0.0.1:${pgPort}/${database}`;
  const redisUrl = `redis://127.0.0.1:${redisPort}`;
  console.log(
    JSON.stringify({
      isolated: true,
      database,
      owner,
      migrations: migrations.length,
      head: migrations.at(-1),
    }),
  );
  const result = spawnSync(
    `${root}node_modules/.bin/vitest`,
    ['run', 'test/risk/monitoring-runtime.integration.test.ts'],
    {
      cwd: `${root}apps/server`,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        RISK_MONITORING_DATABASE_URL: databaseUrl,
        RISK_MONITORING_REDIS_URL: redisUrl,
        RISK_MONITORING_FIXTURE_ID: id,
      },
    },
  );
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  console.log(
    result.status === 0
      ? output
          .split('\n')
          .filter((line) => /Test Files|Tests |Duration|passed/.test(line))
          .join('\n')
      : output,
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  let cleaned = true;
  for (const name of started.reverse()) {
    try {
      run('docker', ['rm', '-f', name]);
    } catch (error) {
      cleaned = false;
      process.exitCode = 1;
      console.error(`隔离资源清理失败 ${name}: ${error.message}`);
    }
  }
  if (cleaned) console.log('已清理本次风险监控隔离容器；未操作开发服务或 volumes');
}
