import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const server = 'thesis-ledger-dev-thesis-ledger-1';
const worker = 'thesis-ledger-dev-backtest-worker-1';
const dsa = 'thesis-ledger-dev-dsa-1';
const docker = (args, input) =>
  execFileSync('docker', args, { input, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
let matched = 0;
for (const container of [server, worker, dsa]) {
  const state = JSON.parse(docker(['inspect', container, '--format', '{{json .State}}']));
  assert(state.Running && state.Health.Status === 'healthy');
  const files =
    container === dsa
      ? ['api/thesis_ledger.py', 'src/services/thesis_ledger_control.py']
      : [
          'apps/server/dist/src/market/market-policy-attempt.js',
          'apps/server/dist/src/market/market-policy-catalog.js',
          'apps/server/dist/src/market/market-policy-storage.js',
          'apps/server/dist/src/integration/dsa/dsa.client.js',
          'apps/server/dist/src/integration/dsa/dsa-v3-protocol.js',
          'packages/schemas/dist/market-route-v3.js',
        ];
  for (const file of files) {
    const local = await readFile(
      new URL(
        `${container === dsa ? '../../daily-stock-analysis/' : '../'}${file}`,
        import.meta.url,
      ),
    );
    let remote = `/app/${file}`;
    if (file.startsWith('packages/schemas/')) {
      const packagePath = docker([
        'exec',
        container,
        'readlink',
        '-f',
        '/app/node_modules/@thesis-ledger/schemas',
      ])
        .toString()
        .trim();
      assert(packagePath.startsWith('/app/node_modules/.pnpm/'));
      remote = `${packagePath}/dist/market-route-v3.js`;
    }
    assert(local.equals(docker(['exec', container, 'cat', remote])), `${container}:${file}`);
    matched += 1;
  }
}
const witness = () =>
  JSON.parse(
    docker(
      ['exec', '-i', dsa, 'python', '-'],
      `
import os, sqlite3, hashlib, json
path=os.path.abspath(os.getenv('DATABASE_PATH','./data/stock_analysis.db'))
tables=['thesis_ledger_policy_state','thesis_ledger_policy_history','thesis_ledger_route_admission_v3','thesis_ledger_provider_config','thesis_ledger_provider_health']
with sqlite3.connect('file:'+path+'?mode=ro',uri=True) as db:
 result={}
 for table in tables:
  rows=sorted(db.execute('SELECT * FROM '+table).fetchall(),key=repr)
  result[table]={'count':len(rows),'digest':hashlib.sha256(repr(rows).encode()).hexdigest()}
 print(json.dumps(result))
`,
    ),
  );
const before = witness();
const result = JSON.parse(
  docker(
    ['exec', '-i', server, 'node', '--input-type=module'],
    `
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {DsaClient} from './apps/server/dist/src/integration/dsa/dsa.client.js';
import {marketPolicyResponse} from './apps/server/dist/src/market/market-policy-storage.js';
const prisma=new PrismaClient();
const client=new DsaClient();
const pgWitness=async()=>({current:await prisma.desiredProviderPolicy.findUniqueOrThrow({where:{consumer:'thesis-ledger'}}),
 history:await prisma.desiredProviderPolicyRevision.findMany({where:{consumer:'thesis-ledger'},orderBy:{revision:'asc'}})});
try {
 const pgBefore=await pgWitness();
 const policy=marketPolicyResponse(pgBefore.current);
 assert.equal(policy.syncState,'applied');assert.equal(policy.effectiveStale,false);
 const envelope=await client.effectiveControlPolicyV3();
 const effective=envelope.projection?.effective;
 assert(effective);assert.equal(effective.sourceDesiredRevision,policy.revision);
 const catalog=await client.marketRouteCatalogV3();
 assert.equal(catalog.contractVersion,3);assert.equal(catalog.consumer,'thesis-ledger');
 const desired={contractVersion:3,consumer:'thesis-ledger',requestId:effective.requestId,
  revision:policy.revision,enabled:policy.enabled,routes:policy.routes};
 const replay=await client.applyControlPolicyV3(desired);
 assert.equal(replay.idempotent,true);assert.equal(replay.effective.sourceDesiredRevision,policy.revision);
 let oldBody=0,retired=0,serverRejected=0;
 const call=async(path,method='GET',body)=>{
  const response=await fetch(new URL(path,process.env.DSA_BASE_URL),{method,signal:AbortSignal.timeout(10000),
   headers:{authorization:'Bearer '+process.env.THESIS_LEDGER_CONTROL_TOKEN,'content-type':'application/json'},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
 };
 for(const version of [1,2]) {
  const rejected=await call('/api/v3/thesis-ledger/control/policies/apply','POST',{...desired,contractVersion:version});
  assert.equal(rejected.status,422);assert.equal(rejected.body.detail.code,'CONTROL_CONTRACT_UNSUPPORTED');oldBody+=1;
  for(const path of ['/control/policies/effective','/control/routes/capabilities']) {
   assert.equal((await call('/api/v3/thesis-ledger'+path+'?contractVersion='+version)).status,422);oldBody+=1;
  }
 }
 for(const prefix of ['/api/v1/thesis-ledger','/api/v2/thesis-ledger']) {
  assert.equal((await call(prefix+'/control/policies/apply','POST',desired)).status,404);retired+=1;
  for(const path of ['/control/policies/effective','/control/routes/capabilities']) {
   assert.equal((await call(prefix+path+'?contractVersion=3')).status,404);retired+=1;
  }
 }
 const invalidInputs=[{...desired,contractVersion:1},{...desired,contractVersion:2},
  {...desired,revision:policy.revision+1,routes:{DAILY_BAR:{ETF:[]}}},
  {...desired,revision:policy.revision+1,legacyV2Routes:{}}];
 for(const body of invalidInputs) {
  const response=await fetch('http://127.0.0.1:3000/api/market-data/policy',
   {method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal(response.status,400);serverRejected+=1;
 }
 const publicPolicy=await fetch('http://127.0.0.1:3000/api/market-data/policy');
 assert.equal(publicPolicy.status,200);
 assert.equal((await publicPolicy.json()).effectiveStale,false);
 assert.deepEqual(await pgWitness(),pgBefore);
 console.log(JSON.stringify({revision:policy.revision,routeCatalogRevision:catalog.catalogRevision,
  idempotentApply:true,oldBody,retired,serverRejected,postgresUnchanged:true,
  unavailableReasons:effective.routes.flatMap(route=>route.targets.filter(target=>!target.eligible).map(target=>target.reason))}));
} finally {await prisma.$disconnect();}
`,
  ),
);
assert.deepEqual(witness(), before, 'Policy 验收改变了 SQLite 当前策略或相关事实');
console.log(JSON.stringify({ matched, ...result, sqliteUnchanged: before }));
