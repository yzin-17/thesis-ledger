import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';

assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const [mode, directory, fingerprint, ...extra] = process.argv.slice(2);
assert(['tools', 'preflight', 'send'].includes(mode) && extra.length === 0);
const output = resolve(directory);
assert(output.startsWith(resolve(root, '.recovery-artifacts') + '/'));
if (mode === 'tools') mkdirSync(output, { mode: 0o700 });
if (mode === 'send') {
  assert(/^[a-f0-9]{64}$/.test(fingerprint ?? ''));
  const check = JSON.parse(readFileSync(resolve(output, 'preflight.json'), 'utf8'));
  assert.equal(check.fingerprint, fingerprint);
  assert.equal(check.status, 'passed');
  // 写入一次性凭据后才可能生成；同路径、任何失败均不得重发。
  writeFileSync(
    resolve(output, 'send-intent.json'),
    JSON.stringify({
      remainingCalls: 0,
      consumedBeforeDispatch: true,
      fingerprint,
      startedAt: new Date().toISOString(),
    }),
    { mode: 0o600, flag: 'wx' },
  );
}
const prior = JSON.parse(
  readFileSync(
    resolve(root, '.recovery-artifacts/arena-isolated-request-20261116-0051/receipt.json'),
    'utf8',
  ),
);
const bundle =
  mode === 'tools' ? null : JSON.parse(readFileSync(resolve(output, 'tools.json'), 'utf8')).bundle;
const runtime = new DsaRuntimeRecovery(
  resolve(root, '../thesis-ledger-infra'),
  resolve(root, '../thesis-ledger-infra/.env'),
);
const source = ['arena-isolated-request.mjs', 'arena-isolated-roundtrip.mjs']
  .map((name) => readFileSync(new URL(name, import.meta.url), 'utf8'))
  .join('\n');
const input = `${source}\nisolatedRequest(${JSON.stringify(mode)}, ${JSON.stringify(fingerprint ?? null)}, {
  prior: ${JSON.stringify(prior)}, bundle: ${JSON.stringify(bundle)},
  collect: collectIsolatedToolResults, validate: validateIsolatedDecision
}).then((value) => console.log(JSON.stringify(value))).catch((error) => {
  console.error(JSON.stringify({status:'failed',message:error.message.slice(0,500)}));process.exitCode=1;
});`;
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
  writeFileSync(resolve(output, `${mode}.json`), JSON.stringify(result, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
  console.log(
    JSON.stringify({
      status: result.status,
      mode,
      fingerprint: result.fingerprint,
      requestId: result.requestId,
      realModelCalls: result.realModelCalls,
      providerUnchanged: result.providerUnchanged,
      businessUnchanged: result.businessUnchanged,
      tools: result.bundle?.toolResults.map((r) => ({
        request: r.request,
        status: r.outcome.status,
        reason: r.outcome.reason,
      })),
      usage: result.result?.usage,
      completion: result.result?.completion,
      action: result.result?.output?.action,
      validation: result.validation,
      failure: result.failure,
    }),
  );
  if (result.status !== 'passed' || !result.providerUnchanged || !result.businessUnchanged)
    process.exitCode = 1;
} catch (error) {
  const failure = {
    status: 'execution_unknown',
    retryAllowed: false,
    message: error.message,
    detail: error.stderr?.slice(0, 1000),
  };
  writeFileSync(resolve(output, `${mode}-failure.json`), JSON.stringify(failure), {
    mode: 0o600,
    flag: 'wx',
  });
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
}
