import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [file, dsa, worker] = process.argv.slice(2);
assert(process.argv.length === 5 && [dsa, worker].every((image) => /^thesis-ledger-dev-state-recovery-[a-z-]+:[0-9a-f]{64}$/u.test(image)));
const plan = JSON.parse(readFileSync(file, 'utf8'));
const original = dirname(plan.sqliteSnapshot.path);
const manifest = JSON.parse(readFileSync(join(original, 'manifest.json'), 'utf8'));
assert.equal(manifest.target, plan.target);
assert.equal(manifest.sqliteDigest, plan.sqliteSnapshot.sha256);
const replay = readFileSync(new URL('./replay-named-v1-recovered-backtest.mjs', import.meta.url));
const run = (args, input) => execFileSync('docker', ['run', '--rm', '--pull', 'never', '--network', 'none',
  ...args], { input, encoding: 'utf8', timeout: 90_000, maxBuffer: 10 * 1024 * 1024 });
const live = JSON.parse(execFileSync('docker', ['exec', '-i', `${plan.target}-backtest-worker-1`,
  'node', '--input-type=module', '-', manifest.state.replay.id],
{ input: replay, encoding: 'utf8', timeout: 90_000, maxBuffer: 10 * 1024 * 1024 }));
const recovered = JSON.parse(run(['--read-only', '--user', '0:0', '-e', 'NODE_ENV=production', '--mount',
  `type=bind,source=${join(dirname(original), 'restored/backtest')},target=/app/var/backtest,readonly`,
  '--entrypoint', 'node', '-i', worker, '--input-type=module', '-',
  manifest.state.replay.id], replay));
assert(recovered.identicalReplay && recovered.replayCount === 2);
assert.deepEqual(recovered, live, '恢复镜像与原运行容器的历史回测结果不一致');
const dsaCheck = run(['--read-only', '--user', '0:0', '--mount',
  `type=bind,source=${plan.sqliteSnapshot.path},target=/tmp/restored.sqlite,readonly`,
  '--entrypoint', 'python', dsa, '-c',
  'import sqlite3; from api.thesis_ledger import router_v3; '
    + 'db = sqlite3.connect("file:/tmp/restored.sqlite?mode=ro&immutable=1",uri=True); '
    + 'assert db.execute("pragma integrity_check").fetchone()[0] == "ok"; '
    + 'assert len(router_v3.routes) > 0; print("verified")']);
assert.equal(dsaCheck.trim().split('\n').at(-1), 'verified');
console.log('源容器恢复镜像已通过无网络的 DSA SQLite 校验和 Worker 原结果重放。');
