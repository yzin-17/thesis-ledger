import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stableTarget, validateTarget } from './automation-process-recovery-smoke.mjs';
import {
  cashMockDatabase,
  cashMockKind,
  cashMockLabel,
  cashMockNames,
  cashMockOwner,
  cashMockProject,
  parseCashMockArguments,
  parseFeishuHookSource,
  redactFeishuDiagnostic,
  validateCashMockRedisTarget,
  validateCashMockTemporary,
} from './cash-notification-mock.contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = `${cashMockProject}-thesis-ledger-1`;
const redisTarget = `${cashMockProject}-redis-1`;
const digest = (value) => createHash('sha256').update(value).digest('hex');

function docker(args, input, timeout = 30000, missingAllowed = false) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    input,
    timeout,
    maxBuffer: 12 * 1024 * 1024,
  });
  if (missingAllowed && result.status !== 0 && /No such (object|container)/iu.test(result.stderr))
    return null;
  if (result.error || result.status !== 0) {
    const error = new Error(
      `维护步骤${args[0]}失败：${result.error?.message ?? result.stderr.slice(-1200)}`,
    );
    error.runtimeOutput = result.stdout;
    throw error;
  }
  return result.stdout.trim();
}
const inspect = (name, optional = false) => {
  const value = docker(['inspect', name], undefined, 30000, optional);
  return value === null ? null : JSON.parse(value)[0];
};

export function cashMockProtectedSnapshotSource() {
  const tables = [
    'Account',
    'AccountLedgerState',
    'LedgerEvent',
    'Trade',
    'JournalEntry',
    'ProviderConfig',
    'AiRoutingSettings',
    'AiRun',
    'AiToolCall',
    'NotificationDelivery',
    'RecurringCashDepositPlan',
    'RecurringCashDepositOccurrence',
  ];
  const queries = Object.fromEntries(
    tables.map((name) => [
      name,
      `SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY md5(to_jsonb(r)::text)),'')) AS digest FROM "${name}" r`,
    ]),
  );
  return `import{createRequire}from'node:module';const require=createRequire('/app/apps/server/package.json');
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();try{const result=await p.$transaction(async t=>{
await t.$executeRawUnsafe('SET TRANSACTION READ ONLY');const[i]=await t.$queryRawUnsafe('SELECT current_database() AS database,current_user AS role');
if(i.database!=='thesis_ledger'||i.role!=='thesis_ledger_app')throw Error('保护快照目标不匹配');const tables={};
for(const[name,query]of Object.entries(${JSON.stringify(queries)}))tables[name]=(await t.$queryRawUnsafe(query))[0];
return{identity:i,tables};},{isolationLevel:'RepeatableRead',timeout:30000});console.log(JSON.stringify(result));}finally{await p.$disconnect()}`;
}

function protectedSnapshot() {
  const source = cashMockProtectedSnapshotSource();
  return JSON.parse(docker(['exec', '-i', server, 'node', '--input-type=module'], source));
}

function verifyModules() {
  const files = [
    'automation/automation-runtime.service.js',
    'cash-plans/recurring-cash-deposit.service.js',
    'cash-plans/recurring-cash-deposit.schedule.js',
    'cash-plans/recurring-cash-deposit-notification.js',
    'notifications/notification.service.js',
    'notifications/notification.dispatcher.js',
    'platform/config.js',
    'platform/redis.service.js',
    'platform/credential-security.js',
    'providers/provider-health.service.js',
    'providers/feishu-webhook-security.js',
  ];
  const local = Object.fromEntries(
    files.map((name) => [name, digest(readFileSync(`${root}apps/server/dist/src/${name}`))]),
  );
  const source = `import fs from'node:fs';import crypto from'node:crypto';const names=${JSON.stringify(files)};
console.log(JSON.stringify(Object.fromEntries(names.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync('/app/apps/server/dist/src/'+n)).digest('hex')]))))`;
  const target = JSON.parse(docker(['exec', '-i', server, 'node', '--input-type=module'], source));
  assert.deepEqual(target, local, '当前目标与宿主编译模块不同，不执行隔离运行');
  return local;
}

function stopOwnedRuntime(pid, token) {
  if (!pid) return;
  const source = `import fs from'node:fs';const pid=${Number(pid)};if(!Number.isSafeInteger(pid)||pid<=1)throw Error('非法子进程');
try{const env=fs.readFileSync('/proc/'+pid+'/environ','utf8').split('\0');
if(!env.includes('THESIS_LEDGER_CASH_NOTIFICATION_MOCK_TOKEN='+${JSON.stringify(token)}))throw Error('拒绝终止非本次子进程');
process.kill(pid,'SIGTERM');console.log('owned-runtime-stopped');}catch(e){if(e.code!=='ENOENT'&&e.code!=='ESRCH')throw e;}`;
  docker(['exec', '-i', server, 'node', '--input-type=module'], source);
}

