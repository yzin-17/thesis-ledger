// 持锁维护容器复用现有镜像和网络；新构建产物只读挂载，不改现有容器文件。
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
const [mode, directory] = process.argv.slice(2);
assert(['plan', 'apply'].includes(mode));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), output = resolve(directory ?? '');
assert(output.startsWith(resolve(root, 'var/acceptance') + '/'));
mkdirSync(dirname(output), { recursive: true, mode: 0o700 }); mkdirSync(output, { mode: 0o700 });
const infra = resolve(root, '../thesis-ledger-infra'), runtime = new DsaRuntimeRecovery(infra, resolve(infra, '.env')).runtime;
const app = JSON.parse(runtime.dockerSync(['inspect', 'thesis-ledger-dev-thesis-ledger-1']));
assert.equal(app.length, 1);
const source = app[0], name = 'ledger-arena-route-upgrade-' + randomUUID().slice(0, 8);
const network = Object.keys(source.NetworkSettings.Networks).find(n => n.startsWith('thesis-ledger-dev'));
assert(network, '需要现有开发项目网络');
const environment = Object.fromEntries(source.Config.Env.map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }));
const keys = ['DATABASE_URL', 'CREDENTIAL_ENCRYPTION_KEY', 'CREDENTIAL_ENCRYPTION_KEY_VERSION', 'CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS'].filter(k => environment[k]);
assert(keys.includes('DATABASE_URL'));
const mounts = ['apps/server/dist', 'packages/schemas/dist', 'packages/domain/dist'].flatMap(path => ['--mount', `type=bind,source=${resolve(root, path)},target=/app/${path},readonly`]);
const packagePaths = JSON.parse(runtime.dockerSync(['exec', 'thesis-ledger-dev-thesis-ledger-1', 'node', '-e',
  "console.log(JSON.stringify(Object.fromEntries(['schemas','domain'].map(n=>[n,require('node:path').dirname(require.resolve('@thesis-ledger/'+n))]))))"]));
for (const [name, target] of Object.entries(packagePaths)) {
  assert(target.startsWith('/app/node_modules/'), '运行依赖必须属于应用目录');
  mounts.push('--mount', `type=bind,source=${resolve(root, 'packages', name, 'dist')},target=${target},readonly`);
}
const script = 'scripts/local-runtime/upgrade-arena-research-route.mjs';
try {
  await runtime.docker(['run', '--pull', 'never', '--name', name, '--network', network, '--user', '0', '--workdir', '/app',
    ...keys.flatMap(k => ['--env', k]), '--env', 'ARENA_ROUTE_UPGRADE_AUTHORIZED=1', ...mounts,
    '--mount', `type=bind,source=${resolve(root, script)},target=/app/${script},readonly`,
    '--mount', `type=bind,source=${output},target=/work/evidence`, '--entrypoint', 'node', source.Image, '/app/' + script, mode],
    { env: Object.fromEntries(keys.map(k => [k, environment[k]])), stream: true, timeout: 600000 });
} finally {
  const exists = runtime.dockerSync(['ps', '-aq', '--filter', 'name=^/' + name + '$']).trim();
  if (exists) await runtime.docker(['rm', '-f', name], { cleanup: true });
}
