import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  discoverDatabaseStructure,
  buildDatabaseStructureCheckSql,
} from '../apps/server/src/platform/database-structure.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const profiles = {
  'multi-window': {
    database: `d01_multiwindow_0928_${randomUUID().slice(0, 8)}`,
    test: 'test/backtest/v3-multi-window-postgres.integration.test.ts',
    passwordless: true,
  },
  'risk-adoption': {
    database: 'risk_adoption_fixture',
    test: 'test/strategy-optimization/risk-adoption-postgres.integration.test.ts',
    passwordless: false,
  },
};
const requested = process.argv.slice(2);
if (requested.some((name) => !Object.hasOwn(profiles, name)))
  throw new Error('仅支持 multi-window 与 risk-adoption 专属隔离测试');

function run(command, args, options = {}) {
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
}

async function verifyProfile(name) {
  const profile = profiles[name];
  const database = profile.database;
  const owner = profile.passwordless ? database : 'fixture_owner';
  const container = `ledger-strategy-regression-${randomUUID().slice(0, 8)}`;
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
      `POSTGRES_DB=${database}`,
      '-e',
      profile.passwordless
        ? 'POSTGRES_HOST_AUTH_METHOD=trust'
        : 'POSTGRES_PASSWORD=isolated_fixture',
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
      if (attempt >= 40) throw new Error('专属隔离数据库未就绪');
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
    const identity = sql(`SELECT current_database(), current_user, pg_get_userbyid(datdba)
      FROM pg_database WHERE datname = current_database();`);
    if (identity !== `${database}|${owner}|${owner}`)
      throw new Error('专属隔离数据库名称、用户或 owner 不符');
    const structure = await discoverDatabaseStructure(`${root}apps/server/prisma`);
    for (const migration of structure.migrations)
      sql(
        readFileSync(
          `${root}apps/server/prisma/migrations/${migration.name}/migration.sql`,
          'utf8',
        ),
      );
    sql(`BEGIN;
      INSERT INTO "SchemaVersion" (id, version) VALUES (1, '${structure.currentHead}')
      ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, "updatedAt" = CURRENT_TIMESTAMP;
      ${buildDatabaseStructureCheckSql(structure, { databaseName: database, ownerName: owner })}
      COMMIT;`);
    const port = run('docker', ['port', container, '5432/tcp']).split(':').at(-1);
    if (!/^\d+$/.test(port) || port === '5432') throw new Error('专属隔离端口无效');
    const credential = profile.passwordless ? owner : `${owner}:isolated_fixture`;
    const url = `postgresql://${credential}@127.0.0.1:${port}/${database}`;
    console.log(
      JSON.stringify({
        profile: name,
        database,
        owner,
        head: structure.currentHead,
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
        profile.test,
      ],
      {
        cwd: root,
        stdio: 'inherit',
        timeout: 120_000,
        env: {
          ...process.env,
          DATABASE_URL: url,
          MULTI_WINDOW_TEST_DATABASE_URL: profile.passwordless ? url : '',
          MULTI_WINDOW_TEST_DATABASE_NAME: profile.passwordless ? database : '',
          RISK_ADOPTION_TEST_DATABASE_URL: profile.passwordless ? '' : url,
        },
      },
    );
    if (result.error) throw result.error;
    return result.status ?? 1;
  } finally {
    if (started) {
      run('docker', ['rm', '-f', container]);
      console.log(`已清理本次 ${name} 专属隔离容器`);
    }
  }
}

for (const name of requested.length ? requested : Object.keys(profiles)) {
  const status = await verifyProfile(name);
  if (status !== 0) process.exitCode = status;
}
