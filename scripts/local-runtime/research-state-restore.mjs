import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkOutputDirectory, docker } from './research-state-backup.mjs';

export function restoreArchives(bundle, directory) {
  const result = spawnSync('python3', [fileURLToPath(new URL('./research-state-archive.py', import.meta.url)),
    resolve(bundle), resolve(directory), fileURLToPath(new URL('../../../daily-stock-analysis/scripts/deployment/restore-sqlite.py', import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, '归档/SQLite恢复失败');
}

export function isolatedPostgresArgs(image, owner) {
  assert(/^sha256:[a-f0-9]{64}$/.test(image)); assert(/^[a-f0-9-]{36}$/.test(owner));
  return ['run', '--detach', '--name', `f01-restore-${owner}`, '--label', `io.thesisledger.f01=${owner}`,
    '--network', 'none', '-e', 'POSTGRES_DB=restore_db', '-e', 'POSTGRES_USER=restore_owner',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image];
}
export function assertOwnedRestore(container, owner) {
  assert(/^[a-f0-9-]{36}$/.test(owner));
  assert.equal(container.Name, `/f01-restore-${owner}`);
  assert.equal(container.Config.Labels?.['io.thesisledger.f01'], owner);
}
export function cleanupRetained(path) {
  const absolute = resolve(path), directory = dirname(absolute);
  const receiptStat = lstatSync(absolute);
  assert(receiptStat.isFile() && !receiptStat.isSymbolicLink() && (receiptStat.mode & 0o077) === 0);
  const receipt = JSON.parse(readFileSync(absolute, 'utf8'));
  assert.equal(receipt.format, 'thesis-ledger-restored-copy-v1');
  assert.equal(receipt.directory, directory);
  assert.equal(basename(directory), `restored-${receipt.owner}`);
  const directoryStat = lstatSync(directory);
  assert(directoryStat.isDirectory() && !directoryStat.isSymbolicLink() && (directoryStat.mode & 0o077) === 0);
  // 借用备份目录边界检查；已有目录先在独立名称上验证其私有根。
  checkOutputDirectory(resolve(directory, `cleanup-check-${randomUUID()}`));
  const value = JSON.parse(docker(['inspect', receipt.containerName]).toString())[0];
  assertOwnedRestore(value, receipt.owner);
  assert.equal(value.Id, receipt.containerId);
  docker(['rm', '-f', '-v', value.Id]);
  rmSync(directory, { recursive: true });
  return { cleanedDirectory: directory, cleanedContainer: receipt.containerName };
}

