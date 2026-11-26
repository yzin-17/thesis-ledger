import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scripts = dirname(fileURLToPath(import.meta.url));
const docker = `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),a=process.argv.slice(2),image=process.env.TEST_IMAGE;
if(a[0]==='exec'){
 const name=a.at(-1).split('/').at(-1);
 process.stdout.write('/app/node_modules/.pnpm/'+name+'/node_modules/@thesis-ledger/'+name);
}else if(a[0]==='cp'){
 const src=a[1].split(':')[1];let input;
 if(src==='/app/package.json') input='apps/server/package.json';
 else if(src==='/app/prisma/.') input='apps/server/prisma';
 else input='packages/'+src.split('/').at(-2)+'/package.json';
 fs.cpSync(path.join(image,input),a[2],{recursive:true});
}else process.exit(99);
`;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'main-deployment-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source'), image = join(root, 'image'), work = join(root, 'work');
  mkdirSync(join(source, 'scripts/deployment'), { recursive: true });
  mkdirSync(work); mkdirSync(join(root, 'bin'));
  cpSync(join(scripts, '../local-deployment.sh'), join(source, 'scripts/local-deployment.sh'));
  cpSync(join(scripts, 'prepare-code.sh'), join(source, 'scripts/deployment/prepare-code.sh'));
  cpSync(join(scripts, 'match-pnpm-server-manifest.mjs'), join(source, 'scripts/deployment/match-pnpm-server-manifest.mjs'));
  const inputs = ['apps/server/package.json', 'apps/server/prisma/schema.prisma',
    'apps/server/prisma/migrations/current/migration.sql', 'apps/server/prisma/raw-owned-tables.json',
    ...['domain', 'schemas', 'shared'].map(p => `packages/${p}/package.json`)];
  for (const path of inputs) {
    mkdirSync(dirname(join(source, path)), { recursive: true });
    writeFileSync(join(source, path), 'controlled-original');
  }
  cpSync(source, image, { recursive: true });
  for (const path of ['apps/server/dist/src/main.js', 'apps/server/dist/src/backtest/backtest-worker.main.js',
    ...['domain', 'schemas', 'shared'].map(p => `packages/${p}/dist/index.js`)]) {
    mkdirSync(dirname(join(source, path)), { recursive: true });
    writeFileSync(join(source, path), path);
  }
  writeFileSync(join(root, 'bin/docker'), docker, { mode: 0o755 });
  writeFileSync(join(root, 'bin/pnpm'), '#!/bin/sh\nexit "${BUILD_FAIL:-0}"\n', { mode: 0o755 });
  const env = { ...process.env, TEST_IMAGE: image, PATH: join(root, 'bin') + ':' + process.env.PATH };
  const run = (mode, args, override = {}, mask = '022') => spawnSync('bash',
    ['-c', 'umask "$1"; shift; exec bash "$@"', 'fixture', mask, join(source, 'scripts/local-deployment.sh'), mode, ...args],
    { env: { ...env, ...override }, encoding: 'utf8' });
  return { root, source, image, work, inputs, run };
}

test('主仓兼容预检通过相同依赖和完整结构，拒绝各项漂移', t => {
  const f = fixture(t);
  let result = f.run('sync-preflight', ['controlled-container', f.work]);
  assert.equal(result.status, 0, result.stderr);
  for (const input of f.inputs) {
    writeFileSync(join(f.source, input), 'changed');
    result = f.run('sync-preflight', ['controlled-container', f.work]);
    assert.notEqual(result.status, 0, input);
    writeFileSync(join(f.source, input), 'controlled-original');
  }
});

