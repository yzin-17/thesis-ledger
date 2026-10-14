import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { localOrigin } from './market-status-functional-acceptance.mjs';
import { createEpochCase, epochRequests, executeEpochCase, resumeEpochCase } from './market-status-epoch-case.mjs';

async function main() {
  const args = process.argv.slice(2);
  const origin = localOrigin(process.env.SERVER_ORIGIN ?? 'http://127.0.0.1:3000');
  const headers = { 'content-type': 'application/json' };
  if (process.env.SERVER_API_TOKEN) headers.authorization = `Bearer ${process.env.SERVER_API_TOKEN}`;
  async function request(method, endpoint, body) {
    const response = await fetch(origin + endpoint, { method, headers, signal: AbortSignal.timeout(10000),
      body: body === undefined ? undefined : JSON.stringify(body) });
    assert(response.ok, `原 Server API 拒绝请求：${response.status}`);
    return response.json();
  }
  const api = { get: (endpoint) => request('GET', endpoint), put: (endpoint, body) => request('PUT', endpoint, body) };
  let plan = createEpochCase(await api.get('/api/market-data/policy'), (await api.get('/api/market-data/providers')).providers,
    await api.get('/api/market-data/routes/capabilities?contractVersion=3'));
  const resumedFrom = args.find((arg) => arg.startsWith('--resume-case='))?.slice('--resume-case='.length);
  if (resumedFrom) {
    const record = JSON.parse(await fs.readFile(resumedFrom, 'utf8'));
    assert(record.origin === origin, '继续案例目标地址不同');
    plan = resumeEpochCase(plan, record);
  }
  if (!args.includes('--execute')) {
    console.log(JSON.stringify({ mode: 'read-only-preview', expectedPolicy: plan.baseline.revision,
      additions: plan.policies[0].routes.slice(plan.baseline.routes.length), requests: epochRequests(plan),
      stages: ['同源共享获取和一次隔离主源失败', '只关闭状态功能并读取粗ST', '恢复状态功能并验证新代次获取'],
      restoreRevision: plan.policies.at(-1).revision + 1 }));
    return;
  }
  assert(args.includes('--authorized-epoch-case'), '实际执行需要本案例单独授权');
  const expected = Number(args.find((arg) => arg.startsWith('--expected-policy='))?.split('=')[1]);
  assert(expected === plan.baseline.revision, '政策版本已变化，需要重新核对授权范围');
  const driver = await fs.readFile(new URL('./market-status-epoch-driver.mjs', import.meta.url), 'utf8');
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'tl-status-epoch-'));
  const destination = path.join(directory, 'recovery.json');
  const journal = async (record) => {
    await fs.writeFile(destination + '.tmp', JSON.stringify({ origin, attempt: resumedFrom ? 2 : 1, resumedFrom, ...record }, null, 2), { mode: 0o600 });
    await fs.rename(destination + '.tmp', destination);
  };
  console.log(`恢复记录：${destination}`);
  const read = async (stage, requests) => {
    const result = spawnSync('docker', ['exec', '-i', '-w', '/app', 'thesis-ledger-dev-thesis-ledger-1', 'node', '--input-type=module', '-e', driver],
      { input: JSON.stringify({ stage, requests }), encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
    const failures = result.stdout.split('\n').filter((line) => line.startsWith('EPOCH_FAILURE='));
    if (failures.length === 1) console.error(failures[0]);
    assert(result.status === 0, '原 DsaClient 验收未通过；不输出环境或 SDK 原文');
    const rows = result.stdout.split('\n').filter((line) => line.startsWith('EPOCH_RESULTS='));
    assert(rows.length === 1, '缺少目标证明');
    return JSON.parse(rows[0].slice('EPOCH_RESULTS='.length));
  };
  console.log(JSON.stringify(await executeEpochCase(api, plan, journal, read)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('验收未完成，请核对恢复记录；并行修改或提交不明时不覆盖当前政策。'); process.exitCode = 1; });
}