export function main(args = process.argv.slice(2)) {
  const options = parseCashMockArguments(args);
  const output = resolve(options.output);
  const artifactRoot = realpathSync(`${root}.recovery-artifacts`);
  assert.ok(
    realpathSync(dirname(output)).startsWith(`${artifactRoot}/`),
    '输出目录必须在本仓隔离产物目录',
  );
  assert.ok(!existsSync(output), '输出文件已存在，保留原回执并选择新路径');
  const token = options['cleanup-token'] ?? randomUUID();
  const names = cashMockNames(token);
  const live = options.mode === 'feishu-live';
  const report = {
    version: 1,
    kind: cashMockKind,
    token,
    names,
    startedAt: new Date().toISOString(),
    mode: options.mode ?? 'mock',
    simulatedProvider: !live,
    realFeishuDelivery: false,
    cleanup: {},
  };
  let runtimePid;
  let failure;
  let targetBefore;
  let redisBefore;
  let liveWebhook;
  try {
    const target = inspect(server);
    validateTarget(target, cashMockProject);
    const redis = inspect(redisTarget);
    const redisImage = validateCashMockRedisTarget(redis);
    targetBefore = stableTarget(target);
    redisBefore = stableTarget(redis);
    report.target = targetBefore;
    if (!options['cleanup-token']) {
      if (live) {
        liveWebhook = parseFeishuHookSource(readFileSync(resolve(homedir(), '.zshrc'), 'utf8'));
        report.credentialSource = '~/.zshrc:FEISHU_HOOK';
        report.recipient = 'FEISHU_HOOK绑定群';
        report.realRequestLimit = 1;
      }
      report.moduleHashes = verifyModules();
      report.protectedBefore = protectedSnapshot();
      docker(['image', 'inspect', 'postgres:17-alpine', '--format', '{{.Id}}']);
      for (const role of ['postgres', 'redis']) {
        const directory = role === 'postgres' ? '/var/lib/postgresql/data' : '/data';
        const base = [
          'run',
          '--pull',
          'never',
          '-d',
          '--name',
          names[role],
          '--network',
          `${cashMockProject}_default`,
          '--label',
          `${cashMockLabel}=${cashMockKind}`,
          '--label',
          `io.thesisledger.acceptance-token=${token}`,
          '--label',
          `io.thesisledger.acceptance-role=${role}`,
          '--cpus',
          '1',
          '--memory',
          role === 'postgres' ? '384m' : '64m',
          '--tmpfs',
          `${directory}:rw,size=${role === 'postgres' ? '256m' : '16m'}`,
        ];
        if (role === 'postgres')
          base.push(
            '-e',
            `POSTGRES_USER=${cashMockOwner}`,
            '-e',
            'POSTGRES_PASSWORD=isolated_fixture',
            '-e',
            `POSTGRES_DB=${cashMockDatabase}`,
            'postgres:17-alpine',
          );
        else
          base.push(
            redisImage,
            'redis-server',
            '--save',
            '',
            '--appendonly',
            'no',
            '--maxmemory',
            '16mb',
            '--maxmemory-policy',
            'noeviction',
          );
        docker(base);
        validateCashMockTemporary(inspect(names[role]), token, role);
      }
      docker([
        'exec',
        names.postgres,
        'sh',
        '-c',
        'for i in $(seq 1 80); do pg_isready -h 127.0.0.1 -U fixture_owner -d cash_notification_fixture >/dev/null 2>&1 && exit 0; sleep 0.1; done; exit 1',
      ]);
      docker([
        'exec',
        names.redis,
        'sh',
        '-c',
        'for i in $(seq 1 80); do test "$(redis-cli ping)" = PONG && exit 0; sleep 0.1; done; exit 1',
      ]);
      const sql = (input) =>
        docker(
          [
            'exec',
            '-i',
            names.postgres,
            'psql',
            '-XqAt',
            '-v',
            'ON_ERROR_STOP=1',
            '-U',
            cashMockOwner,
            '-d',
            cashMockDatabase,
            '-f',
            '-',
          ],
          input,
        );
      assert.equal(
        sql('SELECT current_database(),current_user;'),
        `${cashMockDatabase}|${cashMockOwner}`,
      );
      const path = `${root}apps/server/prisma/migrations`;
      const migrations = readdirSync(path, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      assert.ok(migrations.length);
      for (const migration of migrations)
        sql(readFileSync(`${path}/${migration}/migration.sql`, 'utf8'));
      assert.equal(sql('SELECT version FROM "SchemaVersion" LIMIT 1;'), migrations.at(-1));
      report.migrations = { count: migrations.length, head: migrations.at(-1) };
      const runtime = readFileSync(
        new URL(
          live ? './cash-notification-feishu.runtime.mjs' : './cash-notification-mock.runtime.mjs',
          import.meta.url,
        ),
        'utf8',
      );
      const rawOwned = JSON.parse(
        readFileSync(`${root}apps/server/prisma/raw-owned-tables.json`, 'utf8'),
      ).tables.map((row) => row.name);
      report.runtimeSourceSha256 = digest(runtime);
      let stdout;
      try {
        stdout = docker(
          [
            'exec',
            '-i',
            '-e',
            `THESIS_LEDGER_CASH_NOTIFICATION_MOCK_TOKEN=${token}`,
            server,
            'node',
            '--input-type=module',
            '-e',
            runtime,
          ],
          JSON.stringify({
            token,
            databaseUrl: `postgresql://${cashMockOwner}:isolated_fixture@${names.postgres}:5432/${cashMockDatabase}`,
            redisUrl: `redis://${names.redis}:6379/0`,
            rawOwned,
            ...(live ? { webhook: liveWebhook, realRequestLimit: 1 } : {}),
          }),
          60000,
        );
      } catch (error) {
        stdout = redactFeishuDiagnostic(error.runtimeOutput ?? '', liveWebhook);
        const started = stdout
          .split('\n')
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .find((x) => x?.event === 'cash-mock-started');
        runtimePid = started?.pid;
        const receipt = stdout
          .split('\n')
          .flatMap((line) => {
            try {
              return [JSON.parse(line)];
            } catch {
              return [];
            }
          })
          .find((row) => row.assertionsPassed !== undefined);
        if (receipt) report.runtime = receipt;
        throw error;
      }
      stdout = redactFeishuDiagnostic(stdout, liveWebhook);
      const events = stdout.split('\n').map((line) => JSON.parse(line));
      runtimePid = events.find((x) => x.event === 'cash-mock-started')?.pid;
      report.runtime = events.at(-1);
      assert.equal(report.runtime.assertionsPassed, true);
      report.realFeishuDelivery = report.runtime.realFeishuDelivery;
      report.protectedAfter = protectedSnapshot();
      assert.deepEqual(
        report.protectedAfter,
        report.protectedBefore,
        '正常业务、凭据、路由或通知记录发生变化',
      );
      report.protectedUnchanged = true;
    }
  } catch (error) {
    failure = new Error(redactFeishuDiagnostic(error.message, liveWebhook));
    report.error = failure.message;
  } finally {
    if (report.protectedBefore && !report.protectedAfter) {
      try {
        report.protectedAfter = protectedSnapshot();
        assert.deepEqual(report.protectedAfter, report.protectedBefore);
        report.protectedUnchanged = true;
      } catch (error) {
        report.protectedUnchanged = false;
        report.protectedError = redactFeishuDiagnostic(error.message, liveWebhook);
        failure ??= new Error(report.protectedError);
      }
    }
    if (runtimePid) {
      try {
        stopOwnedRuntime(runtimePid, token);
      } catch (error) {
        report.cleanup.runtimeError = error.message;
        failure ??= error;
      }
    }
    for (const role of ['redis', 'postgres']) {
      try {
        const temporary = inspect(names[role], true);
        if (temporary) {
          validateCashMockTemporary(temporary, token, role);
          docker(['rm', '-f', names[role]]);
        }
        report.cleanup[role] = inspect(names[role], true) === null;
      } catch (error) {
        report.cleanup[role] = false;
        report.cleanup[`${role}Error`] = error.message;
        failure ??= error;
      }
    }
    try {
      if (targetBefore) assert.deepEqual(stableTarget(inspect(server)), targetBefore);
      if (redisBefore) assert.deepEqual(stableTarget(inspect(redisTarget)), redisBefore);
      report.targetUnchanged = Boolean(targetBefore && redisBefore);
    } catch (error) {
      report.targetUnchanged = false;
      failure ??= error;
      report.targetError = error.message;
    }
    report.completedAt = new Date().toISOString();
    report.passed = !failure;
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  console.log(
    JSON.stringify({
      passed: report.passed,
      output,
      mockRequests: report.runtime?.mockHttpRequests,
      cleanup: report.cleanup,
      targetUnchanged: report.targetUnchanged,
      error: report.error,
    }),
  );
  if (failure) throw failure;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
