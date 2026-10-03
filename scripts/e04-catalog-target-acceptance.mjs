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
          'src/services/thesis_ledger_control.py',
          'src/services/thesis_ledger_catalog_contract.py',
        ]
      : [
          'apps/server/dist/src/market/catalog-readiness.service.js',
          'apps/server/dist/src/market/catalog-job-projection.js',
          'apps/server/dist/src/market/instruments/catalog-sync.service.js',
          'apps/server/dist/src/market/market-catalog-input.js',
          'apps/server/dist/src/market/market-data.controller.js',
          'apps/server/dist/src/market/market-derived-series-v3.js',
          'apps/server/dist/src/market/market-derived-series-snapshot-v3.js',
          'apps/server/dist/src/market/market-derived-series.repository.js',
          'apps/server/dist/src/integration/dsa/dsa.client.js',
          'apps/server/dist/src/integration/dsa/dsa-catalog-v3.js',
          'packages/schemas/dist/market-catalog.js',
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
      remote = `${packagePath}/dist/market-catalog.js`;
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
tables=['thesis_ledger_catalog_generation','thesis_ledger_catalog_job','thesis_ledger_catalog_ack','thesis_ledger_policy_state','thesis_ledger_policy_history','thesis_ledger_route_admission_v3','thesis_ledger_provider_config','thesis_ledger_provider_health']
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
const jobId = JSON.parse(
  docker(
    ['exec', '-i', dsa, 'python', '-'],
    `
import os, sqlite3, json, datetime
with sqlite3.connect('file:'+os.path.abspath(os.environ['DATABASE_PATH'])+'?mode=ro',uri=True) as db:
 leases=db.execute("SELECT lease_expires_at FROM thesis_ledger_catalog_job WHERE status='running'").fetchall()
 boundary=datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=20)
 assert all(row[0] and datetime.datetime.fromisoformat(row[0])>boundary for row in leases), '目标存在过期或即将过期的 lease，不执行有恢复副作用的状态读取'
 row=db.execute("SELECT id FROM thesis_ledger_catalog_job WHERE status='succeeded' ORDER BY updated_at DESC LIMIT 1").fetchone()
 assert row, '目标缺少成功 Catalog Job'
 print(json.dumps(row[0]))
`,
  ),
);
const result = JSON.parse(
  docker(
    ['exec', '-i', server, 'node', '--input-type=module'],
    `
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {DsaClient} from './apps/server/dist/src/integration/dsa/dsa.client.js';
import {freezeMarketDerivedSeriesV3,readMarketDerivedSeriesV3} from './apps/server/dist/src/market/market-derived-series-snapshot-v3.js';
const prisma=new PrismaClient(), client=new DsaClient();
const pgWitness=async()=>({
 catalog:await prisma.catalogSyncState.findMany(),
 instruments:await prisma.$queryRawUnsafe(\`SELECT count(*)::int AS count, md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY t."id"), '')) AS digest FROM "Instrument" t\`),
 policies:await prisma.desiredProviderPolicy.findMany(),
 derived:await prisma.marketDerivedSeriesSnapshotV3.count(),
});
try {
 const pgBefore=await pgWitness();
 const snapshot=await client.catalogSnapshot();
 assert(snapshot.complete && snapshot.items.length>0);
 const delta=await client.catalogDelta(snapshot.cursor);
 assert.equal(delta.checksum,snapshot.checksum);assert.deepEqual(delta.items,[]);assert.deepEqual(delta.deleted,[]);
 const job=await client.catalogJob(${JSON.stringify(jobId)});
 assert.equal(job.status,'succeeded');
 assert.equal(job.generation,snapshot.generation);assert.equal(job.checksum,snapshot.checksum);
 const status=await fetch('http://127.0.0.1:3000/api/market-data/catalog/status');
 assert.equal(status.status,200);const publicStatus=await status.json();
 assert.equal(publicStatus.generation,snapshot.generation);assert.equal(publicStatus.checksum,snapshot.checksum);
 const timestamp='2026-01-01T07:00:00Z',availableAt='2026-10-01T00:00:00Z';
 const derived=freezeMarketDerivedSeriesV3({identity:{symbol:'600519.SH',assetType:'STOCK',timeframe:'1d',adjustment:'none'},
  rawEvidenceRef:'target-isolated-computation',dataAsOf:availableAt,
  bars:[{timestamp,availableAt,completionStatus:'complete',open:2,high:2,low:2,close:2,volume:100,amount:200}],
  conversion:{kind:'multiplicative-price-factor',adjustment:'qfq',evidenceRef:'target-isolated-factor',sourceRevision:'fixture-current',basisRef:'fixed',anchorFactor:2,anchorAvailableAt:availableAt,volumeSemantics:'unadjusted',amountSemantics:'unadjusted',factors:[{timestamp,availableAt,value:1}]}});
 assert.equal(readMarketDerivedSeriesV3(derived,derived.inputFingerprint).bars[0].close,1);
 assert.throws(()=>readMarketDerivedSeriesV3({...derived,algorithmRevision:'raw-times-factor-over-fixed-anchor-binary64-v1'},derived.inputFingerprint));
 let oldCursor=0,oldBody=0,retired=0,serverRejected=0;
 const call=async(path,method='GET',body,control=true)=>{
  const response=await fetch(new URL(path,process.env.DSA_BASE_URL),{method,signal:AbortSignal.timeout(10000),
   headers:{authorization:'Bearer '+(control?process.env.THESIS_LEDGER_CONTROL_TOKEN:process.env.THESIS_LEDGER_DSA_TOKEN),'content-type':'application/json'},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});return response.status;
 };
 for(const cursor of ['0','generation:0','v2:1'])for(const kind of ['snapshot','delta']) {
  assert.equal(await call('/api/v3/thesis-ledger/catalog/'+kind+'?cursor='+encodeURIComponent(cursor),'GET',undefined,false),409);oldCursor+=1;
 }
 for(const contractVersion of [1,2])for(const action of ['jobs','ack']) {
  assert.equal(await call('/api/v3/thesis-ledger/control/catalog/'+action,'POST',{contractVersion,consumer:'thesis-ledger',requestId:'reject-old',generation:snapshot.generation,checksum:snapshot.checksum}),422);oldBody+=1;
 }
 for(const prefix of ['/api/v1/thesis-ledger','/api/v2/thesis-ledger']) {
  for(const suffix of ['/catalog/snapshot','/catalog/delta?cursor='+encodeURIComponent(snapshot.cursor),'/control/catalog/jobs/'+job.id]) {
   assert.equal(await call(prefix+suffix),404);retired+=1;
  }
  for(const suffix of ['/control/catalog/jobs','/control/catalog/ack']) {
   assert.equal(await call(prefix+suffix,'POST',{}),404);retired+=1;
  }
 }
 for(const body of [{contractVersion:1},{contractVersion:2},{cursor:'0'},{consumer:'other'}]) {
  const response=await fetch('http://127.0.0.1:3000/api/market-data/catalog/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal(response.status,400);serverRejected+=1;
 }
 assert.deepEqual(await pgWitness(),pgBefore);
 console.log(JSON.stringify({generation:snapshot.generation,itemCount:snapshot.items.length,jobCurrent:true,derivedCurrent:true,oldDerivedRejected:true,oldCursor,oldBody,retired,serverRejected,postgresUnchanged:true}));
} finally {await prisma.$disconnect();}
`,
  ),
);
assert.deepEqual(witness(), before, 'Catalog 验收改变了 SQLite 状态');
console.log(JSON.stringify({ matched, ...result, sqliteUnchanged: before }));
