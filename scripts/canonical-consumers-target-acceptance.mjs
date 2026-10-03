import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

// 只读现有开发运行态；不写业务行、路由、凭证或准入。
const server = 'thesis-ledger-dev-thesis-ledger-1';
const worker = 'thesis-ledger-dev-backtest-worker-1';
const dsa = 'thesis-ledger-dev-dsa-1';
const docker = (args, input) =>
  execFileSync('docker', args, { input, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
let matched = 0;
for (const container of [server, worker, dsa]) {
  const state = JSON.parse(docker(['inspect', container, '--format', '{{json .State}}']));
  assert(state.Running && state.Health.Status === 'healthy');
  const paths =
    container === dsa
      ? [
          'src/services/thesis_ledger_dependency_facts.py',
          'src/services/thesis_ledger_tradability_provider.py',
        ]
      : [
          'apps/server/dist/src/risk/strategy-risk-nav-context.js',
          'apps/server/dist/src/risk/strategy-risk-context.service.js',
          'apps/server/dist/src/strategy-optimization/strategy-optimization-backtest-records.js',
          'apps/server/dist/src/strategy-optimization/strategy-optimization-read.service.js',
          'apps/server/dist/src/backtest/backtest-summary.js',
          'apps/server/dist/src/ledger/core-projection.js',
        ];
  for (const path of paths) {
    const local = await readFile(
      new URL(
        `${container === dsa ? '../../daily-stock-analysis/' : '../'}${path}`,
        import.meta.url,
      ),
    );
    assert(
      local.equals(docker(['exec', container, 'cat', `/app/${path}`])),
      `${container}:${path}`,
    );
    matched += 1;
  }
}
for (const name of ['thesis_ledger_v2_dependencies.py', 'thesis_ledger_v2_tradability.py'])
  docker(['exec', dsa, 'test', '!', '-e', `/app/src/services/${name}`]);
const prismaRoot = new URL('../apps/server/prisma/', import.meta.url);
const schema = await readFile(new URL('schema.prisma', prismaRoot), 'utf8');
const rawOwned = JSON.parse(await readFile(new URL('raw-owned-tables.json', prismaRoot), 'utf8'));
const tables = [...schema.matchAll(/^model (\w+) \{/gm)]
  .map((match) => match[1])
  .concat(rawOwned.tables.map((table) => table.name));
const head = (await readdir(new URL('migrations/', prismaRoot), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .at(-1);
const witnessSql = `SELECT count(*)::text AS count, md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY "id"), '')) AS digest FROM "BacktestJob" t`;
const result = JSON.parse(
  docker(
    ['exec', '-i', server, 'node', '--input-type=module'],
    `
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {currentBacktestGroupRecords} from './apps/server/dist/src/strategy-optimization/strategy-optimization-backtest-records.js';
import {currentFundRiskContext} from './apps/server/dist/src/risk/strategy-risk-nav-context.js';
import {DsaClient, DsaError} from './apps/server/dist/src/integration/dsa/dsa.client.js';
import {MarketService} from './apps/server/dist/src/market/market.service.js';
const prisma = new PrismaClient({log:[{level:'query',emit:'event'}]});
const witness = () => prisma.$queryRawUnsafe(${JSON.stringify(witnessSql)});
try {
 const before = await witness();
 const identity = (await prisma.$queryRawUnsafe('SELECT current_database() AS database, current_user AS role'))[0];
 assert.equal(identity.database,'thesis_ledger');
 const version = await prisma.schemaVersion.findUnique({where:{id:1}});
 assert.equal(version.version,${JSON.stringify(head)});
 const actualTables = await prisma.$queryRawUnsafe("SELECT tablename, has_table_privilege(current_user, format('%I.%I',schemaname,tablename), 'SELECT') AS read, has_table_privilege(current_user, format('%I.%I',schemaname,tablename), 'INSERT') AS insert, has_table_privilege(current_user, format('%I.%I',schemaname,tablename), 'UPDATE') AS update, has_table_privilege(current_user, format('%I.%I',schemaname,tablename), 'DELETE') AS delete FROM pg_tables WHERE schemaname='public'");
 for (const name of ${JSON.stringify(tables)}) {
  const table = actualTables.find(table=>table.tablename===name);
  assert(table && table.read,name);
  if(name==='SchemaVersion') assert(!table.insert && !table.update && !table.delete,name);
  else if(name==='LedgerEvent') assert(table.insert && !table.update && !table.delete,name);
  else assert(table.insert && table.update && table.delete,name);
 }
 const old = await prisma.backtestJob.findMany({where:{mode:{not:'V3'}},select:{id:true}});
 const groups = await currentBacktestGroupRecords(prisma, {});
 assert(groups.length > 0);
 assert(groups.every(row=>row.mode==='V3' && !old.some(item=>item.id===row.id)));
 for (const item of old) assert.equal((await currentBacktestGroupRecords(prisma,{jobId:item.id})).length,0);
 let rawNavQueries = 0;
 prisma.$on('query',event=>{if(event.query.includes('"FundNavPoint"'))rawNavQueries+=1;});
 const market = new MarketService(new DsaClient(), undefined, prisma);
 let risk;
 try {
  const context = await currentFundRiskContext(market,'161725.OF',{position:null,trade:null},new Date(),false);
  risk = context.context.price ? 'current-nav' : 'unavailable';
 } catch (error) {
  assert(error instanceof DsaError && typeof error.code === 'string', String(error));
  risk = 'source-unavailable';
 }
 assert.equal(rawNavQueries,0);
 assert.deepEqual(await witness(),before);
 console.log(JSON.stringify({identity,head:version.version,expectedTables:${tables.length},tablesAndPermissions:true,currentOptimizationRows:groups.length,oldRowsExcluded:old.length,risk,rawNavQueries,unchanged:before}));
} finally {await prisma.$disconnect();}
`,
  ),
);
console.log(JSON.stringify({ matched, retiredDsaModulesAbsent: 2, ...result }));
