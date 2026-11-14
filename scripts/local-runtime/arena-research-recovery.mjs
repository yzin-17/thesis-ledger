import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { arenaLiveAccountSchema, arenaLiveDetailSchema } from '../../packages/schemas/dist/index.js';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const containers = ['thesis-ledger-dev-thesis-ledger-1', 'thesis-ledger-dev-backtest-worker-1'];
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/iu;

export function recoveryArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    assert(['--match', '--agent', '--confirm', '--output', '--max-wait-seconds', '--observe-cycle', '--apply', '--resume-paused'].includes(key), '未知参数');
    assert(!values.has(key), '参数不能重复');
    if (key === '--apply' || key === '--resume-paused') values.set(key, true);
    else { assert(args[index + 1] && !args[index + 1].startsWith('--'), '参数缺少值'); values.set(key, args[++index]); }
  }
  const match = values.get('--match'), agent = values.get('--agent');
  assert(uuid.test(match ?? '') && uuid.test(agent ?? ''), '必须指定比赛和参赛者 UUID');
  const apply = values.get('--apply') === true;
  const observeCycle = values.get('--observe-cycle');
  const resumePaused = values.get('--resume-paused') === true;
  assert(!resumePaused || !observeCycle, '观察既有周期不能同时恢复暂停比赛');
  if (observeCycle !== undefined) assert(uuid.test(observeCycle), '观察周期 UUID 无效');
  if (apply) assert.equal(values.get('--confirm'), `${match}/${agent}`, '恢复确认必须与精确对象一致');
  const seconds = Number(values.get('--max-wait-seconds') ?? 1800);
  assert(Number.isInteger(seconds) && seconds >= 30 && seconds <= 7200, '观察时长必须在 30–7200 秒之间');
  return { match, agent, apply, seconds, observeCycle, resumePaused,
    output: resolve(values.get('--output') ?? resolve(root, 'var/acceptance', `arena-research-${match}-${Date.now()}.json`)) };
}

function runtimeSnapshot() {
  return containers.map((name) => {
    const item = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8', timeout: 15000 }))[0];
    assert(item.State.Running && item.State.Health?.Status === 'healthy', '目标运行容器未就绪');
    return { name, id: item.Id, image: item.Image, startedAt: item.State.StartedAt };
  });
}

function deliverySnapshot() {
  const source = `const {RedisService,redisKey}=await import('./dist/src/platform/redis.service.js');
    const redis=new RedisService();try{await redis.ping();
      const paused=await redis.client.hget(redisKey('queue','arena')+':live:meta','paused');
      const owner=await redis.client.exists(redisKey('lock','arena-maintenance-owner'));
      console.log(JSON.stringify({paused:paused==='1',maintenanceOwned:owner===1}));
    }finally{await redis.onModuleDestroy();}`;
  const output = execFileSync('docker', ['exec', '-w', '/app/apps/server', containers[0],
    'node', '--input-type=module', '-e', source], { encoding: 'utf8', timeout: 15000 });
  const value = JSON.parse(output);
  assert(typeof value.paused === 'boolean' && typeof value.maintenanceOwned === 'boolean', '执行队列状态无效');
  return value;
}

