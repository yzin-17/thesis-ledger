import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function publicationInput(args, read = readFileSync) {
  const options = new Map(
    args
      .filter((s) => s.startsWith('--') && s.includes('='))
      .map((s) => {
        const split = s.indexOf('=');
        return [s.slice(2, split), s.slice(split + 1)];
      }),
  );
  assert.equal(options.size, args.filter((s) => s.includes('=')).length, '参数不可重复');
  assert(!(args.includes('--apply') && args.includes('--check-runtime')), '预检与写入不能混用');
  assert(
    args.every(
      (s) =>
        s === '--apply' ||
        s === '--check-runtime' ||
        /^--(?:bundle|expected-sha|confirm)=.+$/.test(s),
    ),
  );
  assert.equal(options.get('confirm'), 'thesis-ledger-dev/thesis_ledger');
  assert.match(options.get('expected-sha') ?? '', /^[a-f0-9]{64}$/);
  const bytes = read(options.get('bundle'));
  assert(bytes.length <= 1_000_000);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), options.get('expected-sha'));
  const bundle = JSON.parse(bytes.toString());
  assert.equal(bundle.format, 'event-free-economic-price-v1');
  assert.equal(bundle.source.providerId, 'hithink');
  assert.equal(bundle.source.upstreamSource, 'hithink-financial-api');
  assert.equal(
    bundle.qualification.documentationSha256,
    '6bb1e9411bdd9f5cc1989b1a1147ef38378141f9acf7ba0075057687fe36db83',
  );
  return {
    bundle,
    apply: args.includes('--apply'),
    checkRuntime: args.includes('--check-runtime'),
    expectedSha256: options.get('expected-sha'),
  };
}

export const publishDriver = `
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire('/app/apps/server/package.json');require('reflect-metadata');
const {PrismaClient}=require('@prisma/client');
const load=(s)=>require('/app/apps/server/dist/src/'+s+'.js');
const {DsaClient}=load('integration/dsa/dsa.client');
const {MarketEventFreeRepository}=load('market/market-event-free.repository');
const {prepareEventFreeEvidence}=load('market/market-event-free-evidence');
const {marketRouteContextV3}=load('market/market-window-selector-v3');
let text='';for await(const c of process.stdin)text+=c;const input=JSON.parse(text);
const prisma=new PrismaClient();
try{
const identity=await prisma.$queryRawUnsafe('SELECT current_database() AS database');
assert.equal(identity[0].database,'thesis_ledger');
const headers=process.env.SERVER_API_TOKEN?{authorization:'Bearer '+process.env.SERVER_API_TOKEN}:{};
const readPolicy=async()=>{const r=await fetch('http://127.0.0.1:3000/api/market-data/policy',{headers});assert(r.ok);return r.json();};
const before=await readPolicy();assert.equal(before.syncState,'applied');assert.equal(before.effectiveStale,false);
const desired={contractVersion:before.contractVersion,consumer:before.consumer,requestId:before.requestId,revision:before.revision,enabled:before.enabled,routes:before.routes};
const dsa=new DsaClient();const [effective,catalog]=await Promise.all([dsa.effectiveControlPolicyV3(),dsa.marketRouteCatalogV3()]);
for(const adjustment of ['none','qfq']){
 const key={kind:'bar',market:'CN',assetType:'STOCK',capability:'DAILY_BAR',timeframe:'1d',adjustment};
 const result=marketRouteContextV3({desired,effective:effective.projection?.effective,catalog,routeKey:key});assert(result.ok);
 const primary=result.context.targets[0];assert(primary?.eligible&&primary.catalogReady);assert.deepEqual(primary.target,input.bundle.source);
}
const prepared=prepareEventFreeEvidence(input.bundle);
const result=input.apply?await new MarketEventFreeRepository(prisma).publish(input.bundle):{certificateFingerprint:prepared.certificateFingerprint,derivedFingerprint:prepared.derivedSnapshot.inputFingerprint};
const persisted=await new MarketEventFreeRepository(prisma).exact(input.bundle.symbol,input.bundle.start,input.bundle.end);
const after=await readPolicy();assert.equal(after.revision,before.revision);assert.deepEqual(after.routes,before.routes);assert.equal(after.enabled,before.enabled);
console.log(JSON.stringify({...result,persisted:persisted?.certificateFingerprint===prepared.certificateFingerprint,policyRevision:after.revision,routesUnchanged:true,sourceRequests:0,published:input.apply}));
}finally{await prisma.$disconnect();}
`;

export function main(args = process.argv.slice(2), run = spawnSync, read = readFileSync) {
  const input = publicationInput(args, read);
  if (!input.apply && !input.checkRuntime)
    return {
      published: false,
      sourceRequests: 0,
      symbol: input.bundle.symbol,
      start: input.bundle.start,
      end: input.bundle.end,
      expectedSha256: input.expectedSha256,
    };
  const inspection = run(
    'docker',
    ['inspect', '--format', '{{json .Config.Labels}}', 'thesis-ledger-dev-thesis-ledger-1'],
    { encoding: 'utf8', timeout: 15_000 },
  );
  assert.equal(inspection.status, 0);
  const labels = JSON.parse(inspection.stdout);
  assert.equal(labels['com.docker.compose.project'], 'thesis-ledger-dev');
  assert.equal(labels['com.docker.compose.service'], 'thesis-ledger');
  const child = run(
    'docker',
    [
      'exec',
      '-i',
      '-w',
      '/app',
      'thesis-ledger-dev-thesis-ledger-1',
      'node',
      '--input-type=module',
      '-e',
      publishDriver,
    ],
    {
      input: JSON.stringify(input),
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 1_000_000,
    },
  );
  if (child.status !== 0) process.stderr.write(child.stderr ?? '');
  assert.equal(child.status, 0, '经济材料发布失败；保留回执，不重试或改写旧事实');
  return JSON.parse(child.stdout.trim().split('\n').at(-1));
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(main()));
