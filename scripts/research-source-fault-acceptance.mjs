import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertSourceFaultIsolation } from './research-source-fault-runtime.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const serverName = 'thesis-ledger-dev-thesis-ledger-1';
const database = 'research_source_fault_fixture';
const runtimeFiles = [
  'research-source-fault-runtime.mjs',
  'research-source-fault-harness.mjs',
  'research-source-fault-relay.mjs',
  'research-source-fault-controlled.mjs',
];

export function sourceFaultOptions(args) {
  const options = { mode: 'controlled', execute: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--execute') options.execute = true;
    else if (['--mode', '--output', '--authorization'].includes(arg)) {
      assert(args[i + 1] && !args[i + 1].startsWith('--'), '参数缺少值');
      options[arg.slice(2)] = args[++i];
    } else throw new Error('只允许mode/output/authorization及execute参数');
  }
  assert(['controlled', 'live'].includes(options.mode));
  if (options.execute) {
    assert(options.output, '执行必须指定独立output目录');
    const directory = resolve(options.output);
    assert(
      directory.startsWith(resolve(root, '.recovery-artifacts') + sep),
      '输出必须属于恢复证据目录',
    );
    assert(!existsSync(directory), '输出目录已存在，不重放所属样本');
    if (options.mode === 'live') assert(options.authorization, '真实样本必须提供本次有效准入回执');
  }
  return options;
}

