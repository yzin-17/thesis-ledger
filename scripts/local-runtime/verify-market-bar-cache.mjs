import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startIsolatedNavRedis } from '../../apps/server/test/backtest/nav-worker-redis.integration-harness.ts';

export function cacheVerificationPlan(args) {
  const values = new Map();
  for (const arg of args) {
    const match = /^--(output|mode)=(.+)$/u.exec(arg);
    assert(match || arg === '--execute', '未知选项');
    const key = match?.[1] ?? 'execute'; assert(!values.has(key), '重复选项');
    values.set(key, match?.[2] ?? true);
  }
  const output = values.get('output'); const mode = values.get('mode') ?? 'workspace';
  assert(typeof output === 'string' && isAbsolute(output), '回执目录须为绝对路径');
  assert(['workspace', 'target'].includes(mode), '执行模式无效');
  return { output, mode, execute: values.has('execute') };
}

export function cacheTarget(value) {
  assert(value.State?.Running && value.Config?.Labels?.['com.docker.compose.project'] === 'thesis-ledger-dev'
    && value.Config?.Labels?.['com.docker.compose.service'] === 'thesis-ledger', '目标应用不匹配');
  return { id: value.Id, image: value.Image, startedAt: value.State.StartedAt };
}

export async function verifyCache(plan) {
  if (!plan.execute) return { ...plan, providerPriceCalls: 0, isolatedRedisPlanned: true, businessWrites: 0 };
  assert(!process.env.DOCKER_HOST, '不允许覆盖Docker端点');
  mkdirSync(plan.output, { recursive: true, mode: 0o700 });
  assert(!existsSync(join(plan.output, 'execution.permit')), '已有许可，不能自动重复');
  const save = (name, value) => writeFileSync(join(plan.output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  save('execution.permit', { ...plan, at: new Date().toISOString() });
  const run = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', maxBuffer: 2_000_000, timeout: 120_000 });
  const inspect = () => cacheTarget(JSON.parse(run(['inspect', 'thesis-ledger-dev-thesis-ledger-1']))[0]);
  const target = inspect();
  const isolated = await startIsolatedNavRedis();
  save('resource.json', { name: isolated.containerName, label: isolated.containerLabel });
  try {
    const root = resolve(new URL('../..', import.meta.url).pathname);
    const fixture = JSON.parse(readFileSync(join(root, 'packages/schemas/fixtures/market-data-v3.response.etf-qfq.json'), 'utf8'));
    const program = readFileSync(new URL('./verify-market-bar-cache-program.mjs', import.meta.url), 'utf8')
      .replace('__CODE_ROOT__', JSON.stringify(plan.mode === 'target' ? '/app' : root))
      .replace('__FIXTURE__', JSON.stringify(fixture));
    let stdout;
    if (plan.mode === 'target') {
      const redisUrl = isolated.redisUrl.replace('127.0.0.1', 'host.docker.internal');
      stdout = run(['exec', '-i', '-e', `CACHE_QA_REDIS_URL=${redisUrl}`, '-e', 'CACHE_QA_TARGET_MODE=1', target.id, 'node', '--input-type=module'], program);
    } else {
      const tokens = JSON.parse(run(['exec', target.id, 'node', '-e',
        'process.stdout.write(JSON.stringify({data:process.env.THESIS_LEDGER_DSA_TOKEN,control:process.env.THESIS_LEDGER_CONTROL_TOKEN}))']));
      const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: 'postgresql://unused:unused@127.0.0.1/unused',
        REDIS_URL: isolated.redisUrl, DSA_BASE_URL: 'http://127.0.0.1:8000', THESIS_LEDGER_DSA_TOKEN: tokens.data,
        THESIS_LEDGER_CONTROL_TOKEN: tokens.control, CREDENTIAL_ENCRYPTION_KEY: 'controlled-unused-key-only',
        CACHE_QA_REDIS_URL: isolated.redisUrl };
      stdout = execFileSync(process.execPath, ['--input-type=module'], { env, input: program,
        encoding: 'utf8', maxBuffer: 2_000_000, timeout: 120_000 });
    }
    const observation = JSON.parse(stdout.trim().split('\n').at(-1));
    const result = { ...plan, target, observation, targetUnchanged: JSON.stringify(target) === JSON.stringify(inspect()),
      completedAt: new Date().toISOString() };
    save('report.json', result);
    assert(observation.passed && result.targetUnchanged, '缓存集成没有通过');
    return { passed: true, mode: plan.mode, scopes: observation.scopes.length, providerPriceCalls: observation.providerPriceCalls,
      actualTargetCacheCode: plan.mode === 'target', output: plan.output };
  } catch (error) {
    let observation;
    try { observation = JSON.parse(String(error.stdout).trim().split('\n').at(-1)); } catch { /* 仅保留结构化回执。 */ }
    if (!existsSync(join(plan.output, 'report.json'))) save('report.json', { passed: false, errorType: error.name, target, mode: plan.mode, observation });
    throw new Error('缓存只读集成失败，回执已保留');
  } finally { await isolated.cleanup(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(await verifyCache(cacheVerificationPlan(process.argv.slice(2)))));
