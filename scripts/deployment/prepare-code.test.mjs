import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const run = (mode, args, override = {}) => spawnSync('bash', [join(source, 'scripts/local-deployment.sh'), mode, ...args],
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
