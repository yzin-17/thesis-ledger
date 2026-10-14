import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { quoteFaultFetch } from './market-quote-fault-boundary.mjs';
import { createLocalApi } from './market-route-failover-acceptance.mjs';
import { localOrigin } from './market-status-functional-acceptance.mjs';
import { createSourceCacheCase } from './market-source-cache-case.mjs';
import { targetProbe } from './market-cache-generation-acceptance.mjs';

export function assertQuoteFailureArgs(args, plan) {
  assert(args.includes('--execute') && args.includes('--authorized-quote-failure-case') &&
    args.includes(`--expected-policy=${plan.baseline.revision}`) &&
    args.includes(`--expected-config=${plan.configVersion}`), '一次隔离故障须本次精确授权及政策/来源配置代次');
}

export const quoteFailureProcessSource = (driver) => `const quoteFaultFetch=${quoteFaultFetch.toString()};\n${driver}`;

async function main() {
  const args = process.argv.slice(2), origin = localOrigin(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000');
  const api = createLocalApi(origin);
  const readPlan = async () => createSourceCacheCase(await api.get('/api/market-data/policy'),
    (await api.get('/api/market-data/providers')).providers);
  const plan = await readPlan();
  if (!args.includes('--execute')) {
    console.log(JSON.stringify({ mode: 'read-only-preview', expectedPolicy: plan.baseline.revision,
      expectedConfig: plan.configVersion, symbol: '600519.SH',
      boundary: '原报价正常缓存基线后，仅独立Node进程拦截一次精确quote GET 503；其他HTTP原样通过',
      proof: '注入调用一次HTTP/零上游SDK，同代次缓存保持价格/来源/原时钟并披露原质量；不称基线上游SDK次数',
      persistence: '仅原Reader正常缓存/锁生命周期，无政策/来源配置/凭据/准入/Ledger或旧资产变更，不清缓存' }));
    return;
  }
  assertQuoteFailureArgs(args, plan);
  const destination = path.join(await fs.mkdtemp(path.join(tmpdir(), 'tl-quote-failure-')), 'evidence.json');
  let record = { origin, policyRevision: plan.baseline.revision, configVersion: plan.configVersion };
  const journal = async (next) => {
    record = { ...record, ...next };
    await fs.writeFile(destination + '.tmp', JSON.stringify(record, null, 2), { mode: 0o600 });
    await fs.rename(destination + '.tmp', destination);
  };
  console.log(`验收记录：${destination}`);
  await journal({ phase: 'prepared' });
  const baseline = await targetProbe(origin)('baseline');
  assert.equal(baseline.provider, 'hithink');
  const current = await readPlan();
  assert.equal(current.baseline.revision, plan.baseline.revision);
  assert.equal(current.baselineFingerprint, plan.baselineFingerprint);
  assert.equal(current.configVersion, plan.configVersion);
  await journal({ phase: 'baseline_confirmed', baseline });
  // 固定维护模块拼入独立进程；不改容器文件、服务fetch或真实上游。
  const driver = await fs.readFile(new URL('./market-quote-failure-driver.mjs', import.meta.url), 'utf8');
  const source = quoteFailureProcessSource(driver);
  const result = spawnSync('docker', ['exec', '-i', '-w', '/app', 'thesis-ledger-dev-thesis-ledger-1',
    'node', '--input-type=module', '-e', source], { input: JSON.stringify({ symbol: '600519.SH', traceId: randomUUID() }),
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  assert(result.status === 0, '隔离目标验收失败；保留记录，不输出环境/SDK原文');
  const lines = result.stdout.split('\n').filter((line) => line.startsWith('QUOTE_FAILURE_PROOF='));
  assert.equal(lines.length, 1);
  const proof = JSON.parse(lines[0].slice('QUOTE_FAILURE_PROOF='.length));
  assert(proof.injected === 1 && proof.quoteHttpAttempts === 1 && proof.sourceSdkExecutions === 0 && proof.controlUnchanged);
  const after = await readPlan();
  assert.equal(after.baseline.revision, plan.baseline.revision);
  assert.equal(after.baselineFingerprint, plan.baselineFingerprint);
  assert.equal(after.configVersion, plan.configVersion);
  await journal({ phase: 'verified', proof });
  console.log(JSON.stringify(proof));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('隔离故障验收未完成；保留记录，不修改服务或用户配置。'); process.exitCode = 1; });
}
