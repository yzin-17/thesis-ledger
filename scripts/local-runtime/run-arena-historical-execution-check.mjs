import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
import { acceptedDecision } from './arena-historical-execution-check.mjs';

assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
assert(
  process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === '--periods'),
  '用法：<新的私有回执目录> [--periods]',
);
const output = resolve(process.argv[2]);
assert(output.startsWith(resolve(root, '.recovery-artifacts') + '/'));
const priorRoot = resolve(root, '.recovery-artifacts/arena-isolated-roundtrip-20261116-once');
const receipt = JSON.parse(readFileSync(resolve(priorRoot, 'send.json'), 'utf8'));
acceptedDecision(receipt);
const requests = JSON.parse(
  readFileSync(resolve(priorRoot, 'tools.json'), 'utf8'),
).bundle.toolResults.map((x) => x.request);
if (process.argv[3] === '--periods') {
  const original = requests.find((x) => x.name === 'bars');
  assert.equal(original?.symbol, '588000.SH');
  requests.push(...['15m', '60m'].map((timeframe) => ({ ...original, timeframe })));
}
mkdirSync(output, { mode: 0o700 });
const runtime = new DsaRuntimeRecovery(
  resolve(root, '../thesis-ledger-infra'),
  resolve(root, '../thesis-ledger-infra/.env'),
);
const source = ['arena-historical-execution-check.mjs', 'arena-isolated-roundtrip.mjs']
  .map((p) => readFileSync(new URL(p, import.meta.url), 'utf8'))
  .join('\n');
const input = `${source}\ncheckHistoricalExecution(${JSON.stringify(receipt)}, ${JSON.stringify(requests)})
  .then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});`;
try {
  const raw = await runtime.runtime.docker(
    [
      'exec',
      '-i',
      '-w',
      '/app/apps/server',
      'thesis-ledger-dev-thesis-ledger-1',
      'node',
      '--input-type=module',
    ],
    { input, timeout: 120000 },
  );
  const result = JSON.parse(raw);
  writeFileSync(resolve(output, 'receipt.json'), JSON.stringify(result, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
  console.log(
    JSON.stringify({
      status: result.status,
      asOf: result.asOf,
      realModelCalls: result.realModelCalls,
      businessUnchanged: result.businessUnchanged,
      providerUnchanged: result.providerUnchanged,
      tools: result.tools.map((x) => ({
        request: x.request,
        status: x.outcome.status,
        reason: x.outcome.reason,
      })),
      validation: result.validation,
      receipt: resolve(output, 'receipt.json'),
    }),
  );
  if (result.status !== 'passed') process.exitCode = 2;
} catch (error) {
  writeFileSync(
    resolve(output, 'failure.json'),
    JSON.stringify({ status: 'failed', message: error.message, realModelCalls: 0 }),
    { mode: 0o600, flag: 'wx' },
  );
  throw error;
}
