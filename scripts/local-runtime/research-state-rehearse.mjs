import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkOutputDirectory, docker, protectionSql, sql, target, verifyBundle } from './research-state-backup.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../thesis-ledger-infra');
import { isolatedPostgresArgs, restoreArchives, assertOwnedRestore, cleanupRetained } from './research-state-restore.mjs';
export { isolatedPostgresArgs, restoreArchives, assertOwnedRestore, cleanupRetained };

export async function rehearse(bundle, requestedRuns, retainedOutput) {
  const manifest = await verifyBundle(bundle);
  assert(requestedRuns.length > 0 && requestedRuns.length <= 5, '选择1～5条代表性任务');
  const runs = requestedRuns.map(id => {
    assert(/^[a-f0-9-]{36}$/.test(id));
    const run = manifest.state.runs.find(item => item.id === id);
    assert(run && /^[a-f0-9]{16}$/.test(run.checksum), '任务不在该备份的成功V3清单');
    return run;
  });
  assert.equal(new Set(requestedRuns).size, requestedRuns.length);
  const source = `${target}-postgres-1`;
  const protectedState = sql(source, protectionSql);
  const owner = randomUUID(), containerName = `f01-restore-${owner}`;
  let directory;
  if (retainedOutput) {
    checkOutputDirectory(retainedOutput);
    mkdirSync(retainedOutput, { mode: 0o700 });
    directory = resolve(retainedOutput, `restored-${owner}`); mkdirSync(directory, { mode: 0o700 });
  } else directory = mkdtempSync(resolve(tmpdir(), 'thesis-ledger-f01-'));
  const replays = [];
  let restored, cleanupError, completed = false;
  try {
    restoreArchives(bundle, directory);
    docker(isolatedPostgresArgs(manifest.images.postgres, owner));
    let ready = false;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      try { docker(['exec', containerName, 'pg_isready', '-U', 'restore_owner', '-d', 'restore_db'], { timeout: 5000 }); ready = true; break; }
      catch { /* 隔离数据库未就绪时继续有限等待。 */ }
      await new Promise(done => setTimeout(done, 2000));
    }
    assert(ready, '隔离PostgreSQL未就绪');
    try { docker(['exec', '-i', containerName, 'pg_restore', '--exit-on-error', '--single-transaction',
      '--no-owner', '--no-acl', '-U', 'restore_owner', '-d', 'restore_db'],
    { input: readFileSync(resolve(bundle, 'postgres.dump')), maxBuffer: 16 * 1024 * 1024 }); }
    catch { throw new Error('隔离数据库恢复失败'); }
    restored = sql(containerName, protectionSql, 'restore_db');
    assert.equal(restored.head, manifest.state.head);
    assert.deepEqual(restored.tables, manifest.state.tables);
    assert.deepEqual(restored.runs, manifest.state.runs);
    assert.equal(restored.activeBacktests, 0);
    const program = readFileSync(resolve(root, '../thesis-ledger/scripts/research-window-replay.mjs'));
    for (const run of runs) {
      const args = ['run', '--rm', '--label', `io.thesisledger.f01=${owner}`, '--network', 'none', '--read-only',
        '--user', `${process.getuid()}:${process.getgid()}`, '--mount', `type=bind,source=${resolve(directory, 'backtest')},target=/app/var/backtest,readonly`,
        '--entrypoint', 'node', '-i', manifest.images.worker, '--input-type=module', '-', run.id, run.checksum];
      let replay;
      try { replay = docker(args, { input: program, maxBuffer: 128 * 1024 * 1024 }); }
      catch (error) {
        const diagnostic = (error.stderr ?? '').toString().split('\n').filter(line =>
          /Error:|ERR_|ENOENT|EACCES|cannot find|Cannot find|Permission denied/.test(line)).slice(0, 5).join('\n');
        throw new Error(`隔离镜像重放失败，任务${run.id}：${diagnostic}`);
      }
      const result = JSON.parse(replay.toString());
      assert(result.identicalReplay && result.replayCount === 2 && result.networkCalls === 0);
      assert.equal(result.resultChecksum, run.checksum);
      replays.push({ id: run.id, checksum: result.resultChecksum, replayCount: 2, networkCalls: 0 });
    }
    assert.deepEqual(sql(source, protectionSql), protectedState, '源业务状态变化');
    if (retainedOutput) {
      const value = JSON.parse(docker(['inspect', containerName]).toString())[0];
      assertOwnedRestore(value, owner);
      writeFileSync(resolve(directory, 'restore-receipt.json'), JSON.stringify({ format: 'thesis-ledger-restored-copy-v1',
        owner, containerName, containerId: value.Id, directory, bundle: resolve(bundle), images: manifest.images }, null, 2),
      { mode: 0o600, flag: 'wx' });
    }
    completed = true;
  } finally {
    let found;
    try { found = docker(['inspect', containerName]); } catch { /* 尚未创建隔离容器。 */ }
    if (found && (!retainedOutput || !completed)) {
      const value = JSON.parse(found.toString())[0];
      if (value.Config.Labels?.['io.thesisledger.f01'] === owner && value.Name === `/${containerName}`) {
        try { docker(['rm', '-f', '-v', value.Id]); } catch { cleanupError = '隔离容器清理失败'; }
      } else cleanupError = '所有权不符，保留容器，不删除';
    }
    if (!retainedOutput || !completed) rmSync(directory, { recursive: true, force: true });
    assert.deepEqual(sql(source, protectionSql), protectedState, '源业务状态变化');
    assert(!cleanupError, cleanupError);
  }
  return { bundle: resolve(bundle), restoredHead: restored.head, tableFingerprintsMatch: true,
    sqliteIntegrity: 'ok', replays, sourceUnchanged: true, isolatedResourcesCleaned: !retainedOutput,
    ...(retainedOutput ? { retainedDirectory: directory, retainedContainer: containerName,
      cleanupReceipt: resolve(directory, 'restore-receipt.json') } : {}) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [flag, bundle, confirmation, ...flags] = process.argv.slice(2);
  if (flag === '--cleanup-receipt') {
    assert.equal(confirmation, '--confirm-isolated'); assert.equal(flags.length, 0);
    console.log(JSON.stringify(cleanupRetained(bundle)));
  } else {
    assert.equal(flag, '--bundle'); assert.equal(confirmation, '--confirm-isolated');
    assert(flags.every(flag => flag.startsWith('--run=') || flag.startsWith('--retain-output=')));
    const outputs = flags.filter(flag => flag.startsWith('--retain-output=')); assert(outputs.length <= 1);
    const result = await rehearse(bundle, flags.filter(flag => flag.startsWith('--run=')).map(flag => flag.slice(6)),
      outputs[0]?.slice('--retain-output='.length));
    console.log(JSON.stringify(result));
  }
}
