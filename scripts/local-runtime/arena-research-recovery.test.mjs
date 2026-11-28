import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recoveryArguments, runRecovery, verifyResearchCompletion } from './arena-research-recovery.mjs';

const match = '91d6e8f0-fcef-4801-ab09-f9c90110479f', agent = '72c317b0-7a36-431b-9237-a241ee30bcdb';
const base = () => ({ state: 'running', agents: [{ id: agent, state: 'needs_attention', cycles: [],
  account: { revision: 1, cash: '100000', positions: [], cashSettlements: [], orders: [],
    watchedSymbols: [], fills: [], wakeups: [] } }] });
const options = { match, agent, apply: true, seconds: 30 };
const io = (request, extra = {}) => ({ request, runtime: () => [{ startedAt: 'stable' }], locked: () => true,
  delivery: () => ({ paused: false, maintenanceOwned: false }),
  now: () => 1, sleep: async () => {}, log: () => {}, ...extra });

test('默认预览、精确确认和观察时长校验', () => {
  assert.equal(recoveryArguments(['--match', match, '--agent', agent]).apply, false);
  assert.throws(() => recoveryArguments(['--match', match, '--agent', agent, '--apply']), /精确对象/);
  assert.throws(() => recoveryArguments(['--match', match, '--agent', agent, '--max-wait-seconds', '0']));
  assert.equal(recoveryArguments(['--match', match, '--agent', agent, '--resume-paused']).resumePaused, true);
  assert.throws(() => recoveryArguments(['--match', match, '--agent', agent, '--resume-paused', '--observe-cycle', match]), /不能同时/);
});
test('暂停恢复必须显式指定，已知失败调用结算后只启动与恢复各一次', async () => {
  const paused = base(); paused.state = 'paused';
  paused.agents[0].cycles = [{ id: 'old', state: 'failed', usage: { calls: [{ state: 'settled', used: { tokens: 5 } }] } }];
  const actions = []; let started = false, retried = false;
  const request = async (path, body) => {
    if (body) { actions.push(path); if (path.endsWith('/start')) started = true; else retried = true; return {}; }
    const d = structuredClone(paused); if (started) d.state = 'running';
    if (retried) d.agents[0].cycles.unshift({ id: 'new', state: 'failed', reason: 'model_output_invalid' });
    return d;
  };
  await assert.rejects(runRecovery(options, io(request)), /比赛当前未运行/);
  assert.deepEqual(actions, []);
  const report = await runRecovery({ ...options, resumePaused: true }, io(request));
  assert.equal(report.resumed, true); assert.equal(report.status, 'failed');
  assert.deepEqual(actions, [`/arena-matches/${match}/start`, `/arena-matches/${match}/agents/${agent}/retry`]);
});
test('未知或未结算结果不能自动启动暂停比赛', async () => {
  for (const state of ['unknown_usage', 'reserved']) {
    const d = base(); d.state = 'paused';
    d.agents[0].cycles = [{ id: 'old', state: state === 'unknown_usage' ? state : 'failed', usage: { calls: [{ state, used: null }] } }];
    let writes = 0;
    await assert.rejects(runRecovery({ ...options, resumePaused: true }, io(async (_, body) => { if (body) writes++; return d; })));
    assert.equal(writes, 0);
  }
});
test('无正式锁或已有活动周期时不能发起恢复', async () => {
  let writes = 0;
  const request = async (_, body) => { if (body) writes++; return base(); };
  await assert.rejects(runRecovery(options, io(request, { locked: () => false })), /正式持锁/);
  const active = base(); active.agents[0].cycles = [{ id: 'existing', state: 'running' }];
  await assert.rejects(runRecovery(options, io(async (_, body) => { if (body) writes++; return active; })), /活动周期/);
  assert.equal(writes, 0);
});
test('其他维护暂停执行队列时不启动比赛或重投，也不占用观察窗口', async () => {
  let writes = 0;
  const report = await runRecovery({ ...options, resumePaused: true }, io(async (_, body) => {
    if (body) writes++;
    return { ...base(), state: 'paused' };
  }, { delivery: () => ({ paused: true, maintenanceOwned: true }),
    sleep: async () => { throw Error('不应等待维护队列'); } }));
  assert.equal(report.status, 'delivery_paused');
  assert.equal(report.delivery.maintenanceOwned, true);
  assert.equal(writes, 0);
});
test('恢复后队列被维护暂停时只结束观察并保留已投递周期', async () => {
  const actions = []; let checks = 0;
  const report = await runRecovery(options, io(async (path, body) => {
    if (body) actions.push(path);
    return base();
  }, { delivery: () => ({ paused: checks++ > 0, maintenanceOwned: true }),
    sleep: async () => { throw Error('不应等待维护队列'); } }));
  assert.equal(report.status, 'delivery_paused');
  assert.deepEqual(actions, [`/arena-matches/${match}/agents/${agent}/retry`]);
});
test('失败终态只恢复一次并保留诊断；容器启动改变时拒绝验收', async () => {
  let reads = 0, writes = 0;
  const request = async (_, body) => {
    if (body) { writes++; return {}; }
    const d = base();
    if (reads++) d.agents[0].cycles = [{ id: 'new', state: 'failed', reason: 'model_output_invalid', usage: { calls: [] } }];
    return d;
  };
  assert.equal((await runRecovery(options, io(request))).status, 'failed'); assert.equal(writes, 1);
  let snapshots = 0;
  await assert.rejects(runRecovery(options, io(async () => base(), {
    runtime: () => [{ startedAt: String(snapshots++) }],
  })), /运行容器已变化/);
});
test('成功必须同时存在新预约、模型身份、实际用量和账户提交', () => {
  const before = base(), detail = base();
  const appointment = { id: 'next', createdAt: '2026-11-13T00:00:01Z', condition: { kind: 'fill', symbol: null } };
  detail.agents[0].account = { revision: 2, wakeups: [appointment] };
  const cycle = { state: 'succeeded', createdAt: '2026-11-13T00:00:00Z', decision: { wakeups: [appointment.condition] },
    usage: { calls: [{ input: { messages: [] }, modelIdentity: { accepted: true }, state: 'settled', used: { tokens: 5 } }] } };
  assert.deepEqual(verifyResearchCompletion(before, detail, agent, cycle), [appointment]);
  cycle.usage.calls[0].used = null;
  assert.throws(() => verifyResearchCompletion(before, detail, agent, cycle), /用量/);
  cycle.usage.calls[0].used = { tokens: 5 }; cycle.usage.calls[0].modelIdentity.accepted = false;
  assert.throws(() => verifyResearchCompletion(before, detail, agent, cycle), /模型身份/);
});
test('历史预约按冻结业务时点核验，不能与当前真实创建时间比较', () => {
  const before = base(), detail = base(), asOf = '2026-11-03T02:45:00.000Z';
  const appointment = { id: 'historical-next', createdAt: asOf, condition: { kind: 'time', at: '2026-11-03T03:00:00.000Z' } };
  detail.agents[0].account = { revision: 2, wakeups: [appointment] };
  const cycle = { state: 'succeeded', asOf, createdAt: '2026-11-14T06:00:00.000Z', decision: { wakeups: [appointment.condition] },
    usage: { calls: [{ input: { messages: [] }, modelIdentity: { accepted: true }, state: 'settled', used: { tokens: 5 } }] } };
  assert.deepEqual(verifyResearchCompletion(before, detail, agent, cycle), [appointment]);
  appointment.createdAt = '2026-11-03T02:44:00.000Z';
  assert.throws(() => verifyResearchCompletion(before, detail, agent, cycle), /新的观察预约/);
});
test('观察超时仅结束观察，不能取消研究或再次恢复', async () => {
  let time = 0;
  const actions = [];
  const report = await runRecovery(options, io(async (path, body) => {
    if (body) actions.push(path);
    return base();
  }, { now: () => time, sleep: async () => { time += 30000; } }));
  assert.equal(report.status, 'observation_timeout');
  assert.deepEqual(actions, [`/arena-matches/${match}/agents/${agent}/retry`]);
});
test('观察既有周期使用原冻结账户且绝不补发研究', async () => {
  const d = base(), asOf = '2026-11-13T00:00:00.000Z';
  d.agents[0].state = 'researching';
  d.agents[0].cycles = [{ id: 'existing', asOf, state: 'failed', reason: 'model_output_invalid', usage: { calls: [
    { input: { messages: [{ role: 'user', content: JSON.stringify({ asOf, ownAccount: d.agents[0].account }) }] } },
  ] } }];
  const actions = [];
  const report = await runRecovery({ ...options, observeCycle: 'existing' }, io(async (path, body) => {
    if (body) actions.push(path);
    return { ...d, agents: [{ ...d.agents[0], cycles: [{ id: 'later', state: 'running' }, ...d.agents[0].cycles] }] };
  }));
  assert.equal(report.status, 'failed'); assert.equal(report.cycleId, 'existing');
  assert.deepEqual(actions, []);
});
