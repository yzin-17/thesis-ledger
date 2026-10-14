import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 只读验收：读取实际启动路径、已有业务结果及真实数据接口。
const root = fileURLToPath(new URL('../', import.meta.url));
const prefix = 'thesis-ledger-dev-';
const docker = (args, input) =>
  execFileSync('docker', args, { encoding: 'utf8', input, timeout: 120_000 });
const digest = (value) => createHash('sha256').update(value).digest('hex');
const api = async (path) => {
  const response = await fetch(`http://127.0.0.1:3000${path}`);
  assert(response.ok, `${path}: HTTP ${response.status}`);
  return response.json();
};
const policy = await api('/api/market-data/policy');
assert.equal(policy.revision, 40);
assert.equal(policy.dsaRevision, 40);
assert.equal(policy.syncState, 'applied');
assert.equal(policy.routes.length, 8);
const health = await api('/api/v1/health');
assert.equal(health.status, 'healthy');
const serverFiles = [
  'backtest/backtest-listing-disclosure-v3.js',
  'backtest/backtest-v3-runner.js',
  'backtest/backtest-snapshot-v3-builder.js',
  'backtest/backtest-snapshot-v3-calendar-alignment.js',
  'backtest/backtest-v3-benchmark-cost.js',
  'market/market-window-selector-v3.js',
].map((path) => `apps/server/dist/src/${path}`);
const schemaFiles = [
  'backtest-daily-tradability.js',
  'market-data-wire-v3.js',
  'market-coverage-proof-v3.js',
];
const identities = [];
for (const service of ['thesis-ledger', 'backtest-worker']) {
  const container = `${prefix}${service}-1`;
  const schemaRoot = docker([
    'exec',
    container,
    'readlink',
    '-f',
    '/app/node_modules/@thesis-ledger/schemas',
  ]).trim();
  const pairs = serverFiles.map((path) => [root + path, `/app/${path}`]);
  pairs.push(
    ...schemaFiles.map((path) => [
      root + `packages/schemas/dist/${path}`,
      `${schemaRoot}/dist/${path}`,
    ]),
  );
  const paths = pairs.map(([, path]) => path);
  const hashes = JSON.parse(
    docker([
      'exec',
      container,
      'node',
      '-e',
      'const fs=require("node:fs"),crypto=require("node:crypto");console.log(JSON.stringify(JSON.parse(process.argv[1]).map(p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"))))',
      JSON.stringify(paths),
    ]),
  );
  for (const [[local, installed], hash] of pairs.map((pair, index) => [pair, hashes[index]])) {
    assert.equal(hash, digest(readFileSync(local)), `${service}: ${installed}`);
    identities.push({ service, path: installed, sha256: hash });
  }
}
const dsaFiles = [
  'api/thesis_ledger.py',
  'src/services/thesis_ledger_listing_information.py',
  'src/services/thesis_ledger_market_v3_facts.py',
  'src/services/thesis_ledger_research_calendar.py',
  'src/services/thesis_ledger_market_tradability_input.py',
  'src/services/thesis_ledger_daily_tradability.py',
  'src/services/thesis_ledger_market_daily_tradability.py',
];
const dsaHashes = JSON.parse(
  docker([
    'exec',
    `${prefix}dsa-1`,
    'python',
    '-c',
    'import sys,json,hashlib,pathlib; print(json.dumps([hashlib.sha256(pathlib.Path("/app",p).read_bytes()).hexdigest() for p in json.loads(sys.argv[1])]))',
    JSON.stringify(dsaFiles),
  ]),
);
dsaFiles.forEach((path, index) => {
  assert.equal(
    dsaHashes[index],
    digest(readFileSync(root + `../daily-stock-analysis/${path}`)),
    path,
  );
  identities.push({ service: 'dsa', path: `/app/${path}`, sha256: dsaHashes[index] });
});
const samples = [];
for (const symbol of ['600000.SH', '600519.SH']) {
  const payload = {
    contractVersion: 3,
    requestId: `c31-target-${symbol}`,
    symbol,
    start: '2023-07-08',
    end: '2023-09-15',
    tradabilityMode: 'assume-untradable-no-bar',
    routeKey: {
      kind: 'bar',
      market: 'CN',
      assetType: 'STOCK',
      capability: 'DAILY_BAR',
      timeframe: '1d',
      adjustment: 'qfq',
    },
    routeTarget: { providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0 },
  };
  const response = JSON.parse(
    docker(
      [
        'exec',
        '-i',
        `${prefix}dsa-1`,
        'python',
        '-c',
        'import os,sys,urllib.request; body=sys.stdin.buffer.read(); request=urllib.request.Request("http://127.0.0.1:8000/api/v3/thesis-ledger/market/bars",data=body,headers={"Content-Type":"application/json","Authorization":"Bearer "+os.environ["THESIS_LEDGER_DSA_TOKEN"]}); print(urllib.request.urlopen(request,timeout=90).read().decode())',
      ],
      JSON.stringify(payload),
    ),
  );
  assert.equal(response.symbol, symbol);
  assert.equal(response.bars.length, 50);
  assert.equal(response.provenance.effectivePolicyRevision, 40);
  assert.equal(response.provenance.providerId, 'tencent');
  if (symbol === '600519.SH')
    assert.deepEqual(response.coverageProof.listing, { symbol, status: 'unknown' });
  else assert.equal(response.coverageProof.listing.firstTradingDate, '1999-11-10');
  for (const service of ['thesis-ledger', 'backtest-worker']) {
    docker(
      [
        'exec',
        '-i',
        '-w',
        '/app',
        `${prefix}${service}-1`,
        'node',
        '-e',
        'const fs=require("node:fs"),s=require("@thesis-ledger/schemas");s.marketDataBarSeriesResponseV3Schema.parse(JSON.parse(fs.readFileSync(0,"utf8"))); console.log("parsed")',
      ],
      JSON.stringify(response),
    );
  }
  samples.push({
    symbol,
    count: response.bars.length,
    coverage: response.coverage,
    listing: response.coverageProof.listing,
    provenance: response.provenance,
    inputFingerprint: response.inputFingerprint,
    consumerParses: 2,
  });
}
const jobs = {};
for (const [id, checksum] of [
  ['873ba8dd-40c3-4f9e-b1d5-b16192f697b0', 'a07303d0e7c0f3ce'],
  ['652ba051-a4c5-493d-81e6-2cdbe3c090f0', '8c66f3f721f5e4d8'],
]) {
  const job = await api(`/api/v1/backtests/runs/${id}`);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.resultChecksum, checksum);
  jobs[id] = {
    status: job.status,
    snapshotId: job.snapshotId,
    resultChecksum: job.resultChecksum,
    completeness: job.result.completeness,
  };
}
const images = {};
for (const service of ['thesis-ledger', 'backtest-worker', 'dsa']) {
  const [row] = JSON.parse(docker(['inspect', `${prefix}${service}-1`]));
  assert.equal(row.State.Health.Status, 'healthy');
  images[service] = {
    id: row.Id,
    image: row.Image,
    health: row.State.Health.Status,
    command: row.Config.Cmd,
  };
}
console.log(
  JSON.stringify({
    policy: {
      revision: policy.revision,
      dsaRevision: policy.dsaRevision,
      syncState: policy.syncState,
      routes: policy.routes,
    },
    schemaVersion: health.schemaVersion,
    identities,
    samples,
    jobs,
    images,
  }),
);
