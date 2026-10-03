import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { backtestRunResponseSchemaV3 } from '../packages/schemas/dist/index.js';

const containers = ['thesis-ledger-dev-thesis-ledger-1', 'thesis-ledger-dev-backtest-worker-1'];
const docker = (args, input) =>
  execFileSync('docker', args, { input, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
for (const container of containers) {
  const state = JSON.parse(docker(['inspect', container, '--format', '{{json .State}}']));
  assert(state.Running && state.Health.Status === 'healthy');
  for (const name of ['backtest-execution-owner', 'backtest-queue.reconciler']) {
    const local = await readFile(
      new URL(`../apps/server/dist/src/backtest/${name}.js`, import.meta.url),
    );
    assert(
      local.equals(
        docker(['exec', container, 'cat', `/app/apps/server/dist/src/backtest/${name}.js`]),
      ),
    );
  }
}
const witnessSql = `SELECT count(*)::text AS count, md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY "id"), '')) AS digest FROM "BacktestJob" t`;
const defaultsSql = `SELECT table_name, column_name, column_default FROM information_schema.columns WHERE table_schema='public' AND ((table_name='BacktestJob' AND column_name='mode') OR (table_name IN ('Strategy','StrategyVersion') AND column_name='schemaVersion'))`;
const evidence = () =>
  JSON.parse(
    docker(
      ['exec', '-i', containers[0], 'node', '--input-type=module'],
      `
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
const p=new PrismaClient();
try {
  const identity=await p.$queryRawUnsafe('SELECT current_database() AS name');
  assert.equal(identity[0].name,'thesis_ledger');
  assert.equal((await p.schemaVersion.findUniqueOrThrow({where:{id:1}})).version,'20261001120000_require_explicit_strategy_contract');
  const defaults=await p.$queryRawUnsafe(${JSON.stringify(defaultsSql)});
  assert.equal(defaults.length,3);
  for(const d of defaults) {
    if(d.table_name==='BacktestJob')assert(d.column_default.includes('V3'));
    else assert.equal(d.column_default,null);
  }
  const witness=await p.$queryRawUnsafe(${JSON.stringify(witnessSql)});
  const runs=await p.backtestJob.findMany({where:{mode:'V3',status:'succeeded'}});
  const run=runs.find(r=>r.input.inputKind!=='nav');
  assert(run);
  const legacy=await p.backtestJob.findFirstOrThrow({where:{mode:{not:'V3'}}});
  console.log(JSON.stringify({witness,id:run.id,legacy:legacy.id,request:{contractVersion:3,strategyVersionId:run.strategyVersionId,idempotencyKey:run.idempotencyKey,runConfig:run.input.runConfig,preparationStamp:run.input.preparationStamp}}));
}finally{await p.$disconnect();}
`,
    ),
  );
const before = evidence();
const request = async (path, method = 'GET', body) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:3000/api/v1/backtests/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status !== 429) return response;
    const seconds = Number(response.headers.get('retry-after') ?? 60);
    assert(seconds > 0 && seconds <= 60);
    console.log(`等待目标 API 限流窗口 ${seconds} 秒`);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
  throw new Error('目标 API 限流未恢复');
};
for (const body of [{ contractVersion: 2 }, {}, { ...before.request, unexpected: true }]) {
  const response = await request('runs', 'POST', body);
  assert.equal(response.status, 400);
}
assert(before.request.runConfig && before.request.preparationStamp);
const duplicate = await request('runs', 'POST', before.request);
assert.equal(duplicate.status, 201);
assert.equal(backtestRunResponseSchemaV3.parse(await duplicate.json()).id, before.id);
for (const action of ['', '/cancel', '/retry', '/run']) {
  const response = await request(`runs/${before.legacy}${action}`, action ? 'POST' : 'GET');
  assert.equal(response.status, 409);
}
for (const [path, method] of [
  ['jobs', 'GET'],
  ['jobs', 'POST'],
  [`jobs/${before.legacy}`, 'GET'],
]) {
  assert.equal((await request(path, method, method === 'POST' ? {} : undefined)).status, 404);
}
assert.deepEqual(evidence().witness, before.witness);
console.log(
  JSON.stringify({
    sourceParity: 4,
    oldCreateRejected: 3,
    idempotentCurrentCreate: true,
    legacyActionsRejected: 4,
    oldJobsRemoved: 3,
    unchanged: before.witness,
  }),
);
