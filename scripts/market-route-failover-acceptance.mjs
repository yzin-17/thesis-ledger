import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, renameSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFailoverPlan, desiredFromState, policyFingerprint, assertCase, assertCaseSeries, restoreFailoverCase, symbol, window, primary, backup } from './market-route-failover-case.mjs';

export function createLocalApi(origin, fetchImpl = fetch, signal) {
  const base = new URL(origin);
  assert(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) && !base.username && !base.password,
    '验收入口仅允许本机 HTTP API，禁止 URL 凭据');
  const request = async (method, path, body, recovery = false) => {
    const deadline = AbortSignal.timeout(10000);
    const response = await fetchImpl(new URL(path, base), {
      method, signal: signal && !recovery ? AbortSignal.any([signal, deadline]) : deadline,
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}),
        ...(process.env.SERVER_API_TOKEN ? { authorization: `Bearer ${process.env.SERVER_API_TOKEN}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`验收 API ${method} ${path.split('?')[0]} 返回 ${response.status}`);
    return response.json();
  };
  return {
    get: (path) => request('GET', path), post: (path, body) => request('POST', path, body), put: (path, body) => request('PUT', path, body),
    recovery: { get: (path) => request('GET', path, undefined, true),
      post: (path, body) => request('POST', path, body, true), put: (path, body) => request('PUT', path, body, true) },
  };
}

const barPath = `/api/market/${symbol}/bars?${new URLSearchParams({ ...window, assetType: 'ETF', timeframe: '1d', adjustment: 'qfq', acceptance: 'interactive', refresh: 'true' })}`;

export async function observeCase(api) {
  const [state, providerResponse, catalog] = await Promise.all([
    api.get('/api/market-data/policy'), api.get('/api/market-data/providers'),
    api.get('/api/market-data/routes/capabilities?contractVersion=3'),
  ]);
  return createFailoverPlan(state, providerResponse.providers, catalog);
}

async function readTimedSeries(api, target, routeIndex, revision, clock) {
  const started = clock();
  const raw = await api.get(barPath);
  const elapsedMs = clock() - started;
  assert(Number.isFinite(elapsedMs) && elapsedMs >= 0, '验收计时必须为有效单调时钟');
  return { ...assertCaseSeries(raw, target, routeIndex, revision), elapsedMs };
}

function assertSeriesLatency(evidence, limitMs) {
  assert(evidence.elapsedMs <= limitMs,
    `真实整窗请求耗时 ${evidence.elapsedMs}ms，超过 ${limitMs}ms 验收上限`);
}

export async function executeCase(api, plan, checkpoint = () => {}, clock = () => performance.now()) {
  assertCase(plan);
  const before = desiredFromState(await api.get('/api/market-data/policy'));
  assert(before.revision === plan.baseline.revision && policyFingerprint(before) === plan.baselineFingerprint, '执行前政策已经改变');
  const source = (await api.get('/api/market-data/providers')).providers.find((row) => row.providerId === primary.providerId);
  assert(source?.enabled && source.configVersion === plan.baselineConfigVersion, '执行前来源配置已经改变');
  const evidence = { baseline: await readTimedSeries(api, primary, 0, before.revision, clock) };
  assertSeriesLatency(evidence.baseline, 5000);
  const ownership = { policy: false, provider: false };
  // 写入恢复记录先于每个可能已经提交但响应丢失的变更。
  checkpoint({ phase: 'prepared', plan, evidence, ownership });
  let failure;
  try {
    const changed = await api.put('/api/market-data/policy', { ...plan.temporary, expectedRevision: plan.baseline.revision });
    assert(changed.revision === plan.temporary.revision &&
      policyFingerprint(desiredFromState(changed)) === plan.temporaryFingerprint, '临时政策提交未得到明确确认');
    ownership.policy = true;
    checkpoint({ phase: 'policy-owned', plan, evidence, ownership });
    const applied = await api.get('/api/market-data/policy');
    assert(applied.revision === plan.temporary.revision && applied.syncState === 'applied' &&
      policyFingerprint(desiredFromState(applied)) === plan.temporaryFingerprint, '临时政策未完成同步');
    checkpoint({ phase: 'policy-applied', plan, evidence, ownership });
    const changedSource = await api.post(`/api/market-data/providers/${primary.providerId}/config`, {
      requestId: plan.caseId, enabled: false, expectedConfigVersion: plan.baselineConfigVersion,
    });
    assert(changedSource.requestId === plan.caseId && changedSource.enabled === false &&
      changedSource.configVersion === plan.baselineConfigVersion + 1, '停用提交未得到明确确认');
    ownership.provider = true;
    checkpoint({ phase: 'provider-owned', plan, evidence, ownership });
    const disabled = (await api.get('/api/market-data/providers')).providers.find((row) => row.providerId === primary.providerId);
    assert(disabled?.enabled === false && disabled.configVersion === plan.baselineConfigVersion + 1, '停用来源未确认');
    checkpoint({ phase: 'primary-disabled', plan, evidence, ownership });
    evidence.backup = await readTimedSeries(api, backup, 1, applied.revision, clock);
    assertSeriesLatency(evidence.backup, 10000);
  } catch (error) { failure = error; }
  finally {
    checkpoint({ phase: 'restoring', plan, evidence, ownership });
    try {
      await restoreFailoverCase(api.recovery ?? api, plan, ownership);
      checkpoint({ phase: 'restored', plan, evidence, ownership });
    } catch (error) {
      checkpoint({ phase: 'recovery-required', plan, evidence, ownership });
      throw error;
    }
  }
  if (failure) throw failure;
  const restored = await api.get('/api/market-data/policy');
  evidence.restored = await readTimedSeries(api, primary, 0, restored.revision, clock);
  assertSeriesLatency(evidence.restored, 5000);
  checkpoint({ phase: 'verified', plan, evidence, ownership });
  return evidence;
}

async function main() {
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());
  const origin = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
  const api = createLocalApi(origin, fetch, controller.signal);
  const recoveryIndex = process.argv.indexOf('--recover');
  if (recoveryIndex !== -1) {
    assert(process.argv.includes('--authorized-recovery'), '恢复写操作需要本案例的明确授权');
    const record = JSON.parse(readFileSync(process.argv[recoveryIndex + 1], 'utf8'));
    assert(record.origin === origin, '恢复记录不属于当前 API 目标');
    await restoreFailoverCase(api.recovery, record.plan, record.ownership ?? {});
    console.log(JSON.stringify({ caseId: record.plan.caseId, recovery: 'restored' }));
    return;
  }
  const plan = await observeCase(api);
  if (!process.argv.includes('--execute')) {
    console.log(JSON.stringify({ mode: 'read-only-preview', origin, policyRevision: plan.baseline.revision,
      configVersion: plan.baselineConfigVersion, routeKey: plan.routeKey, primary: plan.primary, backup: plan.backup,
      symbol, window, impact: '临时增加 ETF qfq 腾讯备用，短暂停用全部 HiThink 产品能力，再原子恢复；需单独授权' }, null, 2));
    return;
  }
  assert(process.argv.includes(`--expected-policy=${plan.baseline.revision}`) &&
    process.argv.includes(`--expected-config=${plan.baselineConfigVersion}`), '执行必须固定已批准的政策/来源代次');
  const directory = mkdtempSync(join(tmpdir(), 'tl-route-failover-'));
  const journal = join(directory, 'recovery.json');
  const checkpoint = (record) => {
    writeFileSync(journal + '.next', JSON.stringify({ ...record, origin, observedAt: new Date().toISOString() }), { mode: 0o600 });
    renameSync(journal + '.next', journal);
  };
  console.log(JSON.stringify({ recoveryJournal: journal, caseId: plan.caseId }));
  const evidence = await executeCase(api, plan, checkpoint);
  console.log(JSON.stringify({ caseId: plan.caseId, evidence, recoveryJournal: journal }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
