import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [file] = process.argv.slice(2);
assert(file && process.argv.length === 3);
const plan = JSON.parse(readFileSync(file, 'utf8'));
assert.equal(plan.target, 'thesis-ledger-dev');
assert.equal(plan.databaseName, 'thesis_ledger');
assert.equal(plan.ownerName, 'thesis_ledger');
const execute = (service, args, input) => execFileSync('docker', ['exec', '-i', `${plan.target}-${service}-1`, ...args], {
  encoding: 'utf8', input, timeout: 30_000, maxBuffer: 128 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
}).trim();
const query = (body) => execute('postgres', ['psql', '-X', '-qAt', '-w', '-v', 'ON_ERROR_STOP=1', '-U',
  plan.ownerName, '-d', plan.databaseName], body);
const state = JSON.parse(query(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object('head',(SELECT version FROM "SchemaVersion" WHERE id=1),
  'revision',(SELECT revision FROM "DesiredProviderPolicy"),
  'retiredRoutes',(SELECT count(*) FROM "DesiredProviderPolicy" p, jsonb_array_elements(p.routes->'routes') r
    WHERE r#>>'{key,capability}'='HISTORICAL_TRADING_STATUS'));
ROLLBACK;`));
assert.deepEqual(state, { head: plan.targetHead, revision: plan.statusRevision, retiredRoutes: 0 });
const witnessSql = readFileSync(new URL('./named-v1-arena-ledger.sql', import.meta.url), 'utf8');
const ledger = JSON.parse(execFileSync(fileURLToPath(new URL('../../apps/server/node_modules/.bin/tsx', import.meta.url)),
  [fileURLToPath(new URL('../../apps/server/src/platform/named-v1-arena-ledger.ts', import.meta.url))],
  { input: query(witnessSql), encoding: 'utf8' }));
assert.deepEqual({ matches: ledger.matches, historical: ledger.historical.matches, cycles: ledger.cycles,
  pending: ledger.pending.map(({ id }) => id).sort() }, plan.arena);
assert.deepEqual(ledger.issues, []);
const redisCommand = (...args) => execute('redis', ['redis-cli', '--raw', ...args]);
const live = plan.redisNamespace + 'live:';
assert.equal(redisCommand('HEXISTS', live + 'meta', 'paused'), '1');
assert.equal(redisCommand('LLEN', live + 'active'), '0');
const jobs = ['wait', 'paused'].flatMap((queue) => redisCommand('LRANGE', live + queue, '0', '-1').split('\n').filter(Boolean));
assert.deepEqual(jobs.sort(), ledger.pending.map(({ jobId }) => jobId).sort());
for (const pending of ledger.pending)
  assert.deepEqual(JSON.parse(redisCommand('HGET', live + pending.jobId, 'data')), { id: pending.id, attempt: pending.attempt + 1 });

const checkHttp = `import assert from 'node:assert/strict';
const revision = Number(process.argv[2]);
const base = process.env.DSA_BASE_URL + '/api/v1/thesis-ledger';
const request = async (path, token, value) => fetch(base + path, {
  method: value ? 'POST' : 'GET', signal: AbortSignal.timeout(8_000),
  headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
  ...(value ? { body: JSON.stringify(value) } : {}),
});
const health = await fetch('http://127.0.0.1:3000/api/v1/health', { signal: AbortSignal.timeout(8_000) });
assert.equal(health.status, 200);
const control = await request('/control/policies/effective?contractVersion=1', process.env.THESIS_LEDGER_CONTROL_TOKEN);
assert.equal(control.status, 200);
const policy = (await control.json()).projection.effective;
assert.equal(policy.revision, revision);
assert(!policy.routes.some(({ key }) => key.capability === 'HISTORICAL_TRADING_STATUS'));
for (const [market,symbol,start,end] of [['HK','00147.HK','2025-08-06','2025-08-11'],['US','GME.US','2024-05-10','2024-05-24']]) {
  const key = { kind:'data', market, assetType:'STOCK', capability:'DAILY_TRADING_STATUS' };
  const route = policy.routes.find(({key:k}) => k.market === market && k.assetType === 'STOCK' && k.capability === key.capability);
  assert(route?.enabled && route.targets[0]?.eligible && route.targets[0].providerId === 'local-materials');
  const result = await request('/market/status-capabilities', process.env.THESIS_LEDGER_DSA_TOKEN, {
    contractVersion: 1, capabilityVersion: 1, consumer:'thesis-ledger', requestId:'named-v1-activation-' + market,
    policyRevision:revision, routeKey:key, routeTarget:{providerId:'local-materials',upstreamSource:'local-materials',routeIndex:0},
    symbol, range:{start,end},
  });
  assert.equal(result.status, 200, '现行市场状态 ' + market);
  assert((await result.json()).days.some(({intradayHalts}) => intradayHalts.length > 0));
}
assert.equal((await request('/market/trading-status', process.env.THESIS_LEDGER_DSA_TOKEN, {})).status, 404);
console.log('Server 与 DSA 的现行策略及港美股状态验证通过。');`;
console.log(execute('thesis-ledger', ['node', '--input-type=module', '-', String(plan.statusRevision)], checkHttp));
console.log(`目标 PostgreSQL head ${state.head}，Arena ${ledger.cycles} 条轮次，${ledger.pending.length} 条待办保持暂停。`);
