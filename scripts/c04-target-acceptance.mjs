import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  backtestRunResponseSchemaV3,
  backtestNavRunResponseV3Schema,
  backtestNavRunListV3Schema,
} from '../packages/schemas/dist/index.js';

// 固定开发运行态；只读取已有记录与冻结产物，不创建、重试或修改业务数据。
const containers = ['thesis-ledger-dev-thesis-ledger-1', 'thesis-ledger-dev-backtest-worker-1'];
const modules = [
  'backtest/backtest-v3-runner.js',
  'backtest/backtest-v3-benchmark.js',
  'backtest/backtest-v3-benchmark-alignment.js',
  'backtest/backtest.module.js',
  'backtest/backtest-processor.module.js',
  'backtest/backtest-current-run-read.js',
  'backtest/backtest-summary.js',
  'backtest/backtest.service.js',
  'backtest/backtest-snapshot-v3-store.js',
  'backtest/backtest-nav-snapshot-store.js',
  'backtest/backtest-nav-run-read.js',
  'backtest/backtest-nav-result-v3.js',
  'strategy-optimization/strategy-optimization-run.service.js',
];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const docker = (args, input) =>
  execFileSync('docker', args, {
    input,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 60_000,
  });
for (const container of containers) {
  const state = JSON.parse(docker(['inspect', container, '--format', '{{json .State}}']));
  assert.equal(state.Running, true);
  assert.equal(state.Health.Status, 'healthy');
  for (const module of modules) {
    const local = await readFile(new URL(`../apps/server/dist/src/${module}`, import.meta.url));
    const target = docker(['exec', container, 'cat', `/app/apps/server/dist/src/${module}`]);
    assert.equal(sha256(target), sha256(local), `${container}:${module}`);
  }
}

