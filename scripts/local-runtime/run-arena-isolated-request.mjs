import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';

assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const [mode, directory, fingerprint, ...extra] = process.argv.slice(2);
assert(['preflight', 'send'].includes(mode) && extra.length === 0);
assert(mode === 'preflight' || (directory && /^[a-f0-9]{64}$/.test(fingerprint ?? '')));
let output;
if (mode === 'send') {
  output = resolve(directory);
  assert(output.startsWith(resolve(root, '.recovery-artifacts') + '/'));
  mkdirSync(output, { mode: 0o700 }); // 已存在即拒绝，任何失败后均不能原路径重新派发。
  writeFileSync(
    resolve(output, 'intent.json'),
    JSON.stringify({
      mode,
      fingerprint,
      remainingCalls: 0,
      consumedBeforeDispatch: true,
      startedAt: new Date().toISOString(),
    }),
    { mode: 0o600, flag: 'wx' },
  );
}
const runtime = new DsaRuntimeRecovery(
  resolve(root, '../thesis-ledger-infra'),
  resolve(root, '../thesis-ledger-infra/.env'),
);
const source = readFileSync(new URL('./arena-isolated-request.mjs', import.meta.url), 'utf8');
const input = `${source}\nisolatedRequest(${JSON.stringify(mode)},${JSON.stringify(fingerprint ?? null)})
  .then((value) => console.log(JSON.stringify(value)))
  .catch((error) => { console.error(JSON.stringify({ status:'preflight_failed', message:error.message.slice(0,500) })); process.exitCode=1; });`;
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
    { input, timeout: 0 },
  );
  const result = JSON.parse(raw);
  if (output)
    writeFileSync(resolve(output, 'receipt.json'), JSON.stringify(result, null, 2), {
      mode: 0o600,
      flag: 'wx',
    });
  console.log(JSON.stringify(result));
  if (result.status !== 'passed') process.exitCode = 1;
} catch (error) {
  const failure = {
    status: 'execution_unknown',
    message: error.message,
    detail: error.stderr?.slice(0, 1000),
    retryAllowed: false,
  };
  if (output)
    writeFileSync(resolve(output, 'failure.json'), JSON.stringify(failure), {
      mode: 0o600,
      flag: 'wx',
    });
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
}
