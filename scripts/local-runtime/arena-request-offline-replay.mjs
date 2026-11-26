import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// 仅执行只读检查；不启动应用、队列或提供方，不落盘冻结业务输入。
const containers = {
  server: 'thesis-ledger-dev-thesis-ledger-1',
  worker: 'thesis-ledger-dev-backtest-worker-1',
};
const [target = 'server', ...extra] = process.argv.slice(2);
assert(Object.hasOwn(containers, target) && extra.length === 0, '用法：server|worker');
const source = readFileSync(
  new URL('./arena-request-offline-replay-checks.mjs', import.meta.url),
  'utf8',
);
const result = spawnSync(
  '/Users/yzin/.docker/bin/docker',
  ['exec', '-i', '-w', '/app/apps/server', containers[target], 'node', '--input-type=module'],
  {
    input: `${source}\nrunOfflineReplay().then((report) => console.log(JSON.stringify(report))).catch((error) => {
    console.error(JSON.stringify({ status: 'failed', name: error.name,
      code: error.fact?.code ?? error.code, message: error.message.slice(0, 1000) }));
    process.exitCode = 1;
  });\n`,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 60000,
  },
);
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
} else {
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'passed');
  console.log(JSON.stringify({ target, ...report }));
}
