import assert from 'node:assert/strict';
import { test } from 'node:test';
import { driveScopedReplay, scopedProtocolHash } from './arena-scoped-replay.mjs';
import { scopedReplayPacket } from './run-arena-scoped-replay.mjs';

const matchId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const budget = { requests: 2, tokens: null, costMicros: null };
const protocol = { version: 2, title: '受控全市场回放', market: 'CN', currency: 'CNY', calendarId: 'CN',
  timeZone: 'Asia/Shanghai', startsOn: '2026-11-02', endsOn: null, universe: 'market', simulationPolicy: 'sampled-v1',
  entrants: [{ providerId: 'controlled', model: 'kept', budget }], budget, benchmarks: ['cash'], maxInfrastructureAttempts: 3 };
const cycle = { id: 'new-cycle', matchId, state: 'pending', attempt: 0, requestId: null };

function harness() {
  let clock = 1;
  const state = { id: matchId, state: 'running', protocol: structuredClone(protocol), remainingRequests: 2,
    timeline: { phase: 'replay', status: 'ready', cursorAt: 'before' }, pending: [], attention: null };
  const old = { matchId: otherId, state: 'running', pending: [{ id: 'old-cycle', state: 'pending' }] };
  const original = structuredClone(old), events = [];
  const scope = { matchId, maxCalls: 2, protocolHash: scopedProtocolHash(protocol), deadlineAt: 100 };
  const ports = { now: () => clock, guard: async () => { events.push('guard'); },
    snapshot: async id => { assert.equal(id, matchId); return structuredClone(state); },
    advance: async id => {
      assert.equal(id, matchId); events.push('advance');
      if (state.timeline.cursorAt === 'before') { state.timeline.cursorAt = 'first'; state.pending = [structuredClone(cycle)]; }
      else state.timeline.phase = 'live';
    },
    execute: async delivery => {
      assert.deepEqual(delivery, { id: 'new-cycle', attempt: 1 }); events.push('execute');
      state.pending = []; state.remainingRequests--;
    },
    pause: async id => { assert.equal(id, matchId); events.push('pause'); state.state = 'paused'; },
  };
  return { scope, ports, state, old, events, advanceClock: () => { clock = 100; },
    preserved: () => assert.deepEqual(old, original) };
}

test('新旧待办并存时只执行新周期，进入实时后只暂停新比赛', async () => {
  const h = harness(), result = await driveScopedReplay(h.scope, h.ports);
  assert.equal(result.status, 'caught_up'); assert.equal(result.reason, 'replay_caught_up');
  assert.equal(h.events.filter(x => x === 'execute').length, 1);
  assert.equal(h.events.at(-1), 'pause'); h.preserved();
});

for (const variant of ['foreign_match', 'protocol_changed', 'budget_changed']) test('首读拒绝未授权范围：' + variant, async () => {
  const h = harness();
  if (variant === 'foreign_match') h.state.id = otherId;
  else if (variant === 'protocol_changed') h.state.protocol.title = '其他协议';
  else h.scope.maxCalls = 1;
  await assert.rejects(driveScopedReplay(h.scope, h.ports));
  assert(!h.events.includes('execute')); assert(!h.events.includes('pause')); h.preserved();
});

for (const variant of ['foreign_cycle', 'already_attempted', 'already_sent']) test('不接管其他或既有研究：' + variant, async () => {
  const h = harness(); h.state.pending = [structuredClone(cycle)];
  if (variant === 'foreign_cycle') h.state.pending[0].matchId = otherId;
  else if (variant === 'already_attempted') h.state.pending[0].attempt = 1;
  else h.state.pending[0].requestId = 'existing-request';
  await assert.rejects(driveScopedReplay(h.scope, h.ports));
  assert(!h.events.includes('execute')); assert.equal(h.events.at(-1), 'pause'); h.preserved();
});

test('周期结果未知后立即停止且不再次领取', async () => {
  const h = harness(); h.state.pending = [cycle];
  h.ports.execute = async () => { h.events.push('execute'); throw new Error('unknown_usage'); };
  await assert.rejects(driveScopedReplay(h.scope, h.ports), /unknown_usage/u);
  assert.equal(h.events.filter(x => x === 'execute').length, 1); assert.equal(h.events.at(-1), 'pause'); h.preserved();
});

