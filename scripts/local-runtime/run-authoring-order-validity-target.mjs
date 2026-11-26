// 目标服务只消费冻结回执。独立临时 PostgreSQL 不发布端口，退出时按容器 ID 清理。
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';

assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
const root = fileURLToPath(new URL('../../', import.meta.url)),
  captures = join(root, 'var/acceptance');
const output = resolve(process.argv[2] ?? '');
assert(output.startsWith(captures + '/'));
mkdirSync(output, { mode: 0o700 });
const write = (file, value) =>
  writeFileSync(join(output, file), JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
const load = (file) => JSON.parse(readFileSync(file, 'utf8'));
const archive = join(captures, 'order-validity-pilot-live-20261119-133724');
const samples = [
  ['day', 'backtest-daily-orders-remaining20-20261118/schema-modification', 3],
  ['two-bars', 'whole-order-model-20261118/modify', 2],
].map(([id, source, n]) => {
  const op = load(join(captures, source, id + '-input.json')).operation;
  const actual = load(join(archive, id + '-response.json'));
  assert.equal(actual.finish, 'stop');
  const accepted = load(
    join(captures, 'order-validity-entry-20261119-wsCSi5/verified', id + '.json'),
  );
  const full = load(join(captures, source, 'wire-output-' + n + '-1.json'));
  assert.deepEqual(full.proposal.definition, accepted.configuration);
  const replay = load(join(archive, id + '-replay.json'));
  const dir = join(archive, id + '-snapshot');
  const manifest = load(join(dir, 'snapshots', replay.result.runId, 'finalized.json'));
  assert.equal(manifest.contentHash, accepted.snapshotId);
  assert.equal(replay.result.resultChecksum, accepted.resultChecksum);
  const files = [];
  for (const name of readdirSync(dir, { recursive: true })) {
    const path = join(dir, name),
      stat = lstatSync(path);
    assert(!stat.isSymbolicLink());
    if (stat.isFile())
      files.push({ path: relative(dir, path), base64: readFileSync(path).toString('base64') });
  }
  const wire = load(join(archive, id + '-request.json')).body;
  return {
    input: {
      id,
      op,
      wire,
      short: actual.text,
      full,
      differences: accepted.differences,
      definition: accepted.configuration,
      strategyHash: manifest.strategyVersionHash,
    },
    replay: {
      id,
      runId: manifest.runId,
      capture: relative(root, dir),
      files,
      result: replay.result,
      readback: replay.readback,
      capturedReadback: replay.readback,
    },
  };
});
const types = {
  server: [
    'strategy-authoring/authoring-order-validity',
    'strategy-authoring/authoring-submit.service',
    'strategy-authoring/authoring-modification',
    'strategy-authoring/authoring-proposal.service',
    'strategy-authoring/authoring-save.service',
    'strategy-authoring/authoring-operation-schema',
    'strategy-authoring/authoring-prompt',
    'ai/ai-native-strategy-schema',
    'backtest/backtest-v3-runner',
  ],
  schemas: ['strategy-authoring-modification', 'strategy-authoring-operation-schema'],
};
const hashes = Object.entries(types).flatMap(([area, names]) =>
  names.map((name) => {
    const path = name + '.js',
      base = area === 'server' ? 'apps/server/dist/src' : 'packages/schemas/dist';
    return {
      area,
      path,
      sha256: createHash('sha256')
        .update(readFileSync(join(root, base, path)))
        .digest('hex'),
    };
  }),
);
const infra = resolve(root, '../thesis-ledger-infra'),
  runtime = new DsaRuntimeRecovery(infra, join(infra, '.env')).runtime;
const services = {};
for (const service of ['thesis-ledger', 'backtest-worker']) {
  const [container] = JSON.parse(
    runtime.dockerSync(['inspect', 'thesis-ledger-dev-' + service + '-1']),
  );
  assert.equal(container.Config.Labels['com.docker.compose.project'], 'thesis-ledger-dev');
  assert.equal(container.Config.Labels['com.docker.compose.service'], service);
  assert.equal(container.State.Health?.Status, 'healthy');
  assert(container.NetworkSettings.Networks['thesis-ledger-dev_default']);
  services[service] = { id: container.Id, image: container.Image };
}
const name = 'validity-fixture-' + randomBytes(6).toString('hex');
const password = randomBytes(24).toString('hex');
const dbName = 'order_validity_fixture',
  owner = 'fixture_owner';
const databaseUrl = 'postgresql://' + owner + ':' + password + '@' + name + ':5432/' + dbName;
async function execute(service, code, fn, data, isolatedDb = false) {
  const args = ['exec', '-i', '-w', '/app'];
  if (isolatedDb) args.push('-e', 'DATABASE_URL');
  const input =
    code +
    '\nconsole.log("RECEIPT "+JSON.stringify(await ' +
    fn +
    '(' +
    JSON.stringify(data) +
    ')));';
  const raw = await runtime.docker([...args, services[service].id, 'node', '--input-type=module'], {
    env: isolatedDb ? { DATABASE_URL: databaseUrl } : {},
    input,
    timeout: 180000,
  });
  const line = raw.split('\n').findLast((line) => line.startsWith('RECEIPT '));
  assert(line, '目标进程未返回回执');
  return JSON.parse(line.slice(8));
}
let database;
try {
  database = runtime
    .dockerSync(
      [
        'run',
        '--pull',
        'never',
        '-d',
        '--name',
        name,
        '--network',
        'thesis-ledger-dev_default',
        '--tmpfs',
        '/var/lib/postgresql/data',
        '-e',
        'POSTGRES_PASSWORD',
        '-e',
        'POSTGRES_DB=' + dbName,
        '-e',
        'POSTGRES_USER=' + owner,
        'postgres:17-alpine',
      ],
      { env: { POSTGRES_PASSWORD: password } },
    )
    .trim();
  assert.match(database, /^[a-f0-9]{64}$/);
  const sql = (query) =>
    runtime
      .dockerSync(
        [
          'exec',
          '-i',
          database,
          'psql',
          '-XqAt',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          owner,
          '-d',
          dbName,
          '-f',
          '-',
        ],
        { input: query },
      )
      .trim();
  for (let i = 0; ; i++) {
    try {
      runtime.dockerSync([
        'exec',
        database,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        owner,
        '-d',
        dbName,
      ]);
      break;
    } catch (error) {
      if (i >= 40) throw error;
      await delay(250);
    }
  }
  assert.equal(sql('select current_database(),current_user;'), dbName + '|' + owner);
  const migrations = join(root, 'apps/server/prisma/migrations');
  for (const dir of readdirSync(migrations, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort())
    sql(readFileSync(join(migrations, dir, 'migration.sql'), 'utf8'));
  const authoring = readFileSync(
    new URL('./authoring-order-validity-target.mjs', import.meta.url),
    'utf8',
  );
  const saved = await execute(
    'thesis-ledger',
    authoring,
    'checkOrderValidityTarget',
    { samples: samples.map((s) => s.input), dbUrl: databaseUrl },
    true,
  );
  write('saved.json', saved);
  const replayCode = readFileSync(
    new URL('./backtest-trade-plan-runtime-check.mjs', import.meta.url),
    'utf8',
  ).replaceAll("from '../../apps/server/dist/", "from '/app/apps/server/dist/");
  const frozen = samples.map((s, i) => {
    assert.equal(saved[i].id, s.input.id);
    assert.equal(saved[i].strategyHash, s.input.strategyHash);
    assert.deepEqual(saved[i].configuration, s.input.definition);
    return { ...s.replay, configuration: saved[i].configuration };
  });
  const results = {};
  for (const service of Object.keys(services)) {
    results[service] = await execute(service, replayCode, 'checkTradePlanRuntime', {
      samples: frozen,
      hashes,
    });
    assert.equal(results[service].status, 'passed');
    write(service + '.json', results[service]);
  }
  const response = await fetch('http://127.0.0.1:3000/api/v1/ai/providers/lmstudio/readiness', {
    signal: AbortSignal.timeout(10000),
  });
  assert(response.ok);
  const route = (await response.json()).find(
    (r) =>
      r.contract.id === 'strategy_authoring_modification' &&
      r.contract.version === 'authoring-modification-v5',
  );
  assert.deepEqual(
    [route.mode, route.readiness.state, route.liveValidation.status],
    ['native_schema', 'ready', 'passed'],
  );
  write('passed.json', {
    services,
    hashes,
    route: {
      contract: route.contract,
      mode: route.mode,
      readiness: route.readiness.state,
      validation: route.liveValidation.status,
    },
    versions: saved.map((s) => s.versionId),
    checksums: frozen.map((s) => s.result.resultChecksum),
    modelCalls: 0,
  });
} catch (error) {
  // Node 在标准输入抛错时可能回显调用参数。隐藏本次临时库口令。
  write('failure.json', {
    message: error.message,
    stderr: String(error.stderr ?? '')
      .replaceAll(password, '[redacted]')
      .slice(-5000),
  });
  throw error;
} finally {
  if (database) {
    runtime.dockerSync(['rm', '-f', database]);
    write('cleanup.json', { removed: name });
  }
}
