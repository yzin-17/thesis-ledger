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
  const envelopeMigration = '20261124143000_named_v1_ledger_envelope';
  const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa33';
  const eventId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb33';
  const eventSnapshot = `SELECT (to_jsonb(e) - 'envelopeVersion')::text
    FROM "LedgerEvent" e WHERE id = '${eventId}';`;
  const portfolioSnapshot = `SELECT (to_jsonb(p) - 'payloadVersion')::text
    FROM "PortfolioSnapshot" p WHERE "idempotencyKey" = 'named-v1-fixture';`;
  const insertEvent = (version) => `
    INSERT INTO "LedgerEvent" (id, "accountId", type, "envelopeVersion", "payloadVersion",
      "ledgerRevision", "factId", "occurredAt", "timePrecision", "sourceTimezone",
      "economicOrderKey", "sourceCategory", "sourceChannel", "actorId", "revisionAction", payload)
    VALUES ('${eventId}', '${accountId}', 'CASH_FLOW', ${version}, 1,
      1, 'cccccccc-cccc-4ccc-8ccc-cccccccccc33', '2026-09-29T02:00:00Z', 'INSTANT',
      'Asia/Shanghai', 'fixture:1', 'MANUAL', 'fixture', 'fixture-user', 'CREATE',
      '{"direction":"INFLOW","category":"DEPOSIT","currency":"CNY","amount":"100.01"}');
  `;
  for (const database of databases) {
    if (sql(database, 'SELECT current_database(), current_user;') !== `${database}|${owner}`)
      throw new Error('账本隔离数据库身份不符');
    for (const migration of migrations) {
      const source = readFileSync(`${migrationRoot}/${migration}/migration.sql`, 'utf8');
      if (migration !== envelopeMigration) {
        if (migration === '20261124162500_named_v1_contract_boundary') {
          const dailyId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee34';
          sql(database, `INSERT INTO "ModelArena" (id, "ownerId", protocol, remaining)
            VALUES ('${dailyId}', '${accountId}', '{"version":1,"title":"日频模拟样本"}', '{}');`);
          const dailyFacts = `SELECT (to_jsonb(a) - 'protocol') || (protocol - 'version') AS facts
            FROM "ModelArena" a WHERE id = '${dailyId}';`;
          const before = sql(database, dailyFacts);
          const insertOldMatch = `INSERT INTO "ArenaLiveMatch" (id, "ownerId", protocol, remaining)
            VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee33', '${accountId}', '{"version":2}', '{}');`;
          try {
            sql(database, source.replace('BEGIN;', `BEGIN;\n${insertOldMatch}`));
            throw new Error('具名合同迁移接受了未转换比赛');
          } catch (error) {
            if (!String(error).includes('require the staged data cutover')) throw error;
          }
          const dailyVersion = `SELECT protocol->>'version' FROM "ModelArena" WHERE id = '${dailyId}';`;
          if (sql(database, dailyVersion) !== '1') throw new Error('切换失败后日频协议未回滚');
          sql(database, source);
          if (sql(database, dailyFacts) !== before ||
              sql(database, dailyVersion) !== 'arena-historical-match-protocol-v1')
            throw new Error('日频模拟源数据及具名协议对账失败');
          const researchId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee35';
          sql(database, `INSERT INTO "AiRun" (id, provider, model, "promptVersion", status, "updatedAt",
            "researchOwnerId", "researchSubmissionId", "researchInputDigest", "researchScopeSnapshot")
            VALUES ('${researchId}', 'fixture', 'fixture', 'fixture', 'queued', CURRENT_TIMESTAMP,
              '${accountId}', '${dailyId}', repeat('a', 64),
              '{"version":"research-scope-snapshot-v1","mode":"actual","scope":"instrument"}');`);
          try {
            sql(database, `UPDATE "AiRun" SET "researchScopeSnapshot" =
              '{"version":"research-scope-v2","mode":"actual","scope":"instrument"}'
              WHERE id = '${researchId}';`);
            throw new Error('数据库接受旧研究范围合同');
          } catch (error) {
            if (!String(error).includes('AiRun_research_report_submission_check')) throw error;
          }
          continue;
        }
        sql(database, source);
        continue;
      }
      sql(database, `INSERT INTO "Account" (id, name, type, "updatedAt")
        VALUES ('${accountId}', '具名账本迁移夹具', 'securities', CURRENT_TIMESTAMP);`);
      // 在可回滚事务中验证旧空版本阻断转换。
      try {
        sql(database, source.replace('BEGIN;', `BEGIN;\n${insertEvent('NULL')}`));
        throw new Error('账本迁移接受了旧空版本');
      } catch (error) {
        if (!String(error).includes('requires a verified current event envelope')) throw error;
      }
      sql(database, insertEvent(3));
      sql(database, `
        INSERT INTO "PortfolioSnapshot" (id, scope, "slotKey", "capturedAt", "valuationDate",
          source, "valuationBasis", "valuationStatus", "marketValue", "costValue",
          "cashValue", "totalValue", "baseCurrency", "idempotencyKey", "payloadVersion", payload)
        VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddd33','portfolio','named-v1-fixture',
          '2026-09-29T07:00:00Z','2026-09-29','DAILY_CLOSE','OFFICIAL','COMPLETE',
          900.98,800.33,100.01,1000.99,'CNY','named-v1-fixture',2,'{"amount":"1000.99"}');
      `);
      const before = sql(database, eventSnapshot);
      const beforePortfolio = sql(database, portfolioSnapshot);
      sql(database, source);
      if (sql(database, eventSnapshot) !== before ||
          sql(database, `SELECT "envelopeVersion" FROM "LedgerEvent" WHERE id = '${eventId}';`) !== '1')
        throw new Error('账本原始事件或信封转换对账失败');
      if (sql(database, portfolioSnapshot) !== beforePortfolio ||
          sql(database, `SELECT "payloadVersion" FROM "PortfolioSnapshot" WHERE "idempotencyKey" = 'named-v1-fixture';`) !== '1')
        throw new Error('组合估值快照转换对账失败');
      try {
        sql(database, `UPDATE "LedgerEvent" SET "actorId" = 'changed' WHERE id = '${eventId}';`);
        throw new Error('账本迁移后可修改历史事件');
      } catch (error) {
        if (!String(error).includes('LedgerEvent is append-only')) throw error;
      }
    }
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
