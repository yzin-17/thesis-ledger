import assert from 'node:assert/strict';
import { test } from 'node:test';
import { driveScopedReplay, scopedProtocolHash } from './arena-scoped-replay.mjs';
import { scopedReplayPacket, assertScopedReplayRoute, scopedReplayResume } from './run-arena-scoped-replay.mjs';

const matchId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const budget = { requests: 2, tokens: null, costMicros: null };
const protocol = { version: 'arena-live-match-protocol-v1', title: '受控全市场回放', market: 'CN', currency: 'CNY', calendarId: 'CN',
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

function liveHarness() {
  const h = harness(); h.scope.completeLiveCycle = true;
  h.state.successfulLiveCycles = [];
  h.ports.prepareLive = async id => {
    assert.equal(id, matchId); h.events.push('prepare-live');
    h.state.pending = [{ ...cycle, id: 'live-cycle' }];
  };
  const executeReplay = h.ports.execute;
  h.ports.execute = async delivery => {
    if (delivery.id !== 'live-cycle') return executeReplay(delivery);
    assert.equal(delivery.attempt, 1); h.events.push('execute-live');
    h.state.pending = []; h.state.remainingRequests--;
    h.state.successfulLiveCycles.push(delivery.id);
  };
  h.ports.captureLive = async id => {
    assert.equal(id, matchId); h.events.push('capture-live'); return { matchId: id, cash: '100000' };
  };
  return h;
}

test('显式授权后追平并在同一比赛提交一次实时研究，再保存结果与暂停', async () => {
  const h = liveHarness(), result = await driveScopedReplay(h.scope, h.ports);
  assert.equal(result.status, 'completed'); assert.equal(result.reason, 'live_cycle_completed');
  assert.deepEqual(result.liveEvidence, { matchId, cash: '100000' });
  assert.equal(result.cyclesAttempted, 2);
  assert.equal(h.events.filter(x => x === 'prepare-live').length, 1);
  assert.equal(h.events.filter(x => x === 'execute-live').length, 1);
  assert(h.events.indexOf('execute-live') < h.events.indexOf('capture-live'));
  assert.equal(h.events.at(-1), 'pause'); h.preserved();
});

test('进入实时前耗尽预算不创建新的实时研究', async () => {
  const h = liveHarness(); h.state.timeline.phase = 'live'; h.state.remainingRequests = 0;
  const result = await driveScopedReplay(h.scope, h.ports);
  assert.equal(result.reason, 'budget_exhausted'); assert(!h.events.includes('prepare-live')); h.preserved();
});

test('实时触发未形成待办时停止，不轮询或反复触发', async () => {
  const h = liveHarness(); h.state.timeline.phase = 'live';
  h.ports.prepareLive = async () => { h.events.push('prepare-live'); };
  const result = await driveScopedReplay(h.scope, h.ports);
  assert.equal(result.reason, 'live_cycle_not_completed');
  assert.equal(h.events.filter(x => x === 'prepare-live').length, 1);
  assert(!h.events.includes('execute-live')); assert(!h.events.includes('capture-live')); h.preserved();
});

test('实时研究失败或未提交均不当作实时完成，也不追加研究', async () => {
  for (const failure of [null, 'model_output_invalid']) {
    const h = liveHarness(); h.state.timeline.phase = 'live';
    h.ports.execute = async () => { h.events.push('execute-live'); h.state.pending = []; h.state.failure = failure; };
    const result = await driveScopedReplay(h.scope, h.ports);
    assert.equal(result.status, 'stopped'); assert.equal(result.reason, failure ?? 'live_cycle_not_completed');
    assert.equal(h.events.filter(x => x === 'execute-live').length, 1);
    assert(!h.events.includes('capture-live')); assert.equal(h.events.at(-1), 'pause'); h.preserved();
  }
});

test('其他成功周期不能替代本次实时提交', async () => {
  const h = liveHarness(); h.state.timeline.phase = 'live';
  h.ports.execute = async () => { h.state.pending = []; h.state.successfulLiveCycles.push('other-live-cycle'); };
  const result = await driveScopedReplay(h.scope, h.ports);
  assert.equal(result.status, 'stopped'); assert(!h.events.includes('capture-live')); h.preserved();
});

test('实时账户结果读取失败仍暂停，不标记完成', async () => {
  const h = liveHarness();
  h.ports.captureLive = async () => { throw new Error('valuation_unavailable'); };
  await assert.rejects(driveScopedReplay(h.scope, h.ports), /valuation_unavailable/u);
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
  assert.throws(() => scopedReplayPacket({ ...packet, completeLiveCycle: 'true' }), /实时范围/u);
  assert.equal(scopedReplayPacket({ ...packet, completeLiveCycle: true }).completeLiveCycle, true);
  assert.equal(scopedReplayPacket({ ...packet, configurationFingerprint: null }).configurationFingerprint, null);
  assert.throws(() => scopedReplayPacket({ ...packet, executionAuthorized: true, configurationFingerprint: null }, true), /准入指纹/u);
  assert.equal(scopedReplayPacket({ ...packet, executionAuthorized: true }, true).maxCalls, 2);
});

test('执行包使用目标 Schema 的规范化结果，宿主的并行合同不改写目标协议', () => {
  const targetProtocol = { ...protocol, version: 2 };
  const packet = { protocol: targetProtocol, maxCalls: 2, maxRunSeconds: 1800,
    expectedProviderRevision: '2026-11-23T00:00:00Z', configurationFingerprint: 'a'.repeat(64) };
  const parsed = scopedReplayPacket(packet, false, value => {
    assert.deepEqual(value, targetProtocol);
    return { ...value, initialCash: '100000' };
  });
  assert.equal(parsed.protocol.version, 2);
  assert.equal(parsed.protocol.initialCash, '100000');
  assert.equal(parsed.protocolHash, scopedProtocolHash(parsed.protocol));
  assert.throws(() => scopedReplayPacket(packet, false, () => { throw new Error('目标拒绝'); }), /目标拒绝/u);
});

test('已通过付费用途仅因公开摘要未携带预算而阻止时可进入严格执行核验', () => {
  const fingerprint = 'a'.repeat(64);
  const route = { readiness: { state: 'blocked', reasons: ['budget_not_authorized'],
    configurationFingerprint: fingerprint }, liveValidation: { status: 'passed' } };
  assert.doesNotThrow(() => assertScopedReplayRoute(route, fingerprint));
  assert.doesNotThrow(() => assertScopedReplayRoute({ ...route,
    readiness: { ...route.readiness, state: 'ready', reasons: [] } }, fingerprint));
});

test('付费摘要不能遮蔽来源外的路由配置、资格及指纹拒绝', () => {
  const fingerprint = 'a'.repeat(64);
  const route = { readiness: { state: 'blocked', reasons: ['budget_not_authorized'],
    configurationFingerprint: fingerprint }, liveValidation: { status: 'passed' } };
  for (const reasons of [[], ['pricing_unknown'], ['budget_not_authorized', 'validation_missing']])
    assert.throws(() => assertScopedReplayRoute({ ...route,
      readiness: { ...route.readiness, reasons } }, fingerprint));
  assert.throws(() => assertScopedReplayRoute({ ...route, liveValidation: { status: 'failed' } }, fingerprint));
  assert.throws(() => assertScopedReplayRoute(route, 'b'.repeat(64)), /配置变化/u);
  assert.throws(() => assertScopedReplayRoute(undefined, fingerprint));
});


test('显式网络恢复使用新周期，原未知记录保留且费用不返还', async () => {
  const h = harness(); h.scope.maxNetworkRecoveries = 3;
  h.state.failure = 'unknown_usage'; h.state.recoveryEligible = true; h.state.failedCycleId = 'failed-original';
  const originalFailure = { id: 'failed-original', state: 'unknown_usage', reserved: 12557 };
  h.ports.recover = async (id, cycleId) => {
    assert.equal(id, matchId); assert.equal(cycleId, originalFailure.id);
    h.events.push('recover'); h.state.failure = null;
  };
  const result = await driveScopedReplay(h.scope, h.ports);
  assert.equal(result.status, 'caught_up'); assert.deepEqual(result.recoveries, ['failed-original']);
  assert.equal(originalFailure.state, 'unknown_usage'); assert.equal(originalFailure.reserved, 12557);
  assert.equal(h.events.filter(x => x === 'execute').length, 1); h.preserved();
});

test('网络恢复在同一业务时点总计最多三次执行', async () => {
  const h = harness(); h.scope.maxNetworkRecoveries = 100;
  h.state.failure = 'unknown_usage'; h.state.recoveryEligible = true; h.state.failedCycleId = 'failed-1';
  h.ports.recover = async () => { h.events.push('recover'); h.state.failedCycleId += '-next'; };
  const result = await driveScopedReplay(h.scope, h.ports);
  assert.equal(result.reason, 'network_recovery_limit');
  assert.equal(h.events.filter(x => x === 'recover').length, 2); h.preserved();
});

test('非网络错误与耗尽预算不进入观察恢复', async () => {
  for (const eligible of [false, true]) {
    const h = harness(); h.scope.maxNetworkRecoveries = 100;
    h.state.failure = 'unknown_usage'; h.state.recoveryEligible = eligible;
    if (eligible) h.state.remainingRequests = 0;
    h.ports.recover = async () => assert.fail('不应恢复');
    const result = await driveScopedReplay(h.scope, h.ports);
    assert.equal(result.status, 'stopped'); h.preserved();
  }
});


test('网络组续行保持比赛、协议及总预算，承接全部已消耗的恢复次数', () => {
  const packet = { protocolHash: 'fixed', maxCalls: 18000 };
  const prior = { intent: { packet }, created: { id: matchId },
    receipt: { matchId, reason: 'network_recovery_limit', status: 'stopped', recoveries: [otherId] } };
  assert.deepEqual(scopedReplayResume(packet, prior), { created: { id: matchId }, recovered: [otherId] });
  assert.throws(() => scopedReplayResume({ ...packet, maxCalls: 20000 }, prior));
  assert.throws(() => scopedReplayResume({ ...packet, protocolHash: 'changed' }, prior));
  assert.throws(() => scopedReplayResume(packet, { ...prior, receipt: { ...prior.receipt, reason: 'unknown_usage' } }));
});
