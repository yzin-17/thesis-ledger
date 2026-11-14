import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function verifyAbandonedBacktestResource(name, resource, isAlive) {
  const match = /^tl-nav-(n2-6|n3-redis)-(\d+)-([a-f0-9]{8})$/.exec(name);
  assert(match, '仅支持回测测试宿主生成的名称');
  assert(!isAlive(Number(match[2])), '所属测试进程仍在运行，拒绝清理');
  const label = match[1] === 'n2-6' ? 'thesis-ledger.n2-6' : 'thesis-ledger.n3-nav-worker-redis';
  const nonce = resource.Config?.Labels?.[label];
  assert(
    typeof nonce === 'string' && /^[a-f0-9-]{36}$/.test(nonce) && nonce.startsWith(match[3]),
    '隔离测试所有权不匹配',
  );
  assert(resource.Name === `/${name}`, '实际容器名称不匹配');
  assert(
    resource.Mounts.every((mount) => mount.Type === 'tmpfs'),
    '存在持久化挂载，拒绝清理',
  );
  assert(!resource.HostConfig?.NetworkMode?.startsWith('container:'), '禁止共享其他容器网络');
  return resource.Id;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [confirmation, ...names] = process.argv.slice(2);
  assert.equal(confirmation, '--confirm-abandoned-isolated-tests');
  assert(names.length > 0, '必须明确指定容器名称');
  const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000 });
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') return false;
      throw error;
    }
  };
  const resources = names.map((name) => {
    const [resource] = JSON.parse(docker(['inspect', name]));
    return { name, id: verifyAbandonedBacktestResource(name, resource, alive) };
  });
  for (const { name, id } of resources) {
    docker(['rm', '--force', id]);
    console.log(`已清理隔离测试容器 ${name}`);
  }
}
