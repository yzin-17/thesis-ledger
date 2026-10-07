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
      ? [
          'api/thesis_ledger.py',
          'api/thesis_ledger_oauth.py',
          'src/services/thesis_ledger_control.py',
        ]
      : [
          'apps/server/dist/src/integration/dsa/dsa.client.js',
          'apps/server/dist/src/integration/dsa/dsa-provider-v3.js',
          'apps/server/dist/src/market/market-control.service.js',
          'apps/server/dist/src/market/market-provider-input.js',
          'apps/server/dist/src/market/market-data.controller.js',
        ];
  for (const file of files) {
    const local = await readFile(
      new URL(
        `${container === dsa ? '../../daily-stock-analysis/' : '../'}${file}`,
        import.meta.url,
      ),
    );
    assert(
      local.equals(docker(['exec', container, 'cat', `/app/${file}`])),
      `${container}:${file}`,
    );
    matched += 1;
  }
}
const sqliteWitness = () =>
  JSON.parse(
    docker(
      ['exec', '-i', dsa, 'python', '-'],
      `
import os, sqlite3, hashlib, json
path=os.path.abspath(os.getenv('DATABASE_PATH','./data/stock_analysis.db'))
tables=['thesis_ledger_provider_config','thesis_ledger_provider_tombstone','thesis_ledger_provider_oauth_session','thesis_ledger_provider_health','thesis_ledger_policy_state','thesis_ledger_policy_history']
with sqlite3.connect('file:'+path+'?mode=ro',uri=True) as db:
    result={}
    for table in tables:
        rows=sorted(db.execute('SELECT * FROM '+table).fetchall(),key=repr)
        result[table]={'count':len(rows),'digest':hashlib.sha256(repr(rows).encode()).hexdigest()}
    print(json.dumps(result))
`,
    ),
  );
const before = sqliteWitness();
const result = JSON.parse(
  docker(
    ['exec', '-i', server, 'node', '--input-type=module'],
    `
import assert from 'node:assert/strict';
import {DsaClient} from './apps/server/dist/src/integration/dsa/dsa.client.js';
import {PrismaClient} from '@prisma/client';
const prisma=new PrismaClient();
// DesiredProviderPolicy 的唯一键是 consumer，分别使用稳定排序字段。
const postgresBefore={
 tombstones:await prisma.providerTombstone.findMany({orderBy:{providerId:'asc'}}),
 policies:await prisma.desiredProviderPolicy.findMany({orderBy:{consumer:'asc'}}),
};
const client=new DsaClient();
const registry=await client.controlProviders();
assert.equal(registry.contractVersion,3);
assert.equal(registry.consumer,'thesis-ledger');
assert(registry.providers.length>0);
assert.deepEqual(Object.keys(await client.longbridgeOAuth({kind:'current'})),['session']);
const base=process.env.DSA_BASE_URL,token=process.env.THESIS_LEDGER_CONTROL_TOKEN;
assert(base&&token);
let oldBody=0,retired=0;
const call=async(path,method='GET',body)=>{
 const response=await fetch(new URL(path,base),{method,signal:AbortSignal.timeout(10000),
  headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,body:await response.json()};
};
for(const provider of registry.providers)for(const action of ['config','test','remove']) {
 for(const version of [1,2]) {
  const r=await call('/api/v3/thesis-ledger/control/providers/'+provider.providerId+'/'+action,'POST',
   {contractVersion:version,consumer:'thesis-ledger',requestId:'canonical-reject-provider',enabled:false});
  assert.equal(r.status,422); assert.equal(r.body.detail.code,'CONTROL_CONTRACT_UNSUPPORTED');oldBody+=1;
 }
}
for(const version of [1,2])for(const suffix of ['', '/11111111-1111-4111-8111-111111111111/cancel']) {
 const r=await call('/api/v3/thesis-ledger/control/providers/longbridge/oauth/sessions'+suffix,'POST',
 {contractVersion:version,consumer:'thesis-ledger',requestId:'canonical-reject-oauth',...(suffix===''?{clientId:'reject-before-create'}:{})});
 assert.equal(r.status,422);assert.equal(r.body.detail.code,'CONTROL_CONTRACT_UNSUPPORTED');oldBody+=1;
}
for(const prefix of ['/api/v1/thesis-ledger','/api/v2/thesis-ledger']) {
 assert.equal((await call(prefix+'/control/providers')).status,404);retired+=1;
 for(const action of ['config','test','remove']) {
  assert.equal((await call(prefix+'/control/providers/tushare/'+action,'POST',{})).status,404);retired+=1;
 }
 assert.equal((await call(prefix+'/control/providers/longbridge/oauth/sessions/current')).status,404);retired+=1;
}
let serverOldBody=0;
for(const action of ['config','test','remove'])for(const version of [1,2]) {
 const r=await fetch('http://127.0.0.1:3000/api/market-data/providers/tushare/'+action,
  {method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({contractVersion:version})});
 assert.equal(r.status,400);serverOldBody+=1;
}
const serverRegistry=await fetch('http://127.0.0.1:3000/api/market-data/providers');
for(const contractVersion of [1,2]) {
 const r=await fetch('http://127.0.0.1:3000/api/market-data/providers/longbridge/oauth/sessions/11111111-1111-4111-8111-111111111111/cancel',
 {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contractVersion})});
 assert.equal(r.status,400);serverOldBody+=1;
}
assert.equal(serverRegistry.status,200);
assert.equal((await serverRegistry.json()).contractVersion,3);
assert.deepEqual({
 tombstones:await prisma.providerTombstone.findMany({orderBy:{providerId:'asc'}}),
 policies:await prisma.desiredProviderPolicy.findMany({orderBy:{consumer:'asc'}}),
},postgresBefore);
await prisma.$disconnect();
console.log(JSON.stringify({providers:registry.providers.length,oldBody,retired,serverOldBody,oauthCurrent:true,postgresUnchanged:true}));
`,
  ),
);
assert.deepEqual(sqliteWitness(), before, '旧请求或只读查询修改了 Provider/OAuth 状态');
console.log(JSON.stringify({ matched, ...result, sqliteUnchanged: before }));