test('Server 快更仅接受镜像打包生成的四个 injected 标记', t => {
  const f = fixture(t);
  const manifest = {
    name: '@thesis-ledger/server',
    dependencies: {
      '@thesis-ledger/domain': 'workspace:*',
      '@thesis-ledger/schemas': 'workspace:*',
      '@thesis-ledger/shared': 'workspace:*',
      yaml: '2.9.0',
    },
    devDependencies: { '@thesis-ledger/api-client': 'workspace:*' },
  };
  const runtime = {
    ...manifest,
    dependenciesMeta: Object.fromEntries(['domain', 'schemas', 'shared', 'api-client']
      .map(name => [`@thesis-ledger/${name}`, { injected: true }])),
  };
  const sourceFile = join(f.source, 'apps/server/package.json');
  const runtimeFile = join(f.image, 'apps/server/package.json');
  const preflight = () => f.run('sync-preflight', ['controlled-container', f.work]);
  writeFileSync(sourceFile, JSON.stringify(manifest));
  writeFileSync(runtimeFile, JSON.stringify(runtime, null, 2));
  const result = preflight();
  assert.equal(result.status, 0, result.stderr);

  for (const [label, change] of [
    ['镜像缺少 yaml', m => delete m.dependencies.yaml],
    ['yaml 版本不同', m => { m.dependencies.yaml = '2.8.0'; }],
    ['增加运行依赖', m => { m.dependencies.newPackage = '1.0.0'; }],
    ['workspace 协议变化', m => { m.devDependencies['@thesis-ledger/api-client'] = '1.0.0'; }],
    ['缺少已知标记', m => delete m.dependenciesMeta['@thesis-ledger/domain']],
    ['新增注入标记', m => { m.dependenciesMeta.yaml = { injected: true }; }],
    ['标记值不同', m => { m.dependenciesMeta['@thesis-ledger/domain'].injected = false; }],
    ['额外元数据', m => { m.dependenciesMeta['@thesis-ledger/shared'].extra = true; }],
    ['其他顶层字段变化', m => { m.type = 'commonjs'; }],
  ]) {
    const changed = structuredClone(runtime);
    change(changed);
    writeFileSync(runtimeFile, JSON.stringify(changed));
    assert.equal(preflight().status, 1, label);
  }
  writeFileSync(runtimeFile, JSON.stringify(runtime));
  writeFileSync(sourceFile, JSON.stringify({ ...manifest, dependenciesMeta: {} }));
  assert.equal(preflight().status, 1, '源码显式声明的元数据必须匹配');
  writeFileSync(sourceFile, JSON.stringify(runtime));
  writeFileSync(runtimeFile, JSON.stringify(manifest));
  assert.equal(preflight().status, 1, '镜像缺少源码声明的元数据');

  const regularDependency = structuredClone(manifest);
  regularDependency.dependencies['@thesis-ledger/domain'] = '1.0.0';
  writeFileSync(sourceFile, JSON.stringify(regularDependency));
  writeFileSync(runtimeFile, JSON.stringify({ ...regularDependency, dependenciesMeta: runtime.dependenciesMeta }));
  assert.equal(preflight().status, 1, '普通版本依赖不能使用 workspace 打包例外');
});

test('主仓载荷包含全部消费者入口与 workspace 产物，失败和重复目录拒绝', t => {
  const f = fixture(t), payload = join(f.root, 'payload');
  let result = f.run('sync-payload', [payload]);
  assert.equal(result.status, 0, result.stderr);
  assert(existsSync(join(payload, 'server-dist/src/backtest/backtest-worker.main.js')));
  assert.equal(readFileSync(join(payload, 'domain-dist/index.js'), 'utf8'), 'packages/domain/dist/index.js');
  assert.notEqual(f.run('sync-payload', [payload]).status, 0);
  result = f.run('sync-payload', [join(f.root, 'failed')], { BUILD_FAIL: '17' });
  assert.notEqual(result.status, 0);
  assert(!existsSync(join(f.root, 'failed')));
  rmSync(join(f.source, 'apps/server/dist/src/backtest/backtest-worker.main.js'));
  assert.notEqual(f.run('sync-payload', [join(f.root, 'missing')]).status, 0);
});

test('私有宿主掩码及编译权限不妨碍非 root 读取两个入口和 workspace', t => {
  const { root, source, run } = fixture(t);
  const payload = join(root, 'private-payload');
  chmodSync(join(source, 'apps/server/dist/src'), 0o700);
  chmodSync(join(source, 'apps/server/dist/src/main.js'), 0o600);
  chmodSync(join(source, 'packages/domain/dist/index.js'), 0o600);
  const result = run('sync-payload', [payload], {}, '077');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(statSync(payload).mode & 0o777, 0o700);
  for (const file of [
    'server-dist/src/main.js', 'server-dist/src/backtest/backtest-worker.main.js',
    ...['domain', 'schemas', 'shared'].map((name) => name + '-dist/index.js'),
  ]) {
    let path = join(payload, file);
    assert.equal(statSync(path).mode & 0o044, 0o044, file);
    for (path = dirname(path); path !== payload; path = dirname(path))
      assert.equal(statSync(path).mode & 0o055, 0o055, path);
  }
});
