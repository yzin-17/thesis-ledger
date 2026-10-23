import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { controlledHash, controlledFingerprint } from './ai-controlled-config-contract.mjs';
import { assertFundPrivatePath } from './fund-calibration-acceptance.mjs';
import { assertFundCalibrationPlan, assertFundCaseLedger } from './fund-calibration-guards.mjs';
import {
  readFundTarget,
  runFundOwned,
  verifyFundProtection,
  fundTargetApi,
  fundProviderState,
} from './fund-calibration-target.mjs';
import { fundPolicyFingerprint } from './fund-nav-route-case.mjs';
import {
  readAutomationConsumer,
  verifyAutomationConsumer,
} from './automation-market-consumer-contract.mjs';

const args = process.argv.slice(2);
assert.equal(args.length, 2);
const read = (path) => {
  assertFundPrivatePath(resolve(path), true);
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
};
const record = read(args[0]),
  web = read(args[1]);
const plan = record.plan;
assertFundCalibrationPlan(plan);
const { fingerprint, ...source } = plan;
assert.equal(fingerprint, controlledFingerprint(source));
for (const [path, hash] of Object.entries(plan.inputHashes)) {
  assert.match(path, /^[a-z0-9-]+\.(mjs|cjs)$/);
  assert.equal(controlledHash(readFileSync(new URL(path, import.meta.url))), hash);
}
assert.equal(record.phase, 'awaiting-web');
assert.equal(record.acceptance.passed, true);
assert.equal(record.settled, true);
assert.equal(web.caseId, plan.caseId);
assert.equal(web.accountId, record.account.id);
assert.equal(web.runId, record.acceptance.runId);
assert.equal(web.mode, 'shadow');
assert.equal(web.historyObserved, true);
assert.equal(web.originalPageRestored, true);
for (const [pathKey, hashKey] of [
  ['screenshot', 'screenshotSha256'],
  ['ax', 'axSha256'],
]) {
  assertFundPrivatePath(web[pathKey], true);
  assert.equal(controlledHash(readFileSync(web[pathKey])), web[hashKey]);
}
const ax = readFileSync(web.ax, 'utf8');
assert(ax.includes('扫描 1 个槽位，正式化 1 个，待补齐 0 个'));
assert(ax.includes('2026/10/21 06:59:49'));
const owned = runFundOwned('inspect', record);
assert.equal(owned.account.active, false);
assert.equal(owned.quantity, 0);
assert.equal(owned.cashValue, 0);
assert.equal(owned.events.length, 4);
assertFundCaseLedger(owned.events, plan);
const automation = readAutomationConsumer(record.account.id);
const acceptance = verifyAutomationConsumer(plan.automation, record.prepared, automation, record);
const protectedAfter = readFundTarget(record.account.id);
const protection = verifyFundProtection(plan, protectedAfter, false);
const api = fundTargetApi();
const policy = await api.get('/api/market-data/policy');
assert.equal(policy.revision, record.restored.revision);
assert.equal(policy.dsaRevision, policy.revision);
assert.equal(policy.syncState, 'applied');
assert.equal(policy.effectiveStale, false);
assert.equal(fundPolicyFingerprint(policy), plan.routePlan.baselineFingerprint);
assert.deepEqual(
  fundProviderState((await api.get('/api/market-data/providers')).providers),
  plan.providerState,
);
const targetAfter = readFundTarget();
console.log(
  JSON.stringify(
    {
      phase: 'passed',
      planFingerprint: plan.fingerprint,
      recordSha256: controlledHash(readFileSync(resolve(args[0]))),
      caseId: plan.caseId,
      accountId: record.account.id,
      accountInactiveAndSettled: true,
      acceptance,
      protection,
      policy: {
        revision: policy.revision,
        routeCount: policy.routes.length,
        originalFingerprint: fundPolicyFingerprint(policy),
      },
      web,
      targetAfter,
      protectedAfter,
      realModelRequests: 0,
    },
    null,
    2,
  ),
);
