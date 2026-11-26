import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
import { acceptedDecision, allowHistoricalFetch } from './arena-historical-execution-check.mjs';
import { isolatedHistoricalTools } from './arena-isolated-roundtrip.mjs';
import { driveFrozenDecision, runIsolatedBusiness } from './arena-isolated-business.mjs';
import { partitionValuations, inspectServer } from './run-arena-execution-admission.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha = raw => createHash('sha256').update(raw).digest('hex');
const run = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', timeout: 180_000, maxBuffer: 8_000_000 }).trim();

async function acceptBusiness(receipt, ownerToken) {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  const originalFetch = globalThis.fetch;
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const cutoff = new Date().toISOString();
  const before = await inspectServer(ownerToken, false, cutoff);
  const calls = [];
  try {
    const input = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [cycle] = await tx.$queryRawUnsafe(`SELECT input FROM "ArenaLiveCycle"
        WHERE id='7e155817-ccfc-45bc-b812-01d9b8906beb'::uuid`);
      return cycle.input;
    });
    assert.equal(digest(input), '1f8fd6a6dd243bba2c19e5cae1452e06a4f7eb1697c5e8d124472b39ef670d25');
    assert.equal(input.asOf, receipt.asOf);
    const entrant = input.protocol.entrants.find(item => item.providerId === receipt.binding.providerId);
    assert.equal(entrant?.model, receipt.binding.model);
    const { loadConfig } = await import('./dist/src/platform/config.js');
    const origin = new URL(loadConfig().dsaBaseUrl).origin;
    globalThis.fetch = async (url, init) => {
      allowHistoricalFetch(url, origin);
      calls.push({ path: new URL(url).pathname, method: init?.method ?? 'GET' });
      return originalFetch(url, { ...init, redirect: 'error' });
    };
    const inputBefore = digest(input), decisionBefore = digest(receipt.result.output.decision);
    let business, failure;
    try {
      business = await runIsolatedBusiness(input, acceptedDecision(receipt), isolatedHistoricalTools);
    } catch (error) {
      failure = { name: error.name, reason: error.message };
    }
    assert.equal(digest(input), inputBefore);
    assert.equal(digest(receipt.result.output.decision), decisionBefore);
    const after = await inspectServer(ownerToken, false, cutoff);
    assert.deepEqual(after.business, before.business, '原业务或模型记录发生变化');
    const domain = new URL('.', import.meta.resolve('@thesis-ledger/domain'));
    const artifacts = {};
    for (const file of ['arena-live-submit.js', 'arena-live-match-orders.js', 'arena-live-account.js',
      'arena-live-order-price.js', 'arena-live-protection.js', 'decimal.js'])
      artifacts[file] = createHash('sha256').update(readFileSync(new URL(file, domain))).digest('hex');
    for (const file of ['model-arena/live/live-execution-context', 'market/market-arena-replay-reader',
      'market/market-arena-history-source', 'integration/dsa/dsa-historical-execution'])
      artifacts[file] = createHash('sha256').update(readFileSync(`./dist/src/${file}.js`)).digest('hex');
    return { status: failure ? 'blocked' : 'passed', failure: failure ?? null,
      cutoff, completedAt: new Date().toISOString(), originalRequestId: receipt.requestId,
      frozenInputSha256: inputBefore, originalDecisionSha256: decisionBefore,
      realModelCalls: 0, competitionOperations: 0, automaticRetries: 0,
      businessUnchanged: true, providerUnchanged: true, originalInputUnchanged: true,
      protectedTables: before.business, backgroundValuationAppend: after.valuationAppend,
      queuePaused: after.queuePaused, jobs: after.jobs, artifacts, calls, business: business ?? null };
  } finally { globalThis.fetch = originalFetch; await db.$disconnect(); }
}

assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
assert.equal(process.argv.length, 3, '用法：<新的私有回执目录>');
const output = resolve(process.argv[2]);
assert(output.startsWith(resolve(root, '.recovery-artifacts') + '/'));
const packetPath = resolve(root, '.recovery-artifacts/arena-isolated-roundtrip-20261116-once/send.json');
const raw = readFileSync(packetPath);
assert.equal(sha(raw), 'a8bde1c59c9d92454331c7314b3fa04c93b9166e6375a1f2143d7a2b521e1d44');
const receipt = JSON.parse(raw);
acceptedDecision(receipt);
const prior = resolve(root, '.recovery-artifacts/arena-v2-admission-deployment-20261116');
const owner = JSON.parse(readFileSync(resolve(prior, 'queue-owner.json')));
assert.equal(owner.version, 'arena-maintenance-owner-v1');
const admitted = JSON.parse(readFileSync(resolve(prior, 'verify-receipt.json')));
assert.equal(admitted.admission.record.admissionState, 'admitted');
assert(Date.parse(admitted.admission.record.validUntil) > Date.now(), '来源准入已过期');
assert.equal(run(['context', 'show']), 'desktop-linux');
mkdirSync(output, { mode: 0o700 });
const dataSource = readFileSync(resolve(root, '../daily-stock-analysis/scripts/local-runtime/historical-execution-admission.py'), 'utf8')
  .replace("if __name__ == '__main__':", 'if False:');
const readData = () => JSON.parse(run(['exec', '-i', '--user', 'dsa:dsa', 'thesis-ledger-dev-dsa-1', 'python', '-B', '-'],
  dataSource + `\ns=store_at(Path('/app/data/stock_analysis.db'))\nv=state(s)\nwith s._connect() as c:\n rows=[dict(r) for r in c.execute('SELECT * FROM thesis_ledger_provider_config ORDER BY provider_id')]\nprint(json.dumps({'sha256':sha256(canonical({'state':v,'configs':rows})).hexdigest(),'revisions':v['revisions'],'enabled':v['sourceEnabled']}))`));
const beforeData = readData();
assert(beforeData.enabled);
writeFileSync(resolve(output, 'permit.json'), JSON.stringify({ at: new Date().toISOString(),
  originalReceiptSha256: sha(raw), mode: 'memory_only', beforeData }), { flag: 'wx', mode: 0o600 });
const code = `import assert from 'node:assert/strict';\nimport {createHash} from 'node:crypto';\nimport {readFileSync} from 'node:fs';\n`
  + [acceptedDecision, allowHistoricalFetch, partitionValuations, inspectServer, isolatedHistoricalTools,
    driveFrozenDecision, runIsolatedBusiness, acceptBusiness].map(fn => fn.toString()).join('\n')
  + `\nconsole.log(JSON.stringify(await acceptBusiness(${JSON.stringify(receipt)},process.argv[2])));`;
try {
  const result = JSON.parse(run(['exec', '-i', '-w', '/app/apps/server', 'thesis-ledger-dev-thesis-ledger-1',
    'node', '--input-type=module', '-', owner.token], code));
  const afterData = readData();
  assert.deepEqual(afterData, beforeData, 'DSA 来源、原准入或政策发生变化');
  assert.equal(sha(readFileSync(packetPath)), sha(raw), '原成功回执被修改');
  const final = { ...result, originalReceiptSha256: sha(raw), sourceControlUnchanged: true, beforeData, afterData };
  writeFileSync(resolve(output, 'receipt.json'), JSON.stringify(final, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: result.status, realModelCalls: 0, competitionOperations: 0,
    businessUnchanged: true, sourceControlUnchanged: true, failure: result.failure,
    account: result.business?.accountResult, protection: result.business?.protection,
    receipt: resolve(output, 'receipt.json') }));
  if (result.status !== 'passed') process.exitCode = 2;
} catch (error) {
  writeFileSync(resolve(output, 'failure.json'), JSON.stringify({ status: 'failed', name: error.name,
    reason: String(error.stderr ?? error.message).slice(-1800), modelCalls: 0, competitionOperations: 0 }), { flag: 'wx', mode: 0o600 });
  console.error('隔离验收失败；保留回执，队列保持暂停：' + String(error.stderr ?? error.message).trim().split('\n').at(-1));
  process.exitCode = 1;
}
