import { createHash } from 'node:crypto';

export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function preservedMatch(detail) {
  return { id: detail.id, state: detail.state, startedAt: detail.startedAt, endedAt: detail.endedAt,
    protocol: fingerprint(detail.protocol), remaining: fingerprint(detail.remaining),
    agents: fingerprint(detail.agents.map(a => ({ id: a.id, state: a.state, reason: a.reason,
      account: a.account, remaining: a.remaining, cycles: a.cycles }))) };
}

export function replayProgress(detail) {
  const cycles = detail.agents.flatMap(a => a.cycles);
  const calls = cycles.flatMap(c => c.usage?.calls ?? []);
  const truncated = calls.some(c => c.error?.code === 'output_truncated' ||
    c.diagnostics?.finishReason === 'length' || c.diagnostics?.completion?.finishReason === 'length');
  const failed = cycles.find(c => ['failed', 'unknown_usage', 'cancelled'].includes(c.state));
  const attention = detail.agents.find(a => ['needs_attention', 'budget_exhausted'].includes(a.state));
  return { matchId: detail.id, state: detail.state, timeline: detail.timeline,
    cycles: cycles.length, succeeded: cycles.filter(c => c.state === 'succeeded').length,
    calls: calls.length, pendingCalls: calls.filter(c => c.state === 'reserved').length,
    truncated, stopReason: truncated ? 'output_truncated' : failed?.reason ?? attention?.reason ??
      (detail.timeline?.status === 'blocked' ? detail.timeline.reason ?? 'replay_blocked' : null),
    agents: detail.agents.map(a => ({ id: a.id, state: a.state, reason: a.reason,
      revision: a.account.revision, cash: a.account.cash, positions: a.account.positions,
      watchedSymbols: a.account.watchedSymbols, fills: a.account.fills.length })),
    firstFrameAt: detail.frames.at(0)?.at, lastFrameAt: detail.frames.at(-1)?.at };
}