const witnessSql = `SELECT count(*)::text AS count,
md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY "id"), '')) AS digest
FROM "BacktestJob" t`;
const targetEvidence = JSON.parse(
  docker(
    ['exec', '-i', containers[0], 'node', '--input-type=module'],
    `
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {PrismaClient} from '@prisma/client';
import {LocalSnapshotStore} from './apps/server/dist/src/backtest/backtest-snapshot.js';
import {LocalNavSnapshotStore} from './apps/server/dist/src/backtest/backtest-nav-snapshot-store.js';
import {LocalSnapshotV3Runner} from './apps/server/dist/src/backtest/backtest-v3-runner.js';
import * as exchangeRunners from './apps/server/dist/src/backtest/backtest-v3-runner.js';
import {LocalNavSnapshotV3Runner} from './apps/server/dist/src/backtest/backtest-nav-v3-runner.js';
import {assertCurrentRunForRead} from './apps/server/dist/src/backtest/backtest-current-run-read.js';
import {assertSnapshotV3PitExecutionAvailable} from './apps/server/dist/src/backtest/backtest-snapshot-v3-pit-guard.js';
const prisma=new PrismaClient();
try {
  assert.equal(exchangeRunners.LocalSnapshotV3RunnerV2,undefined);
  assert.equal(LocalSnapshotV3Runner.prototype.runNav,undefined);
  const identity=await prisma.$queryRawUnsafe('SELECT current_database() AS name');
  assert.equal(identity[0].name,'thesis_ledger');
  const witness=()=>prisma.$queryRawUnsafe(${JSON.stringify(witnessSql)});
  const before=await witness();
  const jobs=await prisma.backtestJob.findMany({orderBy:{createdAt:'desc'}});
  const root=process.env.BACKTEST_SNAPSHOT_ROOT??resolve(process.cwd(),'var/backtest');
  const exchange=new LocalSnapshotStore(root);
  const nav=new LocalNavSnapshotStore(root);
  const results=[];
  let strictRefused=false;
  let tamperRefused=false;
  for(const job of jobs) {
    if(job.mode!=='V3'||job.status!=='succeeded')continue;
    const input=job.input;
    let replay;
    if(input?.inputKind==='nav') {
      const frozen=await nav.replay(job.id);
      const m=frozen.manifest;
      const artifactRefs=[m.artifact,m.contextArtifact].map(ref=>({...ref,artifactId:ref.contentHash,key:job.id+'/'+ref.key}));
      replay=await new LocalNavSnapshotV3Runner(nav).runNav({runId:job.id,snapshotRef:{snapshotId:m.contentHash,contentHash:m.contentHash},artifactRefs},new AbortController().signal);
    } else {
      // 仅接受现行完整记录；目标旧记录保留给 HTTP 拒绝检查。
      try {assertCurrentRunForRead(job);} catch {continue;}
      const m=await exchange.v3.replay(job.id);
      replay=await new LocalSnapshotV3Runner(exchange).run({runId:job.id,snapshotRef:{snapshotId:m.contentHash,contentHash:m.contentHash},artifactRefs:m.artifacts},new AbortController().signal);
      assert.throws(()=>assertCurrentRunForRead({...job,result:{...job.result,warnings:['forged']}}));
      tamperRefused=true;
      assert.throws(()=>assertSnapshotV3PitExecutionAvailable({...m,executionPriceProtocol:{...m.executionPriceProtocol,history:{basis:'point-in-time',reconstructionEvidenceRef:'synthetic'}}}));
      strictRefused=true;
    }
    assert.equal(replay.resultChecksum,job.resultChecksum);
    results.push({id:job.id,inputKind:input?.inputKind==='nav'?'nav':'exchange',checksum:replay.resultChecksum,completeness:replay.completeness,pending:replay.pendingRequestIds?.length??0});
  }
  assert(results.some(x=>x.inputKind==='exchange'));
  assert(results.some(x=>x.inputKind==='nav'));
  assert(strictRefused&&tamperRefused);
  assert.deepEqual(await witness(),before);
  console.log(JSON.stringify({results,strictRefused,tamperRefused,unchanged:before,legacy:jobs.filter(j=>j.mode!=='V3').map(j=>j.id)}));
} finally {await prisma.$disconnect();}
`,
  ),
);

const baseUrl = 'http://127.0.0.1:3000/api/v1';
const request = async (path) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`);
    if (response.status !== 429) return response;
    const seconds = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 10_000;
    assert(delay <= 60_000, '限流等待超过一分钟，需要独立续验');
    console.error(`目标 HTTP 限流，按窗口等待 ${delay / 1000} 秒后继续验收`);
    await response.body?.cancel();
    await new Promise((done) => setTimeout(done, delay));
  }
  throw new Error('目标 HTTP 限流四次，验收未完成');
};
const get = async (path) => {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  return response.json();
};
assert.equal((await get('/health')).status, 'healthy');
const exchangeList = await get('/backtests/runs');
const navList = backtestNavRunListV3Schema.parse(await get('/backtests/runs/nav'));
for (const result of targetEvidence.results) {
  const nav = result.inputKind === 'nav';
  const raw = await get(`/backtests/runs/${nav ? 'nav/' : ''}${result.id}`);
  const parsed = (nav ? backtestNavRunResponseV3Schema : backtestRunResponseSchemaV3).parse(raw);
  assert.equal(parsed.result.resultChecksum, result.checksum);
  assert((nav ? navList : exchangeList).some((row) => row.id === result.id));
}
for (const id of targetEvidence.legacy) {
  const response = await request(`/backtests/runs/${id}`);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'UNSUPPORTED_CONTRACT_VERSION');
  assert(!exchangeList.some((row) => row.id === id));
}
console.log(
  JSON.stringify({
    script: fileURLToPath(import.meta.url),
    modulesMatched: modules.length * containers.length,
    healthyContainers: containers,
    httpExchangeCount: exchangeList.length,
    httpNavCount: navList.length,
    ...targetEvidence,
  }),
);
