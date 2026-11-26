import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
import { checkArenaV6 } from './arena-v6-runtime-check.mjs';
import { partitionValuations } from './run-arena-execution-admission.mjs';

export function v6Candidate(row) {
  const s = row.settings, routes = structuredClone(s.executionRoutes);
  const target = routes.filter(r => r.contract.id === 'arena_live_research');
  assert.equal(target.length, 1); assert.equal(target[0].contract.version, 'arena-live-research-v5');
  target[0].contract.version = 'arena-live-research-v6';
  const input = { name: row.name, enabled: row.enabled, priority: row.priority, capabilities: row.capabilities,
    expectedRevision: row.updatedAt, executionRoutes: routes, modelPricing: Object.fromEntries(Object.entries(s.modelPricing).map(([k, p]) =>
      [k, { costPer1kInput: p.costPer1kInput, costPer1kOutput: p.costPer1kOutput, costCurrency: p.costCurrency }])) };
  for (const key of ['baseUrl','models','modelCatalog','authMode','upstreamFormat','chatImplementation','compatibilityExtensionProfile',
    'modelDefaults','modelReasoning','timeoutMs','firstOutputTimeoutMs','outputIdleTimeoutMs'])
    if (s[key] !== undefined) input[key] = s[key];
  return input;
}

async function inspectV6(owner, cutoff) {
  const { PrismaClient } = await import('@prisma/client');
  const { Queue } = await import('bullmq');
  const { RedisService, redisKey } = await import('./dist/src/platform/redis.service.js');
  const db = new PrismaClient(), redis = new RedisService();
  const queue = new Queue('live', { connection: redis.client, prefix: redisKey('queue','arena'), skipMetasUpdate: true });
  try {
    assert(await queue.isPaused(), '研究队列未暂停');
    assert.equal(await redis.client.get(redisKey('lock','arena-maintenance-owner')), owner, '队列归属变化');
    const jobs = await queue.getJobCounts('active','wait','paused');
    assert(Object.values(jobs).every(n => n === 0), '存在研究作业，不执行部署验收');
    return await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const tables = await tx.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND
        (tablename LIKE '%Arena%' OR tablename LIKE 'Ai%' OR tablename IN ('ProviderConfig','Portfolio','Account','Position')) ORDER BY tablename`);
      const business = {}; let valuationAppend;
      for (const { tablename } of tables) {
        assert(/^[A-Za-z0-9_]+$/u.test(tablename));
        let rows = await tx.$queryRawUnsafe(`SELECT row_to_json(t)::text AS value FROM public."${tablename}" t`);
        if (tablename === 'ArenaLiveValuation') { const split = partitionValuations(rows, cutoff); rows = split.historical; valuationAppend = split.appended.length; }
        if (tablename === 'ProviderConfig') rows = rows.map(row => {
          const p = JSON.parse(row.value); for (const key of Object.keys(p)) if (/health|checkedAt|updatedAt|lastError/iu.test(key)) delete p[key];
          return { value: JSON.stringify(p) };
        });
        business[tablename] = { count: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows.map(r => r.value).sort())).digest('hex') };
      }
      const journal = await tx.providerHealthCheck.findMany({ where: { details: { path: ['kind'], equals: 'ai_provider_validation' } }, orderBy: { id: 'asc' } });
      business.aiValidationJournal = { count: journal.length, sha256: createHash('sha256').update(JSON.stringify(journal)).digest('hex') };
      const p = await tx.providerConfig.findUniqueOrThrow({ where: { name: 'lmstudio' } });
      return { cutoff, business, valuationAppend, jobs, queuePaused: true, provider: { name: p.name, settings: p.settings,
        enabled: p.enabled, priority: p.priority, capabilities: p.capabilities, updatedAt: p.updatedAt.toISOString() } };
    }, { timeout: 45000 });
  } finally { await queue.close(); await redis.onModuleDestroy(); await db.$disconnect(); }
}

const artifacts = {
  server: ['model-arena/live/live-research-call','model-arena/live/live-research-runner','model-arena/live/live-research-messages',
    'model-arena/live/live-research-contract','model-arena/live/live-decision-feedback','model-arena/live/live-invalid-decision','model-arena/live/live-call-diagnostics',
    'model-arena/live/live-research-wakeup-recovery','ai/ai-generation-output','ai/ai-generation-output-error','ai/ai-sdk-generation.adapter',
    'ai/ai-generation-failure-diagnostics','ai/trace/ai-trace-error'],
  domain: ['index','arena-live-submit','arena-live-sell-availability'], schemas: ['index','arena-generation-contracts','arena-live-generated-orders'],
};

async function main() {
  assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '需要正式维护锁');
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url))), [mode, directory] = process.argv.slice(2);
  assert(['capture','plan','verify','audit'].includes(mode) && process.argv.length === 4);
  const output = resolve(directory); assert(output.startsWith(resolve(root,'.recovery-artifacts')+'/'));
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const read = name => JSON.parse(readFileSync(resolve(output,name+'.json')));
  const write = (name, value) => writeFileSync(resolve(output,name+'.json'), JSON.stringify(value,null,2)+'\n', { mode: 0o600, flag: 'wx' });
  const owner = read('queue-owner'), runtime = new DsaRuntimeRecovery(resolve(root,'../thesis-ledger-infra'),resolve(root,'../thesis-ledger-infra/.env')).runtime;
  const run = (source, container = 'thesis-ledger-dev-thesis-ledger-1') => {
    try { return JSON.parse(runtime.dockerSync(['exec','-i','-w','/app/apps/server',container,
      'node','--input-type=module','-'], { input: source, timeout: 120000 }).trim()); }
    catch (error) {
      const log = resolve(output, 'runtime-error-'+Date.now()+'.log');
      writeFileSync(log, String(error.stderr ?? error.message), { mode: 0o600, flag: 'wx' });
      throw new Error('运行态核验失败，诊断保存在 '+log);
    }
  };
  const baseline = mode === 'capture' ? null : read('baseline'), cutoff = baseline?.cutoff ?? new Date().toISOString();
  const inspect = () => run(`import assert from 'node:assert/strict';import {createHash} from 'node:crypto';\n${partitionValuations.toString()}\n${inspectV6.toString()}\nconsole.log(JSON.stringify(await inspectV6(${JSON.stringify(owner.token)},${JSON.stringify(cutoff)})));`);
  const current = inspect();
  if (mode === 'capture') {
    write('baseline', current);
    console.log(JSON.stringify({ mode, protectedTables: Object.keys(current.business).length, queuePaused: true, jobs: current.jobs })); return;
  }
  assert.deepEqual(current.business, baseline.business, '原业务、配置或模型记录变化');
  if (mode === 'plan') {
    const candidate = v6Candidate(current.provider);
    const response = await fetch('http://127.0.0.1:3000/api/v1/ai/providers/validation-plan', {
      method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(candidate), signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 201, '正式验证计划失败'); const plan = await response.json();
    write('route-plan', { candidate, plan, applied: false, realModelCalls: 0 });
    assert(plan.pending.every(r => r.purpose === 'arena_live_research'), '其他路由要求变化，停止保存');
    // 此入口只记录计划；有待验证用途时禁止调用 test-and-save 或伪造证明。
    console.log(JSON.stringify({ mode, pending: plan.pending, maxCalls: plan.maxCalls, applied: false })); return;
  }
  if (mode === 'verify') {
    const expected = {};
    for (const [pkg, files] of Object.entries(artifacts)) for (const file of files) {
      const path = pkg === 'server' ? `apps/server/dist/src/${file}.js` : `packages/${pkg}/dist/${file}.js`;
      expected[pkg+'/'+file] = createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex');
    }
    const sample = JSON.parse(readFileSync(resolve(root,'apps/server/test/model-arena/fixtures/invalid-sell-20261102.json')));
    const code = `import 'reflect-metadata';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';\n`+
      `const expected=${JSON.stringify(expected)};for(const [key,sha] of Object.entries(expected)){const slash=key.indexOf('/'),pkg=key.slice(0,slash),name=key.slice(slash+1);const file=pkg==='server'?new URL('./dist/src/'+name+'.js',import.meta.url):new URL(name+'.js',new URL('.',import.meta.resolve('@thesis-ledger/'+pkg)));assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),sha,key);}\n`+
      `${checkArenaV6.toString()}\nconsole.log(JSON.stringify({artifacts:expected,...await checkArenaV6(${JSON.stringify(sample)})}));`;
    const results = {};
    for (const container of ['thesis-ledger-dev-thesis-ledger-1','thesis-ledger-dev-backtest-worker-1']) results[container] = run(code,container);
    write('runtime-readback', results);
    assert.deepEqual(inspect().business, baseline.business);
    console.log(JSON.stringify({ mode, status: 'passed', containers: 2, artifacts: Object.keys(expected).length,
      fixedResponses: Object.values(results).reduce((n,r)=>n+r.fixedResponses,0), realModelCalls: 0 })); return;
  }
  write('audit', { ...current, status: 'passed', realModelCalls: 0, competitionOperations: 0, at: new Date().toISOString() });
  console.log(JSON.stringify({ mode, status: 'passed', businessUnchanged: true, valuationAppend: current.valuationAppend,
    realModelCalls: 0, competitionOperations: 0, queuePaused: current.queuePaused }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
