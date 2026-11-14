import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    output: { type: 'string' },
    'run-id': { type: 'string' },
    'prepared-report': { type: 'string' },
    'frozen-input': { type: 'boolean', default: false },
    'status-source-error': { type: 'boolean', default: false },
  },
});
const output = values.output,
  runId = values['run-id'];
assert(!runId || /^[0-9a-f-]{36}$/.test(runId), '任务参数无效');
assert(
  !values['frozen-input'] || (runId && !values['prepared-report']),
  '冻结输入核验须指定任务且不能提供准备报告',
);
assert(
  !values['status-source-error'] || values['frozen-input'],
  '状态来源错误注入仅允许冻结输入核验',
);
let prepared;
if (values['prepared-report']) {
  assert(runId, '复用报告必须同时指定原任务');
  const report = JSON.parse(readFileSync(values['prepared-report'], 'utf8'));
  assert.equal(report.businessStateUnchanged, true);
  prepared = report.cases.find(
    (item) => item.originalRunId === runId && item.status === 'prepared',
  );
  assert(prepared, '报告没有该任务已准备的冻结输入');
}
assert(
  output && resolve(output) === output && !existsSync(output),
  '报告必须使用尚不存在的绝对路径',
);
const name = 'thesis-ledger-dev-thesis-ledger-1';
const [container] = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }));
assert.equal(container.Config.Labels['com.docker.compose.project'], 'thesis-ledger-dev');
assert.equal(container.Config.Labels['com.docker.compose.service'], 'thesis-ledger');
assert.equal(container.State.Health?.Status, 'healthy');
const programPath = runId
  ? './verify-price-research-run-program.mjs'
  : './verify-price-research-live-program.mjs';
const program = readFileSync(new URL(programPath, import.meta.url), 'utf8');
let stdout;
try {
  stdout = execFileSync(
    'docker',
    [
      'exec',
      '-i',
      ...(runId ? ['-e', `PRICE_RESEARCH_RUN_ID=${runId}`] : []),
      ...(values['frozen-input'] ? ['-e', 'PRICE_RESEARCH_FROZEN_INPUT=1'] : []),
      ...(values['status-source-error'] ? ['-e', 'PRICE_RESEARCH_STATUS_SOURCE_ERROR=1'] : []),
      ...(prepared
        ? [
            '-e',
            `PRICE_RESEARCH_PREPARED=${JSON.stringify({
              originalRunId: prepared.originalRunId,
              strategyVersionId: prepared.strategyVersionId,
              strategyHash: prepared.strategyHash,
              preparation: prepared.preparation,
            })}`,
          ]
        : []),
      container.Id,
      'node',
      '--input-type=module',
    ],
    {
      input: program,
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
} catch (error) {
  stdout = String(error.stdout ?? '');
  if (!stdout.includes('PRICE_RESEARCH_LIVE_RECEIPT=')) throw error;
}
const line = stdout.split('\n').find((value) => value.startsWith('PRICE_RESEARCH_LIVE_RECEIPT='));
assert(line, '核验未返回报告');
const receipt = JSON.parse(line.slice('PRICE_RESEARCH_LIVE_RECEIPT='.length));
writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
console.log(
  JSON.stringify({
    report: output,
    policyRevision: receipt.policyRevision,
    businessStateUnchanged: receipt.businessStateUnchanged,
    cases: receipt.cases.map(
      ({
        symbol,
        startDate,
        endDate,
        status,
        result,
        error,
        reads,
        injectedStatusErrors,
        statusComposition,
      }) => ({
        symbol,
        startDate,
        endDate,
        status,
        result,
        error,
        reads,
        injectedStatusErrors,
        statusComposition,
      }),
    ),
  }),
);
if (!receipt.businessStateUnchanged || receipt.cases.some((item) => item.status !== 'prepared'))
  process.exitCode = 1;