test('提交后仍返回原周期时拒绝再次执行', async () => {
  const h = harness(); h.state.pending = [cycle];
  h.ports.execute = async () => { h.events.push('execute'); };
  await assert.rejects(driveScopedReplay(h.scope, h.ports), /禁止重试/u);
  assert.equal(h.events.filter(x => x === 'execute').length, 1); h.preserved();
});

test('一个研究周期耗尽预算后不领取下一周期', async () => {
  const h = harness(); h.state.pending = [cycle];
  h.ports.execute = async () => {
    h.events.push('execute'); h.state.remainingRequests = 0;
    h.state.pending = [{ ...cycle, id: 'later-cycle' }];
  };
  const result = await driveScopedReplay(h.scope, h.ports);
  assert.equal(result.reason, 'budget_exhausted');
  assert.equal(h.events.filter(x => x === 'execute').length, 1); h.preserved();
});

test('失败周期即使留下 waiting 状态和后续预约也不自动继续', async () => {
  const h = harness();
  h.state.failure = 'model_output_invalid'; h.state.attention = null;
  h.state.pending = [{ ...cycle, id: 'later-appointment' }];
  const result = await driveScopedReplay(h.scope, h.ports);
  assert.equal(result.reason, 'model_output_invalid');
  assert(!h.events.includes('execute')); assert.equal(h.events.at(-1), 'pause'); h.preserved();
});

for (const variant of ['budget', 'blocked', 'attention', 'deadline', 'operator_stop']) test('停止边界：' + variant, async () => {
  const h = harness();
  if (variant === 'budget') h.state.remainingRequests = 0;
  else if (variant === 'blocked') { h.state.timeline.status = 'blocked'; h.state.timeline.reason = 'source_missing'; }
  else if (variant === 'attention') h.state.attention = 'model_output_invalid';
  else if (variant === 'operator_stop') {
    h.ports.stopped = () => h.events.includes('advance');
  } else h.ports.advance = async () => { h.events.push('advance'); h.advanceClock(); h.state.timeline.cursorAt = 'next'; };
  const result = await driveScopedReplay(h.scope, h.ports);
  assert.equal(result.status, 'stopped'); assert(!h.events.includes('execute')); h.preserved();
});

test('推进没有进展时停止，不重复轮询或重试', async () => {
  const h = harness(); h.ports.advance = async () => { h.events.push('advance'); };
  const result = await driveScopedReplay(h.scope, h.ports);
  assert.equal(result.reason, 'replay_no_progress'); assert.equal(h.events.filter(x => x === 'advance').length, 1);
});

test('原共享暂停归属丢失时不执行下一周期', async () => {
  const h = harness(); h.state.pending = [cycle]; let checks = 0;
  h.ports.guard = async () => { if (++checks === 2) throw new Error('owner_changed'); };
  await assert.rejects(driveScopedReplay(h.scope, h.ports), /owner_changed/u);
  assert(!h.events.includes('execute')); assert.equal(h.events.at(-1), 'pause'); h.preserved();
});

test('JSONB 键顺序不改变协议指纹', () => {
  assert.equal(scopedProtocolHash({ a: { y: 2, x: 1 }, z: [1, 2] }), scopedProtocolHash({ z: [1, 2], a: { x: 1, y: 2 } }));
});

test('默认仅预览；真实模式要求明确授权、有限预算和时限', () => {
  const packet = { protocol, maxCalls: 2, maxRunSeconds: 1800, executionAuthorized: false,
    expectedProviderRevision: '2026-11-23T00:00:00Z', configurationFingerprint: 'a'.repeat(64) };
  assert.equal(scopedReplayPacket(packet).protocol.universe, 'market');
  assert.throws(() => scopedReplayPacket(packet, true), /尚未授权/u);
  assert.throws(() => scopedReplayPacket({ ...packet, maxCalls: null }));
  assert.throws(() => scopedReplayPacket({ ...packet, maxRunSeconds: null }));
  assert.throws(() => scopedReplayPacket({ ...packet, configurationFingerprint: '' }));
  assert.equal(scopedReplayPacket({ ...packet, executionAuthorized: true }, true).maxCalls, 2);
});
