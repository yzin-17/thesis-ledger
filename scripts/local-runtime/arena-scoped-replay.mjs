import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function scopedProtocolHash(protocol) {
  const ordered = value => Array.isArray(value) ? value.map(ordered)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify(ordered(protocol))).digest('hex');
}

/** 只驱动已创建的新比赛；不启动全局调度、队列或周期恢复。 */
export async function driveScopedReplay(scope, ports) {
  assert(/^[0-9a-f-]{36}$/iu.test(scope.matchId), '缺少新比赛标识');
  assert(Number.isSafeInteger(scope.maxCalls) && scope.maxCalls > 0, '必须设置本次调用上限');
  assert(Number.isFinite(scope.deadlineAt) && scope.deadlineAt > ports.now(), '运行时限已过');
  const attempted = new Set();
  let reason = 'stopped';
  let ownsMatch = false;
  try {
    while (ports.now() < scope.deadlineAt) {
      if (ports.stopped?.()) { reason = 'operator_stop'; break; }
      await ports.guard();
      const state = await ports.snapshot(scope.matchId);
      assert.equal(state.id, scope.matchId, '读取了其他比赛');
      assert.equal(scopedProtocolHash(state.protocol), scope.protocolHash, '新比赛协议变化');
      assert.equal(state.protocol.simulationPolicy, 'sampled-v1');
      assert.equal(state.protocol.budget.requests, scope.maxCalls, '调用预算与授权不符');
      assert(state.protocol.entrants.every(row => row.budget.requests === scope.maxCalls), '模型预算与授权不符');
      ownsMatch = true;
      if (state.state !== 'running') return { status: 'stopped', reason: state.state, matchId: scope.matchId };
      if (state.failure) { reason = state.failure; break; }
      if (state.timeline?.phase === 'live') { reason = 'replay_caught_up'; break; }
      if (state.timeline?.status === 'blocked' || state.attention) { reason = state.timeline?.reason ?? state.attention ?? 'replay_blocked'; break; }
      if (state.remainingRequests === 0) { reason = 'budget_exhausted'; break; }
      assert(Number.isSafeInteger(state.remainingRequests) && state.remainingRequests > 0 && state.remainingRequests <= scope.maxCalls,
        '剩余预算无效');
      assert(state.pending.length <= 1, '本入口只支持一个参赛模型的一条待办');
      const cycle = state.pending[0];
      if (cycle) {
        assert.equal(cycle.matchId, scope.matchId, '禁止领取其他比赛周期');
        assert(cycle.state === 'pending' && cycle.attempt === 0 && !cycle.requestId && !attempted.has(cycle.id), '禁止重试或接管既有研究');
        attempted.add(cycle.id);
        await ports.guard();
        await ports.execute({ id: cycle.id, attempt: 1 });
      } else {
        await ports.advance(scope.matchId);
        const next = await ports.snapshot(scope.matchId);
        assert.equal(next.id, scope.matchId, '推进了其他比赛');
        if (next.state === 'running' && !next.pending.length && next.timeline?.phase !== 'live'
          && next.timeline?.status !== 'blocked' && next.timeline?.cursorAt === state.timeline?.cursorAt) {
          reason = 'replay_no_progress'; break;
        }
      }
    }
    if (ports.now() >= scope.deadlineAt) reason = 'runtime_limit';
    return { status: reason === 'replay_caught_up' ? 'caught_up' : 'stopped', reason, matchId: scope.matchId, cyclesAttempted: attempted.size };
  } finally {
    // 仅停止本次新比赛；不恢复共享队列或修改旧待办。
    if (ownsMatch) await ports.pause(scope.matchId);
  }
}