export async function runSourceFaultAcceptance(options) {
  if (!options.execute)
    return {
      mode: 'plan',
      requestedMode: options.mode,
      dockerMutations: 0,
      credentialReads: 0,
      externalSourceCalls: 0,
      realModelCalls: 0,
      liveMaxModelCalls: 1,
      feeCeiling: '0 USD',
      preparationDeadlineMs: 30000,
      sourceScope: '同花顺600519.SH单页10条',
    };
  const output = resolve(options.output);
  mkdirSync(output, { mode: 0o700 });
  const save = (name, value) =>
    writeFileSync(join(output, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  const run = (command, args, input, timeout = 60000) => {
    const result = spawnSync(command, args, {
      cwd: root,
      input,
      encoding: 'utf8',
      timeout,
      maxBuffer: 24 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      const detail = String(result.stderr ?? '')
        .replace(/POSTGRES_PASSWORD=\S+/g, 'POSTGRES_PASSWORD=[已脱敏]')
        .replace(/postgresql:\/\/\S+/g, '[隔离连接已脱敏]')
        .slice(-1200);
      throw new Error(
        `维护命令失败：${command} ${args.slice(0, 3).join(' ')}，状态${result.status ?? 'unknown'}：${detail}`,
      );
    }
    return result.stdout.trim();
  };
  const inspect = (name) =>
    JSON.parse(
      run('docker', [
        'inspect',
        '--format',
        '{"id":"{{.Id}}","image":"{{.Image}}","running":{{.State.Running}},"labels":{{json .Config.Labels}},"networks":{{json .NetworkSettings.Networks}}}',
        name,
      ]),
    );
  const nonce = randomBytes(4).toString('hex');
  const containerName = `ledger-research-source-fault-${nonce}`;
  const directory = `/tmp/thesis-ledger-research-source-fault-${nonce}`;
  const scope =
    options.mode === 'live'
      ? JSON.parse(readFileSync(resolve(options.authorization), 'utf8'))
      : { start: '2026-10-24', end: '2026-10-31' };
  const isolatedUrl = `postgresql://fixture_owner:${randomBytes(18).toString('hex')}@${containerName}:5432/${database}`;
  const packet = {
    mode: options.mode,
    appRoot: '/app/apps/server',
    containerName,
    isolatedUrl,
    scope,
    fixtures: {
      generation: JSON.parse(
        readFileSync(join(root, 'packages/schemas/fixtures/research-v2.samples.json')),
      ).generation,
      news: JSON.parse(
        readFileSync(join(root, 'packages/schemas/fixtures/news-search-v1.samples.json')),
      ).samples.find((sample) => sample.name === 'available').response,
    },
  };
  assertSourceFaultIsolation(packet);
  const target = inspect(serverName);
  assert.equal(target.running, true);
  assert.equal(target.labels['com.docker.compose.project'], 'thesis-ledger-dev');
  assert.equal(target.labels['com.docker.compose.service'], 'thesis-ledger');
  const network = Object.keys(target.networks).find((name) => name === 'thesis-ledger-dev_default');
  assert(network, '目标网络不符');
  const receipt = {
    startedAt: new Date().toISOString(),
    mode: options.mode,
    target: { id: target.id, image: target.image },
    containerName,
    directory,
    database,
    network,
    realModelCallLimit: options.mode === 'live' ? 1 : 0,
    feeCeiling: '0 USD',
    targetDefaultMayChange: false,
    completed: false,
    cleaned: false,
  };
  save('receipt.json', receipt);
  let started = false;
  let exported = false;
  try {
    run('docker', [
      'run',
      '--pull',
      'never',
      '-d',
      '--name',
      containerName,
      '--network',
      network,
      '--label',
      `thesis-ledger.source-fault-owner=${nonce}`,
      '--tmpfs',
      '/var/lib/postgresql/data',
      '-e',
      'POSTGRES_USER=fixture_owner',
      '-e',
      `POSTGRES_PASSWORD=${new URL(isolatedUrl).password}`,
      '-e',
      `POSTGRES_DB=${database}`,
      'postgres:17-alpine',
    ]);
    started = true;
    for (let attempt = 0; attempt < 40; attempt++) {
      const ready = spawnSync('docker', [
        'exec',
        containerName,
        'pg_isready',
        '-q',
        '-h',
        '127.0.0.1',
        '-U',
        'fixture_owner',
        '-d',
        database,
      ]);
      if (ready.status === 0) break;
      assert(attempt < 39, '隔离数据库未就绪');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const sql = (body) =>
      run(
        'docker',
        [
          'exec',
          '-i',
          containerName,
          'psql',
          '-XqAt',
          '-h',
          '127.0.0.1',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'fixture_owner',
          '-d',
          database,
          '-f',
          '-',
        ],
        body,
      );
    assert.equal(sql('SELECT current_database(), current_user;'), `${database}|fixture_owner`);
    const migrationRoot = join(root, 'apps/server/prisma/migrations');
    receipt.migrations = readdirSync(migrationRoot, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort();
    const hash = createHash('sha256');
    for (const name of receipt.migrations) {
      const text = readFileSync(join(migrationRoot, name, 'migration.sql'), 'utf8');
      hash.update(name).update(text);
      sql(text);
    }
    receipt.migrationInputSha256 = hash.digest('hex');
    const sources = Object.fromEntries(
      runtimeFiles.map((name) => [name, readFileSync(join(root, 'scripts', name), 'utf8')]),
    );
    receipt.runtimeSourceSha256 = Object.fromEntries(
      Object.entries(sources).map(([name, text]) => [
        name,
        createHash('sha256').update(text).digest('hex'),
      ]),
    );
    save('receipt.json', receipt);
    const bootstrap = `import{mkdirSync,writeFileSync}from'node:fs';import{pathToFileURL}from'node:url';
      const directory=${JSON.stringify(directory)};mkdirSync(directory,{mode:0o700});
      for(const[name,source]of Object.entries(${JSON.stringify(sources)}))writeFileSync(directory+'/'+name,source,{mode:0o600});
      try{const{runSourceFaultRuntime}=await import(pathToFileURL(directory+'/research-source-fault-runtime.mjs'));
      await runSourceFaultRuntime(${JSON.stringify(packet)},directory)}catch(error){process.stderr.write('所属隔离验收失败：'+error.name+'\\n');process.exitCode=1}`;
    const child = spawnSync('docker', ['exec', '-i', serverName, 'node', '--input-type=module'], {
      input: bootstrap,
      encoding: 'utf8',
      timeout: 900000,
      maxBuffer: 8 * 1024 * 1024,
    });
    writeFileSync(join(output, 'runtime.log'), child.stdout ?? '', { mode: 0o600 });
    writeFileSync(join(output, 'runtime-error.log'), child.stderr ?? '', { mode: 0o600 });
    receipt.runtimeExitCode = child.status;
    const proof = JSON.parse(run('docker', ['exec', serverName, 'cat', `${directory}/proof.json`]));
    save('proof.json', proof);
    exported = true;
    receipt.productionModulesMatchHost = Object.entries(proof.productionModules).every(
      ([name, hash]) =>
        createHash('sha256')
          .update(readFileSync(join(root, 'apps/server/dist/src', `${name}.js`)))
          .digest('hex') === hash,
    );
    receipt.status = proof.status;
    receipt.realModelCalls = proof.realModelCalls;
    assert.equal(child.status, 0, '隔离进程失败，保留已导出事实');
    assert.equal(proof.status, 'passed');
    assert.equal(receipt.productionModulesMatchHost, true, '目标业务模块与宿主产物不匹配');
    receipt.completed = true;
  } finally {
    if (
      started &&
      (exported || (!receipt.runtimeExitCode && !existsSync(join(output, 'runtime.log'))))
    ) {
      const owned = inspect(containerName);
      assert.equal(
        owned.labels['thesis-ledger.source-fault-owner'],
        nonce,
        '资源所有权不符，不清理',
      );
      run('docker', ['rm', '-f', containerName]);
      if (exported)
        run('docker', [
          'exec',
          serverName,
          'node',
          '-e',
          `require('node:fs').rmSync(${JSON.stringify(directory)},{recursive:true,force:true})`,
        ]);
      receipt.cleaned = true;
    }
    receipt.evidenceExported = exported;
    receipt.finishedAt = new Date().toISOString();
    save('receipt.json', receipt);
  }
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(
      JSON.stringify(await runSourceFaultAcceptance(sourceFaultOptions(process.argv.slice(2)))) +
        '\n',
    );
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}