async function request(path, body) {
  const response = await fetch(`http://127.0.0.1:3000/api/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert(response.ok, `业务接口失败：${response.status}`);
  const value = await response.json();
  return body === undefined ? arenaLiveDetailSchema.parse(value) : value;
}

const participant = (detail, id) => {
  const agent = detail.agents.find((item) => item.id === id);
  assert(agent, '参赛者不属于指定比赛');
  return agent;
};

export function verifyResearchCompletion(before, detail, agentId, cycle) {
  assert.equal(cycle.state, 'succeeded', '研究没有成功提交');
  const agent = participant(detail, agentId), old = participant(before, agentId);
  const previousIds = new Set(old.account.wakeups.map((item) => item.id));
  const businessAt = cycle.asOf ?? cycle.createdAt;
  const appointments = agent.account.wakeups.filter((item) => !previousIds.has(item.id)
    && Date.parse(item.createdAt) >= Date.parse(businessAt));
  assert(cycle.decision?.wakeups.length > 0 && appointments.length > 0, '没有生成新的观察预约');
  const calls = cycle.usage?.calls ?? [];
  const modelCalls = calls.filter((item) => Array.isArray(item.input?.messages));
  assert(modelCalls.length > 0 && modelCalls.every((item) => item.modelIdentity?.accepted === true), '模型身份未完整核验');
  assert(calls.every((item) => item.state === 'settled' && item.used !== null && item.used !== undefined), '调用用量没有完整结算');
  assert(agent.account.revision > old.account.revision, '账户没有提交新版本');
  return appointments;
}

export async function runRecovery(options, io = {}) {
  const read = io.request ?? request, runtime = io.runtime ?? runtimeSnapshot;
  const delivery = io.delivery ?? deliverySnapshot;
  const sleep = io.sleep ?? delay, now = io.now ?? Date.now;
  const locked = io.locked ?? (() => ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''));
  const log = io.log ?? ((value) => console.log(JSON.stringify(value)));
  const path = `/arena-matches/${options.match}`, initialRuntime = runtime();
  let before = await read(path);
  let agent = participant(before, options.agent);
  const report = { match: options.match, agent: options.agent, apply: options.apply, runtime: initialRuntime,
    initialState: agent.state, startedAt: new Date(now()).toISOString(), status: 'preview' };
  if (!options.apply) return report;
  assert(locked(), '真实恢复必须通过 infra 正式持锁入口执行');
  const pausedReport = (snapshot) => ({ ...report, status: 'delivery_paused', delivery: snapshot,
    note: '执行队列已由维护暂停；停止本次观察并释放锁，保留既有周期，不解除其他维护归属' });
  const initialDelivery = delivery();
  if (initialDelivery.paused) return pausedReport(initialDelivery);
  if (options.resumePaused && before.state === 'paused') {
    assert.equal(agent.state, 'needs_attention', '暂停比赛的参赛者当前无需恢复研究');
    assert(!agent.cycles.some((c) => ['pending', 'running', 'unknown_usage'].includes(c.state)), '存在活动或未知周期，不能启动恢复');
    const calls = agent.cycles[0]?.usage?.calls ?? [];
    assert(agent.cycles[0]?.state === 'failed' && calls.every((c) => c.state === 'settled' && c.used != null), '失败调用尚未完整结算');
    await read(`${path}/start`, {});
    before = await read(path); agent = participant(before, options.agent);
    report.resumed = true;
  }
  assert.equal(before.state, 'running', '比赛当前未运行');
  if (options.observeCycle) {
    const cycle = agent.cycles.find((item) => item.id === options.observeCycle);
    assert(cycle, '观察周期不属于指定参赛者');
    const call = cycle.usage?.calls?.find((item) => Array.isArray(item.input?.messages));
    const content = call?.input.messages.find((item) => item.role === 'user')?.content;
    assert(typeof content === 'string', '缺少原周期冻结账户，不能认证新预约');
    const frozen = JSON.parse(content);
    assert.equal(frozen.asOf, cycle.asOf, '冻结账户与观察周期时点不一致');
    const baseline = arenaLiveAccountSchema.pick({ revision: true, wakeups: true }).parse({
      revision: frozen.ownAccount?.revision, wakeups: frozen.ownAccount?.wakeups,
    });
    const account = { ...agent.account, ...baseline };
    before = { ...before, agents: before.agents.map((item) => item.id === options.agent ? { ...item, account } : item) };
    report.observedCycle = options.observeCycle;
  } else {
    assert.equal(agent.state, 'needs_attention', '参赛者当前无需恢复');
    assert(!agent.cycles.some((cycle) => ['pending', 'running'].includes(cycle.state)), '已有活动周期，不能重复恢复');
    await read(`${path}/agents/${options.agent}/retry`, {});
  }
  const previousCycles = new Set(agent.cycles.filter((item) => item.id !== options.observeCycle).map((item) => item.id));
  const deadline = now() + options.seconds * 1000;
  let nextProgress = 0;
  while (now() < deadline) {
    assert(locked(), '稳定运行窗口的更新锁已丢失');
    assert.deepEqual(runtime(), initialRuntime, '运行容器已变化，本轮不认证为稳定窗口');
    const currentDelivery = delivery();
    if (currentDelivery.paused) return pausedReport(currentDelivery);
    const detail = await read(path), current = participant(detail, options.agent);
    const cycle = options.observeCycle
      ? current.cycles.find((item) => item.id === options.observeCycle)
      : current.cycles.findLast((item) => !previousCycles.has(item.id));
    if (cycle && !['pending', 'running'].includes(cycle.state)) {
      Object.assign(report, { status: cycle.state, cycleId: cycle.id, reason: cycle.reason,
        completedAt: cycle.completedAt, usage: cycle.usage });
      if (cycle.state === 'succeeded') report.appointments = verifyResearchCompletion(before, detail, options.agent, cycle);
      return report;
    }
    if (now() >= nextProgress) {
      const calls = cycle?.usage?.calls ?? [];
      log({ status: current.state, cycleId: cycle?.id, calls: calls.length,
        lastCallState: calls.at(-1)?.state, tools: cycle?.usage?.tools?.length ?? 0 });
      nextProgress = now() + 60000;
    }
    await sleep(30000);
  }
  return { ...report, status: 'observation_timeout', note: '仅停止观察，未取消在途研究或再次投递' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = recoveryArguments(process.argv.slice(2));
  let report;
  try { report = await runRecovery(options); }
  catch (error) { report = { status: 'verification_failed', match: options.match, agent: options.agent,
    reason: error instanceof Error ? error.message : String(error) }; }
  mkdirSync(dirname(options.output), { recursive: true, mode: 0o700 });
  writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, cycleId: report.cycleId, output: options.output,
    appointments: report.appointments?.length ?? 0 }));
  if (options.apply && report.status !== 'succeeded') process.exitCode = 1;
}
