import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { arenaLiveProtocolSchema } from '../../packages/schemas/dist/index.js';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';
import { isolatedHistoricalTools } from './arena-isolated-roundtrip.mjs';
import { createScopedReplayRuntime } from './arena-scoped-replay-runtime.mjs';
import { driveScopedReplay, scopedProtocolHash } from './arena-scoped-replay.mjs';

export function scopedReplayPacket(raw, apply = false) {
  const protocol = arenaLiveProtocolSchema.parse(raw.protocol);
  assert.equal(protocol.simulationPolicy, 'sampled-v1');
  assert.equal(protocol.market, 'CN', '本维护入口仅装配 CN 历史研究');
  assert.equal(protocol.entrants.length, 1, '本批只运行一个模型');
  assert(Number.isSafeInteger(raw.maxCalls) && raw.maxCalls > 0, '缺少有限调用预算');
  assert.equal(protocol.budget.requests, raw.maxCalls);
  assert.equal(protocol.entrants[0].budget.requests, raw.maxCalls);
  assert(Number.isSafeInteger(raw.maxRunSeconds) && raw.maxRunSeconds > 0, '缺少有限运行时限');
  assert(/^[a-f0-9]{64}$/u.test(raw.configurationFingerprint), '缺少精确模型准入指纹');
  assert(typeof raw.expectedProviderRevision === 'string' && Number.isFinite(Date.parse(raw.expectedProviderRevision)));
  if (apply) assert.equal(raw.executionAuthorized, true, '真实比赛和模型预算尚未授权');
  return { ...raw, protocol, protocolHash: scopedProtocolHash(protocol) };
}

async function main() {
  const args = process.argv.slice(2);
  const [mode, packetFile, outputDirectory] = ['plan', 'apply'].includes(args[0]) ? args : ['plan', ...args];
  assert(['plan', 'apply'].includes(mode) && packetFile, '用法：plan|apply <授权包> [私有回执目录]');
  const packet = scopedReplayPacket(JSON.parse(readFileSync(resolve(packetFile))), mode === 'apply');
  if (mode === 'plan') {
    console.log(JSON.stringify({ status: 'planned', protocol: packet.protocol, protocolHash: packet.protocolHash,
      maxCalls: packet.maxCalls, maxRunSeconds: packet.maxRunSeconds, executionAuthorized: packet.executionAuthorized === true,
      queueResumed: false, competitionOperations: 0, realModelCalls: 0 })); return;
  }
  assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '必须使用正式持锁维护入口');
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url))), output = resolve(outputDirectory ?? '');
  assert(output.startsWith(resolve(root, '.recovery-artifacts') + '/'), '回执目录必须属于私有恢复目录');
  const ownerFile = resolve(root, packet.queueOwnerReceipt ?? '');
  assert(ownerFile.startsWith(resolve(root, '.recovery-artifacts') + '/'), '缺少原暂停归属回执');
  const owner = JSON.parse(readFileSync(ownerFile));
  const infra = resolve(root, '../thesis-ledger-infra'), runtime = new DsaRuntimeRecovery(infra, resolve(infra, '.env')).runtime;
  const docker = args => runtime.dockerSync(args, { timeout: 30000 }).trim();
  assert(docker(['exec', 'thesis-ledger-dev-redis-1', 'redis-cli', '--raw', 'HGET', 'thesis-ledger:queue:v1:arena:live:meta', 'paused']) === '1', '共享队列未暂停');
  assert(docker(['exec', 'thesis-ledger-dev-redis-1', 'redis-cli', '--raw', 'GET', 'thesis-ledger:lock:v1:arena-maintenance-owner']) === owner.token, '原暂停归属已变化');
  const request = async (path, body) => {
    const response = await fetch('http://127.0.0.1:3000/api/v1' + path, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert(response.ok, '正式 API 失败：' + response.status); return response.json();
  };
  const binding = packet.protocol.entrants[0], provider = (await request('/ai/providers')).find(row => row.name === binding.providerId);
  assert.equal(provider?.updatedAt, packet.expectedProviderRevision, '提供方版本变化');
  const route = provider.executionRoutes.find(row => row.model === binding.model && row.contract.id === 'arena_live_research'
    && row.contract.version === 'arena-live-research-v6');
  assert(route?.readiness.state === 'ready' && route.liveValidation?.status === 'passed', '精确 v6 路由未就绪');
  assert.equal(route.readiness.configurationFingerprint, packet.configurationFingerprint);
  const catalog = await request('/arena-matches/catalog?kind=live&pageSize=25&search=' + encodeURIComponent(packet.protocol.title));
  assert(!catalog.items.some(row => row.title === packet.protocol.title), '同名维护比赛已存在，不重复创建');
  mkdirSync(output, { mode: 0o700 });
  const save = (name, value) => writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  save('intent.json', { at: new Date().toISOString(), packet });
  let created, receipt;
  try {
    created = await request('/arena-matches', packet.protocol); save('created.json', created);
    const draft = await request('/arena-matches/' + created.id);
    assert.equal(draft.state, 'draft');
    assert.equal(scopedProtocolHash(arenaLiveProtocolSchema.parse(draft.protocol)), packet.protocolHash);
    await request('/arena-matches/' + created.id + '/start', {});
    const scope = { matchId: created.id, protocol: packet.protocol, protocolHash: packet.protocolHash,
      maxCalls: packet.maxCalls, deadlineAt: Date.now() + packet.maxRunSeconds * 1000,
      configurationFingerprint: packet.configurationFingerprint, ownerToken: owner.token };
    const code = "import 'reflect-metadata';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';\n"
      + [scopedProtocolHash, driveScopedReplay, isolatedHistoricalTools, createScopedReplayRuntime].map(fn => fn.toString()).join('\n')
      + '\nconst scope=' + JSON.stringify(scope) + ';\nconst ports=await createScopedReplayRuntime(scope,isolatedHistoricalTools);\n'
      + "process.once('SIGTERM',ports.stop);process.once('SIGINT',ports.stop);try{console.log(JSON.stringify(await driveScopedReplay(scope,ports)));}finally{await ports.close();}";
    const raw = runtime.dockerSync(['exec', '-i', '-w', '/app/apps/server', 'thesis-ledger-dev-thesis-ledger-1',
      'node', '--input-type=module', '-'], { input: code, timeout: packet.maxRunSeconds * 1000 + 90000 });
    writeFileSync(resolve(output, 'runtime-output.log'), raw, { mode: 0o600, flag: 'wx' });
    receipt = JSON.parse(raw.trim().split('\n').at(-1));
  } catch (error) {
    receipt = { status: 'stopped', matchId: created?.id ?? null, reason: error.message, automaticRetries: 0 };
  } finally {
    if (created) {
      try { const current = await request('/arena-matches/' + created.id); if (current.state === 'running') await request('/arena-matches/' + created.id + '/pause', {}); }
      catch { receipt = { ...receipt, pauseUnconfirmed: true }; }
    }
    save('receipt.json', { ...receipt, at: new Date().toISOString(), queueResumed: false });
  }
  console.log(JSON.stringify(receipt));
  if (receipt.status !== 'caught_up' || receipt.pauseUnconfirmed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
