import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const ownerLabel = 'io.thesisledger.acceptance';
const kind = 'automation-process-recovery';

export function validateTarget(target, project) {
  assert.equal(target.Config.Labels['com.docker.compose.project'], project);
  assert.equal(target.Config.Labels['com.docker.compose.service'], 'thesis-ledger');
  assert.equal(target.Config.WorkingDir, '/app');
  assert.equal(target.State.Running, true);
  assert.equal(target.State.Health?.Status, 'healthy');
  const network = `${project}_default`;
  assert.ok(Object.hasOwn(target.NetworkSettings.Networks, network));
  assert.match(target.Image, /^sha256:[a-f0-9]{64}$/u);
  return network;
}

export function validateTemporary(target, token, name) {
  assert.match(name, /^ledger-automation-test-[a-f0-9]{8}$/u);
  assert.equal(target.Name, `/${name}`);
  assert.equal(target.Config.Labels[ownerLabel], kind);
  assert.equal(target.Config.Labels['io.thesisledger.acceptance-token'], token);
  assert.ok(target.Mounts.every((mount) => mount.Type === 'tmpfs'));
  assert.ok(Object.hasOwn(target.HostConfig.Tmpfs ?? {}, '/var/lib/postgresql/data'));
}

export function stableTarget(target) {
  return {
    id: target.Id,
    image: target.Image,
    mounts: target.Mounts,
    startedAt: target.State.StartedAt,
  };
}

function main() {
  const options = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const match = /^--(output|server-container|project|cleanup)=(.+)$/u.exec(arg);
      assert.ok(match, '只接受 output/server-container/project/cleanup 显式参数');
      return [match[1], match[2]];
    }),
  );
  const project = options.project ?? 'thesis-ledger-dev';
  const server = options['server-container'] ?? `${project}-thesis-ledger-1`;
  assert.match(project, /^thesis-ledger-[a-z0-9-]+$/u);
  assert.match(server, /^[a-z0-9-]+$/u);
  const token = randomUUID();
  const temporary = `ledger-automation-test-${token.replaceAll('-', '').slice(0, 8)}`;
  const database = 'automation_process_fixture';
  const owner = 'fixture_owner';
  function run(args, input, timeout = 30_000) {
    const result = spawnSync('docker', args, {
      cwd: root,
      encoding: 'utf8',
      input,
      timeout,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0)
      throw new Error(
        `Docker 维护步骤 ${args[0]} 失败：${result.error?.message ?? result.stderr.slice(-1200)}`,
      );
    return result.stdout.trim();
  }
  const inspect = (name) => JSON.parse(run(['inspect', name]))[0];
  const target = inspect(server);
  const network = validateTarget(target, project);
  const before = stableTarget(target);
  if (options.cleanup) {
    const leftover = inspect(options.cleanup);
    const previousToken = leftover.Config.Labels['io.thesisledger.acceptance-token'];
    assert.equal(
      options.cleanup,
      `ledger-automation-test-${previousToken.replaceAll('-', '').slice(0, 8)}`,
    );
    validateTemporary(leftover, previousToken, options.cleanup);
    assert.ok(Object.hasOwn(leftover.NetworkSettings.Networks, network));
    run(['rm', '-f', options.cleanup]);
    assert.deepEqual(stableTarget(inspect(server)), before);
    console.log(JSON.stringify({ cleanedTemporary: options.cleanup, targetUnchanged: true }));
    return;
  }
  const modules = [
    'automation/automation.scheduler.js',
    'automation/automation.service.js',
    'automation/automation-execution-store.js',
    'automation/automation-runtime.service.js',
    'cash-plans/recurring-cash-deposit.service.js',
    'cash-plans/recurring-cash-deposit.schedule.js',
    'cash-plans/recurring-cash-deposit-notification.js',
  ];
  const hashes = Object.fromEntries(
    modules.map((name) => [
      name,
      createHash('sha256')
        .update(readFileSync(`${root}apps/server/dist/src/${name}`))
        .digest('hex'),
    ]),
  );
  const remoteHashes = JSON.parse(
    run([
      'exec',
      server,
      'node',
      '--input-type=module',
      '-e',
      `import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';const names=${JSON.stringify(modules)};console.log(JSON.stringify(Object.fromEntries(names.map(n=>[n,createHash('sha256').update(readFileSync('/app/apps/server/dist/src/'+n)).digest('hex')]))));`,
    ]),
  );
  assert.deepEqual(remoteHashes, hashes, '目标编译输入与当前宿主构建不一致');
  const migrationsPath = `${root}apps/server/prisma/migrations`;
  const migrations = readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.ok(migrations.length > 0);
  run(['image', 'inspect', 'postgres:17-alpine', '--format', '{{.Id}}']);
  let created = false;
  let result;
  try {
    run([
      'run',
      '--pull',
      'never',
      '-d',
      '--name',
      temporary,
      '--network',
      network,
      '--label',
      `${ownerLabel}=${kind}`,
      '--label',
      `io.thesisledger.acceptance-token=${token}`,
      '--memory',
      '384m',
      '--cpus',
      '1',
      '--tmpfs',
      '/var/lib/postgresql/data:rw,size=256m',
      '-e',
      `POSTGRES_USER=${owner}`,
      '-e',
      'POSTGRES_PASSWORD=isolated_fixture',
      '-e',
      `POSTGRES_DB=${database}`,
      'postgres:17-alpine',
    ]);
    created = true;
    validateTemporary(inspect(temporary), token, temporary);
    const ready = run([
      'exec',
      temporary,
      'sh',
      '-c',
      'for i in $(seq 1 80); do pg_isready -h 127.0.0.1 -U fixture_owner -d automation_process_fixture >/dev/null 2>&1 && exit 0; sleep 0.1; done; exit 1',
    ]);
    void ready;
    const sql = (input) =>
      run(
        [
          'exec',
          '-i',
          temporary,
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
        input,
      );
    assert.equal(sql('SELECT current_database(), current_user;'), `${database}|${owner}`);
    for (const migration of migrations)
      sql(readFileSync(`${migrationsPath}/${migration}/migration.sql`, 'utf8'));
    const marker = sql('SELECT version FROM "SchemaVersion" LIMIT 1;');
    assert.equal(marker, migrations.at(-1), '隔离结构版本与当前 migration head 不一致');
    const runtime = readFileSync(
      new URL('./automation-process-recovery.runtime.mjs', import.meta.url),
      'utf8',
    );
    const output = run(
      ['exec', '-i', server, 'node', '--input-type=module', '-e', runtime],
      JSON.stringify({
        databaseUrl: `postgresql://${owner}:isolated_fixture@${temporary}:5432/${database}`,
        token,
      }),
      60_000,
    );
    result = {
      checkedAt: new Date().toISOString(),
      project,
      server,
      image: target.Image,
      moduleHashes: hashes,
      migrations: migrations.length,
      migrationHead: migrations.at(-1),
      schemaMarker: marker,
      runtime: JSON.parse(output.split('\n').at(-1)),
      targetUnchanged: false,
      temporaryRemoved: false,
    };
  } finally {
    if (created) {
      validateTemporary(inspect(temporary), token, temporary);
      run(['rm', '-f', temporary]);
      if (result) result.temporaryRemoved = true;
    }
    const after = inspect(server);
    validateTarget(after, project);
    assert.deepEqual(stableTarget(after), before, '正常服务身份、启动时点或挂载发生变化');
    if (result) result.targetUnchanged = true;
  }
  if (options.output)
    writeFileSync(resolve(options.output), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
