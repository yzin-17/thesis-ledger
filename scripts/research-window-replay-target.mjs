import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// 只读目标快照并在原编译Runner中断网重放；脚本经stdin传入，无容器写入。
const [runId, checksum] = process.argv.slice(2);
const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
assert(runId && checksum && output, '需提供Run、已保存校验和及输出路径');
const helper = await readFile(
  new URL('./known-cash-frozen-comparison.mjs', import.meta.url),
  'utf8',
);
const helperUrl = `data:text/javascript;base64,${Buffer.from(helper).toString('base64')}`;
const source = (
  await readFile(new URL('./research-window-replay.mjs', import.meta.url), 'utf8')
).replaceAll("'./known-cash-frozen-comparison.mjs'", JSON.stringify(helperUrl));
const args = [
  'exec',
  '-i',
  '-w',
  '/app',
  'thesis-ledger-dev-backtest-worker-1',
  'node',
  '--input-type=module',
  '-',
  runId,
  checksum,
];
if (process.argv.includes('--cash-comparison')) args.push('--cash-comparison');
const result = spawnSync('docker', args, {
  input: source,
  encoding: 'utf8',
  timeout: 120000,
  maxBuffer: 50 * 1024 * 1024,
});
if (result.status !== 0) {
  console.error(
    result.stderr
      .split('\n')
      .filter((line) => /Error|Assertion|缺少|不一致|禁止|无效/.test(line))
      .map((line) => line.slice(0, 240))
      .join('\n'),
  );
}
assert.equal(result.status, 0, '目标只读重放未通过');
const capture = JSON.parse(result.stdout);
await writeFile(output, JSON.stringify(capture), { mode: 0o600 });
console.log(
  JSON.stringify({
    runId,
    resultChecksum: capture.resultChecksum,
    snapshotId: capture.snapshotId,
    networkCalls: capture.networkCalls,
    identicalReplay: capture.identicalReplay,
    comparison: capture.cashComparison?.status,
    output,
  }),
);
