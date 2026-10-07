import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const server = 'thesis-ledger-dev-thesis-ledger-1';
const worker = 'thesis-ledger-dev-backtest-worker-1';
const dsa = 'thesis-ledger-dev-dsa-1';
const docker = (args, input) =>
  execFileSync('docker', args, {
    input,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
let matched = 0;
for (const container of [server, worker, dsa]) {
  const state = JSON.parse(docker(['inspect', container, '--format', '{{json .State}}']));
  assert(state.Running && state.Health.Status === 'healthy');
  const modules =
    container === dsa
      ? [
          'api/app.py',
          'api/thesis_ledger.py',
          'api/thesis_ledger_chart_v3.py',
          'api/thesis_ledger_events_v3.py',
          'api/thesis_ledger_nav_v3.py',
        ]
      : [
          'apps/server/dist/src/market/market-current-data.js',
          'apps/server/dist/src/market/market.service.js',
          'apps/server/dist/src/market/market-quote-reader.js',
        ];
  for (const module of modules) {
    const local = await readFile(
      new URL(
        `${container === dsa ? '../../daily-stock-analysis/' : '../'}${module}`,
        import.meta.url,
      ),
    );
    assert(
      local.equals(docker(['exec', container, 'cat', `/app/${module}`])),
      `${container}:${module}`,
    );
    matched += 1;
  }
}
const witnessSql = `SELECT count(*)::text AS count, md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY "id"), '')) AS digest FROM "BacktestJob" t`;
const result = JSON.parse(
  docker(
    ['exec', '-i', server, 'node', '--input-type=module'],
    `
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {DsaClient} from './apps/server/dist/src/integration/dsa/dsa.client.js';
import {MarketService} from './apps/server/dist/src/market/market.service.js';
const prisma=new PrismaClient({log:[{level:'query',emit:'event'}]});
let navProbeActive=false,navProjectionQueries=0;
prisma.$on('query',event=>{if(navProbeActive&&event.query.includes('"FundNavPoint"'))navProjectionQueries+=1;});
const paths=['/capabilities','/market/quote','/market/chip','/market/fund-nav',
  '/market/fund-nav/history','/market/fund-holdings','/market/fx-rates',
  '/market/bars','/market/chart-bars','/market/events','/market/indicators/calculate',
  '/backtest/calendar','/backtest/instrument-facts','/backtest/nav-inputs'];
const base=process.env.DSA_BASE_URL;
const token=process.env.THESIS_LEDGER_DSA_TOKEN;
assert(base&&token);
const call=async(path,method='GET',authenticated=false,body)=>{
  const response=await fetch(new URL(path,base),{method,signal:AbortSignal.timeout(10000),
    headers:{'content-type':'application/json',...(authenticated?{authorization:'Bearer '+token}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
};
try {
  assert.equal((await prisma.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,'thesis_ledger');
  const before=await prisma.$queryRawUnsafe(${JSON.stringify(witnessSql)});
  let retired=0,unauthorized=0,oldBody=0;
  for(const prefix of ['/api/v1/thesis-ledger','/api/v2/thesis-ledger']) {
    for(const path of paths)for(const method of ['GET','POST']) {
      const r=await call(prefix+path,method,true);
      assert.equal(r.status,404,prefix+path+method); retired+=1;
    }
  }
  const posts=['/market/bars','/market/chart-bars','/market/events','/market/indicators/calculate','/backtest/nav-inputs'];
  for(const path of paths.filter(p=>p!=='/capabilities')) {
    const method=posts.includes(path)?'POST':'GET';
    assert.equal((await call('/api/v3/thesis-ledger'+path,method,false,method==='POST'?{}:undefined)).status,401,path);
    unauthorized+=1;
  }
  for(const path of posts) {
    assert.equal((await call('/api/v3/thesis-ledger'+path,'POST',true,{contractVersion:2,requestId:'canonical-old-data'})).status,422,path);
    oldBody+=1;
  }
  const client=new DsaClient();
  const capabilities=await client.marketDataCapabilitiesV3();
  assert.deepEqual(capabilities.dataContractVersions,[3]);
  const fx=await client.fxRates({baseCurrency:'CNY',currencies:['CNY'],asOf:'2026-09-30'});
  assert.equal(fx.version,3);assert.equal(fx.baseCurrency,'CNY');
  assert(fx.rates.some(r=>r.fromCurrency==='CNY'&&r.toCurrency==='CNY'&&r.rate===1&&r.available));
  const calendar=await client.backtestCalendar({market:'CN',start:'2026-09-01',end:'2026-09-08',dataAsOf:'2026-10-01T00:00:00Z'});
  assert.equal(calendar.version,3);
  const fault=new Error('controlled-upstream-unavailable');
  const compiledService=new MarketService({get:async()=>{throw fault;}},{client:{get:async()=>null}},prisma);
  navProbeActive=true;
  try {await assert.rejects(compiledService.getFundNavHistory('000001.OF'),error=>error===fault);}
  finally {navProbeActive=false;}
  assert.equal(navProjectionQueries,0);
  let retiredServer=0;
  for(const path of ['/api/v2/market/600519.SH/quote','/api/v2/market/000001.OF/fund-nav/history','/api/v2/market-data/providers']) {
    assert.equal((await fetch('http://127.0.0.1:3000'+path,{signal:AbortSignal.timeout(10000)})).status,404,path);
    retiredServer+=1;
  }
  assert.deepEqual(await prisma.$queryRawUnsafe(${JSON.stringify(witnessSql)}),before);
  console.log(JSON.stringify({retired,retiredServer,unauthorized,oldBody,currentClientParsed:['capabilities','fx-identity','calendar'],navProjectionQueries,unchanged:before}));
}finally{await prisma.$disconnect();}
`,
  ),
);
console.log(JSON.stringify({ matched, ...result }));
